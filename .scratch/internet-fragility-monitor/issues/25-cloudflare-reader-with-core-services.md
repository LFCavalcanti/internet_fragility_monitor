# 25: Leitor da Cloudflare com Core Services

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** A página deixa de ficar Critical quando só data centers da Cloudflare estão em falha, e um problema nos serviços que sustentam sites de terceiros passa a pesar como deve. A Cloudflare ganha uma família de Feed própria. O estado geral publicado por ela deixa de valer, e o Provider Status vem dos Incidents e dos serviços, pela tabela de classificação da spec, com sete Core Services: CDN/Cache, Firewall, Bot Management, Authoritative DNS, Recursive DNS, Network e Workers.

**Blocked by:** 24.

**Status:** done

**Ticket de esquema:** tem migration de dados, e não pode rodar junto do Ticket 21.

- [x] Uma família `cloudflare` reaproveita a interpretação de `summary.json` da família Statuspage.io
- [x] Uma migration de dados troca a família do Feed da Cloudflare, e o catálogo a reconhece
- [x] Com o indicador `major` e só data centers em falha, a Cloudflare fica Operational, com fixture real capturada da status page
- [x] Cada célula da tabela de classificação da spec tem teste
- [x] Incident sem componente conta como Core Service, inclusive `minor`
- [x] Incident que atinge um Core Service e data centers segue a coluna do Core Service
- [x] Core Service em `partial_outage` ou `major_outage` sem Incident é Outage; em `degraded_performance` é Degraded; em `under_maintenance` não muda o estado
- [x] Manutenção em andamento só de data centers não leva a Maintenance; em um serviço ou sem componente, leva
- [x] As manutenções agendadas continuam na linha de Upcoming Maintenance
- [x] Dormant Incident não conta para o estado da Cloudflare
- [x] Core Service ausente do Feed ou impacto desconhecido resultam em Feed não lido, com registro no log
- [x] Os outros Providers da família Statuspage.io continuam seguindo o indicador geral

## Comments

**O que mudou.** Família `cloudflare` em `FEED_FAMILIES` e `FEED_READERS`, leitor em `lib/status-feed/readers/cloudflare.ts`, com a lista de Core Services. O leitor `statuspage` foi dividido sem mudar o comportamento: `summaryIncidents` interpreta as duas listas de `summary.json` e é usada pelos dois leitores, e o indicador geral é validado à parte, só no `statuspage`. Assim um indicador novo não derruba a leitura da Cloudflare, que o ignora, e um impacto novo não derruba os outros Providers da família, que não o leem.

**Regra única.** Problema sem gravidade na tabela e manutenção só de data centers ficam fora da lista passada a `declaredByActiveIncidents` e continuam em `incidents`, a lista devolvida ao card. Os Core Services marcados em falha somam com `worstDeclared`. `isDormant` passou a ser exportada de `problem-state.ts`; o limite de 30 dias continua só lá.

**Migration nova:** `drizzle/0010_cloudflare_feed_family.sql`, de dados, troca a família de `cloudflare-feed`. A URL e os outros Feeds não mudam. Os Incidents gravados mantêm a identidade, porque a Provider Source e os ids do Feed são os mesmos.

**Fixture real.** `__tests__/fixtures/status-feed/cloudflare/major-data-centers-only.json`, `summary.json` capturado em 31/10/2026 com um `curl`, sem alteração: indicador `major`, 0 Incidents, 25 manutenções agendadas, 131 serviços todos `operational` e 342 data centers em 7 grupos de regiões, 22 deles em `major_outage`, 38 em `degraded_performance` e 3 em manutenção. O payload já tinha o formato da spec, então nada foi derivado. Os casos da tabela são variações dele, com componentes reais. A fixture antiga `statuspage/cloudflare-major.json` fica como exemplo do formato com indicador `major` para a família Statuspage.io, e os testes dela agora usam a fonte do GitHub.

**Nomes conferidos no payload real.** Os sete Core Services existem com o nome exato da spec, uma vez cada, no grupo "Cloudflare Sites and Services" (`group: true`). Os componentes de um Incident vêm com `name` e `group_id`, então a classificação usa o próprio item.

**Escolhas tomadas, coerentes com a spec.**

- **Core Service marcado e com Incident ativo.** A regra de componente vale "sem Incident", então um Core Service atingido por um problema aberto e não Dormant segue a tabela: `minor` no CDN com o CDN em `partial_outage` é Degraded. Sem isso, a célula `minor` da tabela quase nunca valeria, porque a Statuspage.io costuma marcar o componente junto. A regra é por Core Service: outro Core Service marcado sem Incident conta, e soma pelo pior. Incident encerrado, Dormant ou sem componente não tira um Core Service da regra, e manutenção também não: ela não declara falha.
- **Incident em serviço fora dos Core Services e em data centers** segue a coluna do serviço, pelo mesmo raciocínio do caso escrito na spec para Core Service e data centers.
- **Estado desconhecido num Core Service** é Feed não lido, como impacto desconhecido: a regra não pode parar em silêncio. Estado novo em data center ou em outro serviço não importa, porque não é lido.
- **Grupo "Cloudflare Sites and Services" ausente** é Feed não lido, porque sem ele não há como separar serviço de data center.
- **Impacto de uma manutenção** não é validado: o que decide é o alcance.

**Testes de outros arquivos.** `healthyResponse` passou a responder a Cloudflare com o grupo e os sete Core Services, porque sem eles o Feed fica não lido. Em `poll-catalog`, o payload real atravessa o Poll: a Cloudflare grava Operational, e o GitHub, com o mesmo indicador `major`, grava Outage. Nas migrations, os casos que comparavam tudo depois de `migrateRest` passaram a descontar a troca da 0010, que tem teste próprio.

**Mudança visível.** Com o Feed de hoje, a Cloudflare sai de Outage para Operational, e a página deixa de ficar Critical por causa dela. As manutenções agendadas seguem na linha de Upcoming Maintenance.

**Para o deploy.** A linha gravada antes do deploy se corrige no primeiro Poll.
