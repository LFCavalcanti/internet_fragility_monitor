# 25: Leitor da Cloudflare com Core Services

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** A página deixa de ficar Critical quando só data centers da Cloudflare estão em falha, e um problema nos serviços que sustentam sites de terceiros passa a pesar como deve. A Cloudflare ganha uma família de Feed própria. O estado geral publicado por ela deixa de valer, e o Provider Status vem dos Incidents e dos serviços, pela tabela de classificação da spec, com sete Core Services: CDN/Cache, Firewall, Bot Management, Authoritative DNS, Recursive DNS, Network e Workers.

**Blocked by:** 24.

**Status:** ready-for-agent

**Ticket de esquema:** tem migration de dados, e não pode rodar junto do Ticket 21.

- [ ] Uma família `cloudflare` reaproveita a interpretação de `summary.json` da família Statuspage.io
- [ ] Uma migration de dados troca a família do Feed da Cloudflare, e o catálogo a reconhece
- [ ] Com o indicador `major` e só data centers em falha, a Cloudflare fica Operational, com fixture real capturada da status page
- [ ] Cada célula da tabela de classificação da spec tem teste
- [ ] Incident sem componente conta como Core Service, inclusive `minor`
- [ ] Incident que atinge um Core Service e data centers segue a coluna do Core Service
- [ ] Core Service em `partial_outage` ou `major_outage` sem Incident é Outage; em `degraded_performance` é Degraded; em `under_maintenance` não muda o estado
- [ ] Manutenção em andamento só de data centers não leva a Maintenance; em um serviço ou sem componente, leva
- [ ] As manutenções agendadas continuam na linha de Upcoming Maintenance
- [ ] Dormant Incident não conta para o estado da Cloudflare
- [ ] Core Service ausente do Feed ou impacto desconhecido resultam em Feed não lido, com registro no log
- [ ] Os outros Providers da família Statuspage.io continuam seguindo o indicador geral
