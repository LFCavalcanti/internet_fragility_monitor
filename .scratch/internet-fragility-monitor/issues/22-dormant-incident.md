# 22: Dormant Incident

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Um evento parado deixa de alarmar a página. Um Incident ativo sem atualização do Provider há mais de 30 dias continua listado no card, mas deixa de contar para o Provider Status, e volta a contar sozinho quando o Provider o atualiza. Os eventos da AWS no Oriente Médio param de deixar a AWS em Degraded. A regra vale para AWS, Azure, Google Cloud, IBM e Salesforce, e nasce junto com a regra única de dedução do estado a partir dos problemas abertos.

**Blocked by:** 18.

**Status:** done

- [x] A dedução do estado é uma regra só para os Feeds sem estado geral: o pior entre os problemas abertos que não são Dormant Incidents, ou Operational
- [x] Com exatamente 30 dias o Incident conta; com mais de 30 dias, não
- [x] A data de referência é a última atualização publicada e, sem ela, a data de criação
- [x] Um Dormant Incident continua nos Recent Incidents
- [x] Uma atualização recente faz o Incident voltar a contar
- [x] Uma manutenção em andamento Dormant não deixa o Provider em Maintenance nesses Feeds
- [x] Na Salesforce, um impacto `major` aberto de um Dormant Incident não leva a Outage
- [x] Com a fixture real da AWS e o relógio em 31/10/2026, os eventos do Oriente Médio não contam para o estado
- [x] Statuspage.io e Heroku continuam seguindo o estado geral, sem a regra
- [x] O limite de 30 dias existe num lugar só

## Comments

**O que mudou.** `declaredByActiveIncidents` (`lib/status-feed/readers/problem-state.ts`) é a regra única dos Feeds sem estado geral: tira os Dormant Incidents, toma o pior entre os problemas abertos que sobraram (`worstDeclared`, a precedência que já existia) e só então aplica `withOngoingMaintenance`, também sem os Dormant. Sem problema que conte, Operational. AWS, Azure, Google Cloud, IBM e Salesforce a chamam com o `pollAt`. Statuspage.io e Heroku não mudaram: seguem o estado geral, sem a regra.

**Nome.** `declaredByOpenProblems` virou `declaredByActiveIncidents`, achado do code review da onda 15: a regra também devolve Maintenance, então o nome e a doc dizem que ela olha os Incidents ativos, problemas abertos e manutenções em andamento.

**Limite.** `DORMANT_AFTER_MS`, só em `problem-state.ts`. A comparação é `>`: com exatamente 30 dias o Incident conta. A referência é `updatedAt ?? createdAt`.

**Para os Tickets 24 e 25.** O terceiro argumento, `severityOf`, recebe cada problema publicado e devolve Outage ou Degraded (`ProblemSeverity`, que só existe na leitura e não entra em `PublishedIncident`, então não é gravado). O padrão é Degraded, o que todos menos a Salesforce usam por enquanto. A Salesforce mostra o uso: monta um conjunto com os ids dos incidentes com impacto `major` aberto e consulta por `externalId`. O Ticket 24 faz o mesmo no Google Cloud e na AWS, e a Azure passa `() => "outage"`. O Ticket 25 deixa de fora da lista o que a tabela diz que não muda o estado, inclusive as manutenções só de data centers, e usa `worstDeclared` para somar um Core Service em falha ao resultado.

**Salesforce.** A dedução própria saiu. A gravidade agora é por incidente, o que só muda o resultado com Dormant Incident: um `major` Dormant não leva a Outage. Incidente ativo sem impacto aberto continua Degraded.

**Fixture real da AWS.** Tem os dois eventos do Oriente Médio (`multipleservices-me-central-1` e `multipleservices-me-south-1`, última atualização em 15/09/2026). Em 31/10/2026 o Feed declara Operational e os dois seguem ativos na lista; em 01/10/2026 ainda declara Degraded. Até o Ticket 24, esse Degraded é o que os dois valem; depois, Outage, pelo título "Service disruption".

**Dados reais conferidos.** Na fixture da Salesforce, o `updatedAt` do incidente é mais novo que o último evento e o da manutenção `Active` acompanha o início dela (18:02 para início às 18:00), então é uma referência válida da última novidade.

**Testes.** `__tests__/lib/status-feed/dormant-incident.test.ts` é novo: leitor com payload e relógio fixo, conferindo só o estado declarado e os Incidents. `feed-families.test.ts` e `salesforce-ibm.test.ts` usavam `new Date()` na leitura, e com a regra o resultado passaria a depender do dia em que o teste roda: ganharam relógio fixo (31/10/2026), com a data da captura nas fixtures antigas de 2020 e 2024. O `start` dos testes da AWS foi de 01/10 para 20/10, para o evento não virar Dormant nesse relógio. O teste que exigia Degraded com a fixture da AWS virou os dois casos acima.

**Mudança visível.** Com o Feed atual da AWS, o card sai de Degraded para Operational e continua listando os dois eventos.

**Migrations novas:** nenhuma.
