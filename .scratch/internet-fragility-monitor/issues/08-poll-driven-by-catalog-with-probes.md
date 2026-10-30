# 08: Poll guiado pelo catálogo, com Probes para quem não tem Feed

**Spec:** `spec-provider-catalog.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Cada Poll lê os Providers ativos e suas fontes ativas no banco e monta o leitor de cada Feed pela família, com a URL do catálogo. Um Feed de família desconhecida vira Feed não lido, com registro no log. Oracle, Salesforce e IBM, que ainda não têm Feed ativo, passam a rodar Probes (status page e login): aparecem Operational com a marca "verificação de acesso, sem feed de status" quando algum Probe responde. O leitor de ping é apagado.

**Blocked by:** 03 e 07.

**Status:** done

- [x] O Poll monta os leitores a partir do catálogo; nenhuma URL de Feed fica fixa no código
- [x] Família desconhecida resulta em Feed não lido e registro no log, sem derrubar o Poll
- [x] Probes contam qualquer resposta abaixo de 500 como de pé (inclusive 302 e 403); timeout, erro de rede e 5xx como falha
- [x] O módulo de Provider Status aplica a regra de Provider só com Probes, e o card mostra a marca de "só acesso"
- [x] Um Provider só com Probes nunca aparece em Degraded, Outage ou Maintenance
- [x] O leitor de ping é apagado
- [x] Testes: Provider inativo não é lido; família desconhecida; regra de Provider só com Probes no módulo

## Comments

**O que mudou**

- `lib/fetchers/index.ts`: `fetchAllStatuses()` é o Poll guiado pelo catálogo. A cada rodada lê os Providers ativos (`getActiveProviders`) e as fontes ativas deles (`getActiveSources`, novo em `lib/dao.ts`, com join no Provider ativo). Com Feed ativo, monta o leitor pela família (`FEED_READERS`) com a URL do catálogo; sem Feed, roda os Probes. Provider inativo não é lido nem gravado em `status_checks` (fecha o item 2.2 "Provider inativo ainda lido" do `ISSUES_ANNOTATION.md`).
- Família desconhecida, ou conhecida sem leitor (Salesforce e RSS da IBM, cujos leitores são do Ticket 11), vira Feed não lido: o Provider fica Unreachable, `console.error` cita o id da fonte e a família, e o Poll segue com os demais.
- Os leitores (AWS, Azure, Google Cloud, Heroku, Statuspage.io) recebem `providerId` e URL no construtor. As cópias fixas `cloudflare.ts`, `github.ts`, `vercel.ts` e o leitor de ping `ping.ts` foram apagados.
- `lib/fetchers/probe.ts`: Probe por GET sem seguir redirecionamento (`redirect: "manual"`, para que o 302 do próprio endereço conte), `cache: "no-store"` e timeout de 5 s (o mesmo do ping; o timeout de 10 s por Provider Source da política de leitura é do Ticket 09). Abaixo de 500 conta como de pé; timeout, erro de rede e 5xx como falha. Basta um Probe responder.
- O resultado só de Probes leva `accessOnly: true` em `StatusResult`, e `saveStatusResult` não mexe nos Incidents gravados dele: Probe não declara Incidents, então nada é encerrado por "ter saído do Feed".
- Módulo de Provider Status: a decisão ganha `accessOnly` (marca de "só acesso"), ligada quando o Provider não tem Feed.
- `lib/snapshot-reading.ts` (novo, puro): `toProviderStatusInput` monta a entrada do módulo a partir do Snapshot. `getLatestStatus` passa a trazer `hasFeed` por Provider (Feed ativo no catálogo). Sem Feed, vai `feeds: []` e `probes: [respondeu]`; um estado declarado gravado antes não conta, então um Provider só com Probes nunca aparece em Degraded, Outage ou Maintenance. A página usa essa função no lugar do mapeamento inline.
- Card: mostra "verificação de acesso, sem feed de status" abaixo do estado quando `decision.accessOnly`.

**Escolhas registradas**

- A marca de "só acesso" acompanha o Provider sem Feed também quando ele está Unreachable (nenhum Probe respondeu): ela descreve de onde vem o estado, e a história 21 fala de "um Provider que só tem Probes". Nesse caso o card mostra também "Não foi possível ler a status page".
- Um Provider só com Probes não exibe Recent Incidents: sem Feed, não há quem declare ou encerre Incidents, e os gravados antes (de quando havia Feed) seriam dado velho. Hoje Oracle, Salesforce e IBM não têm Incidents gravados (eram lidos pelo ping).
- Com vários Feeds ativos no mesmo Provider, só o primeiro (por id) é lido e os demais vão ao log como ignorados; vários Feeds são do Ticket 12. A carga atual tem no máximo um Feed ativo por Provider.
- Os textos da marca seguem a spec (em português), como os demais textos já citados no item 1.1 "Português e inglês misturados na tela" do `ISSUES_ANNOTATION.md`.
- Down continua fora (Ticket 15): Provider só com Probes sem resposta fica Unreachable. Probes de Providers com Feed ativo não rodam (Ticket 12).

**Costuras de teste**

- Poll (`fetchAllStatuses` + `saveStatusResult`, como o cron roda) no SQLite em memória com as migrations reais, com a rede simulada por `fetch`: `__tests__/lib/poll-catalog.test.ts` (Provider inativo, Feed inativo, URL vinda do catálogo, família desconhecida, Probes com 200/302/403/404/499, 500/503, erro de rede, timeout, um Probe basta, Incidents preservados).
- Snapshot até o módulo (`getLatestStatus` + `toProviderStatusInput` + `decideProviderStatus`) no banco real: `__tests__/lib/snapshot-catalog.test.ts`.
- Módulo puro (`accessOnly`) e card (marca exibida).
- Testes descartados: o caso do ping em `read-failure.test.ts` (o leitor foi apagado; a falha de Probe está no teste do Poll) e o das cópias fixas de Cloudflare, GitHub e Vercel, reescrito com o leitor da família recebendo a URL.

**Esquema e migrations:** nenhuma.
