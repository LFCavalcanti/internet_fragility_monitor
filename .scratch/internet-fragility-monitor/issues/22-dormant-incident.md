# 22: Dormant Incident

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Um evento parado deixa de alarmar a página. Um Incident ativo sem atualização do Provider há mais de 30 dias continua listado no card, mas deixa de contar para o Provider Status, e volta a contar sozinho quando o Provider o atualiza. Os eventos da AWS no Oriente Médio param de deixar a AWS em Degraded. A regra vale para AWS, Azure, Google Cloud, IBM e Salesforce, e nasce junto com a regra única de dedução do estado a partir dos problemas abertos.

**Blocked by:** 18.

**Status:** ready-for-agent

- [ ] A dedução do estado é uma regra só para os Feeds sem estado geral: o pior entre os problemas abertos que não são Dormant Incidents, ou Operational
- [ ] Com exatamente 30 dias o Incident conta; com mais de 30 dias, não
- [ ] A data de referência é a última atualização publicada e, sem ela, a data de criação
- [ ] Um Dormant Incident continua nos Recent Incidents
- [ ] Uma atualização recente faz o Incident voltar a contar
- [ ] Uma manutenção em andamento Dormant não deixa o Provider em Maintenance nesses Feeds
- [ ] Na Salesforce, um impacto `major` aberto de um Dormant Incident não leva a Outage
- [ ] Com a fixture real da AWS e o relógio em 31/10/2026, os eventos do Oriente Médio não contam para o estado
- [ ] Statuspage.io e Heroku continuam seguindo o estado geral, sem a regra
- [ ] O limite de 30 dias existe num lugar só
