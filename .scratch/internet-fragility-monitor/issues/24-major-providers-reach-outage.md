# 24: Major Providers chegam a Outage

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Uma queda grande da AWS, da Azure ou do Google Cloud aparece como Outage, e não como Degraded. Cada leitor informa a gravidade de cada problema: `SERVICE_OUTAGE` no Google Cloud, último título começando com "Service disruption" na AWS e qualquer problema aberto na Azure. A IBM segue Degraded, porque o Feed dela não publica gravidade, e a Salesforce passa pela mesma regra de dedução.

**Blocked by:** 22.

**Status:** done

- [x] O leitor informa a gravidade de cada problema publicado, usada só na leitura e sem gravação
- [x] Google Cloud: `SERVICE_OUTAGE` aberto é Outage; `SERVICE_DISRUPTION`, `SERVICE_INFORMATION` ou um valor novo são Degraded; encerrado não conta
- [x] AWS: última atualização "Service disruption" é Outage; "Service impact" depois de "Service disruption" é Degraded; qualquer outro título é Degraded; evento resolvido não conta
- [x] Azure: problema aberto é Outage
- [x] IBM: problema aberto continua Degraded
- [x] Salesforce: impacto `major` aberto é Outage e os demais casos são Degraded
- [x] Um Dormant Incident não conta, com qualquer gravidade
- [x] Testes com os payloads gravados de cada família

## Comments

**O que mudou.** Cada leitor passa o `severityOf` para `declaredByActiveIncidents`, a regra única do Ticket 22. Não há segunda dedução, e a gravidade não entra em `PublishedIncident`, então não é gravada.

- **Google Cloud:** o esquema passa a ler `status_impact`, e os ids com `SERVICE_OUTAGE` formam um conjunto consultado por `externalId`, como na Salesforce. O campo é opcional: sem ele, o problema é Degraded, o caso de "qualquer outro valor", e o Feed continua lido.
- **AWS:** `severityOf` olha o começo de `title`. O agrupamento não precisou mudar: `toFeedContent` ordena as atualizações por `pubDate` antes de agrupar, e `toIncident` já usa o título da última, então o `title` do Incident é a última atualização em qualquer ordem do Feed. A comparação é exata, "Service disruption" no começo do título, como a spec define.
- **Azure:** `() => "outage"`.
- **IBM:** segue o padrão, Degraded, com comentário no leitor dizendo por quê.
- **Salesforce:** não mudou. Passa pela regra desde o Ticket 22.

**Testes.** Em `feed-families.test.ts`, as variações de AWS e Google Cloud derivam das fixtures gravadas: na AWS, as atualizações de 15/09/2026 trocam de título, mantendo as "Service disruption" anteriores; no Google Cloud, Incidents reais são reabertos. A IBM ganhou em `salesforce-ibm.test.ts` o caso da captura real sem `Outage End`. A tabela de `dormant-incident.test.ts` ganhou AWS com "Service disruption", Google Cloud com `SERVICE_OUTAGE` e Salesforce com `major`, e a Azure passou a contar como Outage. Três testes da AWS e da Azure que esperavam Degraded mudaram de valor porque a regra mudou: a fixture da AWS em 01/10/2026 e os dois da Azure.

**Mudança visível.** Com problema aberto e não Dormant, o card da Azure passa de Degraded para Outage, e o da AWS e o do Google Cloud também, nos casos com "Service disruption" e `SERVICE_OUTAGE`. Os três são Major Providers, então o topo da página vai para Critical, com "Major Outage", onde antes ficava Unstable. Com os Feeds gravados de 31/10/2026 nada muda hoje: os eventos da AWS no Oriente Médio são Dormant e o Google Cloud só tem encerrados.

**Para depois.** Ticket 25: a Cloudflare não foi tocada.

**Migrations novas:** nenhuma.

**Code review da onda 17.** Com a gravidade, o destaque do hero passou a importar mais, e ele citava o Incident ativo criado por último, mesmo Dormant. Agora cita o que mudou por último, pela `updatedAt` da linha, que só muda com novidade publicada: sem gravar a gravidade, como pede a spec, e um Dormant Incident nunca passa à frente de quem conta. Fica uma imprecisão aceita: com dois Incidents que contam, o citado é o de novidade mais recente, mesmo que o outro seja o mais grave. Na Azure, um título "Active - ..." agora vale sobre a palavra "resolved" no texto da descrição, que fecharia o problema e esconderia a Outage.
