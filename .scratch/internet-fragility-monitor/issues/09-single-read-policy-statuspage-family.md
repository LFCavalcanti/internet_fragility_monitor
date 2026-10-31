# 09: Política de leitura única com a família Statuspage.io

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Nasce o módulo de Status Feed com a política de leitura: timeout de 10 segundos por Provider Source, resultado independente por fonte, duração registrada no log e validação do conteúdo com Zod. A família Statuspage.io passa a ser um leitor pequeno sobre essa política e atende os seis Providers dela; cada Incident lido traz a fonte de origem e o id publicado. Uma status page lenta não atrasa mais os outros cards.

**Blocked by:** 08.

**Status:** done

- [x] A política de leitura existe uma vez e é usada pela família Statuspage.io
- [x] Uma fonte em timeout vira Feed não lido sem atrasar as outras
- [x] O conteúdo da Statuspage.io é validado com Zod; conteúdo fora do formato vira Feed não lido com registro no log; os `any` dessa família somem
- [x] Cada Incident traz a Provider Source e o id do Feed
- [x] Os leitores copiados de Cloudflare, GitHub e Vercel e o leitor genérico antigo são apagados
- [x] O tempo de resposta deixa de fazer parte do resultado e vai só para o log
- [x] Fixtures reais da Statuspage.io (Cloudflare com indicador major e manutenções agendadas; uma com manutenção em andamento) e rede simulada com timeout e 5xx

## Comments

**O que mudou**

- Novo módulo `lib/status-feed/`. `read-policy.ts` é o único lugar que busca uma Provider Source: timeout de 10 s (`READ_TIMEOUT_MS`) do pedido ao fim do corpo, `cache: "no-store"`, nunca rejeita, e registra fonte, resultado e duração no log. Expõe `readFeed(fonte, leitor)`, que devolve o `FeedReading` do módulo de Provider Status, e `readProbe(fonte)`.
- `FeedReader` é a interface das famílias: `read(corpo)` valida com Zod e devolve estado declarado e Incidents com `externalId`; `address(urlDoCatálogo)` é opcional, para a família que monta o endereço. A política acrescenta `sourceId`, então o leitor não conhece a fonte. Sem construtor `(providerId, url)`: `lib/status-feed/readers/statuspage.ts` é um objeto `statuspageReader` (resolve, para esta família, o achado do review do Ticket 08). O corpo chega como texto para o RSS do Ticket 10 caber na mesma interface.
- `lib/status-feed/index.ts` substitui `lib/fetchers/index.ts` (`fetchAllStatuses` manteve o nome). `FEED_READERS` tem a Statuspage.io; `LEGACY_READERS` guarda AWS, Azure, Google Cloud e Heroku até o Ticket 10, que as passa para `FEED_READERS` e leva `lib/fetchers/types.ts` junto.
- Apagados: `lib/fetchers/statuspage.ts` (o leitor genérico antigo), `lib/fetchers/probe.ts` e `lib/fetchers/index.ts`. As cópias de Cloudflare, GitHub e Vercel já tinham saído no Ticket 08.
- `responseTime` saiu de `StatusResult`, dos quatro leitores restantes e de `saveStatusResult`/`getLatestStatus`. A coluna `response_time` fica, gravada como nulo, até o Ticket 16. O teste do card "não exibe o tempo de resposta" saiu: o campo não existe mais no resultado.
- `IncidentData` ganhou `sourceId` e `externalId` opcionais: ausentes nos Incidents vindos do banco até o Ticket 14 e nos leitores do Ticket 10.

**Escolhas registradas**

- Os Probes passam a usar a política: timeout de 5 s para 10 s, como a spec manda para toda Provider Source. Item "Probes com timeout de 5 s" removido do `ISSUES_ANNOTATION.md`.
- Os Feeds passam de `next: { revalidate: 60 }` para `cache: "no-store"`, o mesmo dos Probes: o Poll roda a cada 5 minutos e deve ver o estado atual.
- Validação estrita pela história 12: indicador, fase de problema e fase de manutenção são listas fechadas (as da API pública da Statuspage.io), `id`, `name` e `created_at` são obrigatórios, datas precisam ser válidas, e as listas `incidents` e `scheduled_maintenances` precisam existir. Antes, um indicador desconhecido virava Operational e uma lista ausente encerrava os Incidents gravados, sem aviso. Um item fora do formato deixa o Feed inteiro não lido, em vez de ser pulado.
- Uma família com id próprio não usa o título: na Statuspage.io o `id` é sempre publicado, então item sem id é conteúdo fora do formato.
- A duração registrada no log é a de cada fonte; a linha de sucesso vai a `console.log` e a de falha a `console.error`, com o erro.

**Fixtures** (em `__tests__/fixtures/status-feed/statuspage/`, coletadas em 30/10/2026 às 21:48 BRT, 31/10 00:48 UTC, dos `summary.json` reais; só `components` foi retirado, de fora e de cada item, para reduzir o tamanho)

- `cloudflare-major.json`: indicador `major` e 25 manutenções agendadas.
- `hostinger-incident.json`: Incident em `monitoring` e 4 manutenções agendadas.
- `zoom-maintenance-in-progress.json`: `status.zoom.us`, manutenção `in_progress`. Nenhum dos seis Providers tinha manutenção em andamento na coleta; a Zoom não é Provider do catálogo, mas é a mesma família, e a data com fuso `-07:00` também exercita o parser.

Os seis Feeds da família responderam 200 com `summary.json` válido na coleta. As fases sem exemplo real (`verifying`, `completed`, `postmortem`) têm um payload escrito à mão no teste, como antes.

**Costuras de teste:** `readFeed` e `readProbe` com a rede simulada (`__tests__/lib/status-feed/`) e o Poll no SQLite em memória com as migrations reais (`__tests__/lib/poll-catalog.test.ts`), inclusive timeout, 5xx, conteúdo inválido e fixtures reais até o banco. A linha de Statuspage.io de `read-failure.test.ts` saiu, coberta por essas duas.

**Observado, fica para o Ticket 13:** `createIncident` valida título até 500 e descrição até 5000 caracteres e lança; `runJob` só captura fora do laço, então um Incident com texto maior interromperia a gravação dos Providers seguintes daquele Poll. Nenhuma fixture chega perto. Vale tanto para a Statuspage.io quanto para as demais famílias; a transação e a validação são refeitas no Ticket 13.

**Esquema e migrations:** nenhuma.
