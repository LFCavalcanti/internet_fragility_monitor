# 24: Major Providers chegam a Outage

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Uma queda grande da AWS, da Azure ou do Google Cloud aparece como Outage, e não como Degraded. Cada leitor informa a gravidade de cada problema: `SERVICE_OUTAGE` no Google Cloud, último título começando com "Service disruption" na AWS e qualquer problema aberto na Azure. A IBM segue Degraded, porque o Feed dela não publica gravidade, e a Salesforce passa pela mesma regra de dedução.

**Blocked by:** 22.

**Status:** ready-for-agent

- [ ] O leitor informa a gravidade de cada problema publicado, usada só na leitura e sem gravação
- [ ] Google Cloud: `SERVICE_OUTAGE` aberto é Outage; `SERVICE_DISRUPTION`, `SERVICE_INFORMATION` ou um valor novo são Degraded; encerrado não conta
- [ ] AWS: última atualização "Service disruption" é Outage; "Service impact" depois de "Service disruption" é Degraded; qualquer outro título é Degraded; evento resolvido não conta
- [ ] Azure: problema aberto é Outage
- [ ] IBM: problema aberto continua Degraded
- [ ] Salesforce: impacto `major` aberto é Outage e os demais casos são Degraded
- [ ] Um Dormant Incident não conta, com qualquer gravidade
- [ ] Testes com os payloads gravados de cada família
