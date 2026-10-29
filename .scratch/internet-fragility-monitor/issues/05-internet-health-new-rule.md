# 05: Nova regra do Internet Health

**Spec:** `spec-provider-status.md` · **Trilha:** T2 – Visão geral

**What to build:** O hero passa a seguir a regra nova: Critical quando um Major Provider está em Outage ou Down, ou dois ou mais Providers quaisquer estão em Outage ou Down; Unstable em qualquer outro Degraded, Outage ou Down; Healthy no resto. Maintenance e Unreachable não contam. A Cloudflare vira Major Provider. A regra sai da página para um módulo de Internet Health, e o hero recebe o destaque pronto.

**Blocked by:** 02.

**Status:** done

- [x] O módulo de Internet Health existe, é puro e recebe o relógio, os resultados dos Providers e a lista de Major Providers
- [x] Os quatro Major Providers ficam numa constante do módulo até o ticket 07
- [x] A página não decide mais o Internet Health; passa ao hero o resultado do módulo
- [x] O tipo duplicado do destaque do hero deixa de existir
- [x] Down tem destaque próprio no hero ("status page e serviço sem resposta"), ainda sem dados que o produzam
- [x] Testes do módulo cobrem as três faixas, Down de Major Provider, queda isolada de Provider pequeno (Unstable) e Maintenance e Unreachable fora da conta

## Comments

**Resumo (28/10/2026).**

- `lib/internet-health.ts`: módulo puro `decideInternetHealth({ providers, majorProviders, now })`. Cada entrada traz o id, nome, logo, o Provider Status decidido por `lib/provider-status.ts` e os Incidents a exibir. Devolve `{ status, description, highlight? }`: Critical quando um Major Provider está em Outage ou Down, ou dois ou mais Providers quaisquer estão em Outage ou Down; Unstable em qualquer outro Degraded, Outage ou Down; Healthy no resto. Down conta como Outage. Maintenance e Unreachable ficam fora da conta. O relógio é recebido, mas nenhuma regra deste ticket depende dele (o Stale Snapshot é do 06).
- `MAJOR_PROVIDERS` (AWS, Google Cloud, Azure, Cloudflare) é uma constante do módulo até o Ticket 07; a página a passa como entrada, e o módulo usa a lista recebida.
- Destaque do hero (`HeroHighlight`, exportado pelo módulo; os tipos duplicados da página e do hero saíram, e a ilustração usa `InternetHealthStatus`): o destaque mostra os Providers que levam à faixa. Em Critical, um só Provider em Outage ou Down aparece com seu Incident ativo; dois ou mais viram "Multiple Providers" com os nomes. Em Unstable, a queda isolada (Outage ou Down) é o destaque; sem ela, um Degraded sozinho aparece com o Incident, e vários viram "Multiple Providers".
- Down tem destaque próprio: tipo `down`, título "Service Down", texto "Status page e serviço sem resposta" (texto da árvore, seção 10, mantido em português como a spec cita), ícone ⛔ e borda vermelha forte. Na menção a vários Providers, um Provider em Down aparece com "(status page e serviço sem resposta)". Ainda não há dados que produzam Down (Ticket 15).
- O Incident do destaque é o primeiro problema ativo do Provider; sem nenhum, o destaque usa um texto genérico. A regra antiga caía no primeiro Incident da lista, que podia ser um resolvido; isso saiu.
- Página: monta a entrada com o nome e o logo do `providersList` e passa `health` ao hero, que só exibe. O import de `IncidentData` e o helper `isActiveProblem` saíram da página.
- Testes: `__tests__/lib/internet-health.test.ts` (as três faixas, Cloudflare como Major Provider, Down de Major Provider, dois Providers pequenos, queda isolada de Provider pequeno, Degraded de Major Provider, vários Degraded, Maintenance e Unreachable fora da conta, lista recebida vence a constante) e `__tests__/components/hero-section.test.tsx` (renderização sem destaque e com o destaque de Down).

**Migrations novas:** nenhuma.

**Fica para depois:** Stale Snapshot no módulo e no hero (Ticket 06); Major Providers vindos do catálogo (Ticket 07); Down produzido de ponta a ponta (Ticket 15).

**Correção pós-review das ondas 1 e 2 (28/10/2026).** Só renomes em `lib/internet-health.ts`, sem mudar o texto do hero: `ProviderHealthEntry` virou `ProviderSnapshotEntry` (o glossário evita "health" para Provider Status), `count` virou `providersPhrase` (devolve a frase "N provider(s) is/are") e `single` virou `singleHighlight`.
