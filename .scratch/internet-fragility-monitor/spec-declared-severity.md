# Spec: Gravidade declarada, com Major Providers em Outage, Dormant Incident e Core Services da Cloudflare

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-31-pendencias.md`, seções 1, 3 e 4. Primeira das quatro specs dessa árvore.

**Depende de:** nada novo. Parte do que `spec-status-feed.md` e `spec-provider-status.md` entregaram.

## Problem Statement

O site existe para mostrar o quanto a infraestrutura da internet está frágil, e hoje ele erra nos dois sentidos com os Major Providers.

Ele esconde o que é grave. Os leitores da AWS, da Azure e do Google Cloud só sabem dizer Operational ou Degraded. Se a AWS cai na Virgínia e metade da internet para, a status page dela publica o problema, o card mostra Degraded e a página fica Unstable. Critical só viria se nem a status page respondesse.

E ele alarma sem motivo. A Cloudflare cadastra cada cidade como componente da status page, e um único componente em falha total faz o estado geral virar `major`. Em 31/10/2026 havia 0 Incidents abertos, 0 de 131 serviços com problema, 21 de 342 data centers em falha e o indicador em `major`. O leitor traduz isso para Outage, e a página vai para Critical sem nenhum problema real.

Há ainda os eventos que não terminam. As regiões da AWS no Oriente Médio seguem abertas, com a última atualização em 15/09/2026. A AWS fica Degraded por meses sem nenhuma novidade, e um site que vive alarmado perde o valor.

## Solution

Cada Provider chega a Outage pelo que ele mesmo publica sobre a gravidade: o campo `status_impact` do Google Cloud, o começo do título na AWS e, na Azure, a própria existência de um problema aberto, porque a página pública dela só comunica problemas amplos.

Um Incident ativo sem atualização do Provider há mais de 30 dias vira Dormant Incident: continua listado no card e deixa de contar para o Provider Status.

A Cloudflare ganha um leitor próprio. O estado geral publicado por ela deixa de valer, os data centers sozinhos nunca mudam o estado, e o Provider Status vem dos Incidents, conforme atinjam ou não um dos sete Core Services.

## User Stories

1. Como visitante, quero que uma queda grande da AWS apareça como Outage, para entender que parte da internet está parada.
2. Como visitante, quero que uma queda grande do Google Cloud apareça como Outage, para não confundi-la com um problema parcial.
3. Como visitante, quero que um problema publicado pela Azure apareça como Outage, porque a página pública dela só traz problemas amplos.
4. Como visitante, quero que um problema menor da AWS continue Degraded, para distinguir lentidão de queda.
5. Como visitante, quero que um problema menor do Google Cloud continue Degraded, pelo mesmo motivo.
6. Como visitante, quero que a última atualização de um evento da AWS defina a gravidade dele, para ver o que a AWS diz agora, e não o que disse no começo.
7. Como visitante, quero que a página não fique alarmada por meses por um evento sem novidade, para confiar no alarme quando ele aparecer.
8. Como visitante, quero continuar vendo no card um Incident parado há mais de 30 dias, para saber que ele existe.
9. Como visitante, quero que um Dormant Incident volte a contar quando o Provider o atualizar, para não perder uma piora.
10. Como visitante, quero que a falha de um data center da Cloudflare não mude o estado dela, porque o tráfego vai para o data center vizinho e a internet segue normal.
11. Como visitante, quero que um problema declarado como `major` ou `critical` no CDN, no Firewall ou em outro Core Service deixe a Cloudflare em Outage, porque isso derruba sites de terceiros.
12. Como visitante, quero que um problema `minor` em Core Service deixe a Cloudflare Degraded, porque costuma ser regional.
13. Como visitante, quero que um problema `major` ou `critical` fora dos Core Services deixe a Cloudflare Degraded, porque atrapalha clientes dela, mas não derruba a internet.
14. Como visitante, quero que um problema `minor` fora dos Core Services só apareça na lista do card, sem mudar o estado da Cloudflare.
15. Como visitante, quero que um Incident da Cloudflare sem serviço indicado conte como Core Service, porque não dá para descartá-lo.
16. Como visitante, quero que um Core Service marcado em falha conte mesmo sem Incident publicado, porque o Incident pode demorar.
17. Como visitante, quero que uma manutenção que só atinge data centers não deixe a Cloudflare em Maintenance, porque é rotina.
18. Como visitante, quero que Providers que publicam um estado geral confiável continuem seguindo esse estado, porque é o que eles afirmam agora.
19. Como dono do monitor, quero que uma mudança no nome de um Core Service vire Feed não lido e registro no log, para a regra não parar de funcionar em silêncio.
20. Como dono do monitor, quero que um novo tipo de impacto no Feed da Cloudflare vire Feed não lido, pelo mesmo motivo.
21. Como mantenedor, quero a regra de Dormant Incident num lugar só, para mudar o limite de 30 dias sem procurar por leitor.
22. Como mantenedor, quero que cada leitor só informe a gravidade de cada Incident, e que a dedução do estado seja uma só.
23. Como mantenedor, quero testar cada regra com payloads reais gravados, sem rede.
24. Como mantenedor, quero testar a regra de 30 dias com um relógio fixo, sem depender da data de hoje.

## Implementation Decisions

- **Gravidade por Incident.** Nos Feeds sem estado geral (AWS, Azure, Google Cloud, IBM, Salesforce e Cloudflare), o leitor informa a gravidade de cada problema publicado: Outage ou Degraded. O estado declarado é deduzido por uma regra única, o pior entre os problemas abertos que não sejam Dormant Incidents, ou Operational se não houver nenhum. A gravidade só é usada na leitura e não é gravada.
- **Google Cloud.** `status_impact` igual a `SERVICE_OUTAGE` é Outage. Qualquer outro valor, inclusive `SERVICE_DISRUPTION`, `SERVICE_INFORMATION` e um valor novo, é Degraded.
- **AWS.** Título da última atualização do evento que começa com "Service disruption" é Outage. Qualquer outro título, como "Service degradation", "Service impact" ou "Informational message", é Degraded.
- **Azure.** Todo problema aberto é Outage. A documentação da Microsoft diz que a página pública só comunica problemas de impacto amplo ou casos em que o portal fica inacessível.
- **IBM.** Todo problema aberto continua Degraded: o Feed não publica gravidade.
- **Salesforce.** Um impacto `major` aberto continua sendo Outage, e os demais casos, Degraded. A diferença é que um Dormant Incident deixa de contar.
- **Dormant Incident.** O limite é de mais de 30 dias: com exatamente 30 dias, o Incident ainda conta. A data de referência é a última atualização publicada pelo Feed; sem ela, a data de criação, como acontece na Azure. A regra vale para os Feeds sem estado geral e para problemas e manutenções em andamento. O Incident continua nos Recent Incidents, e volta a contar sozinho quando o Provider o atualiza.
- **Providers com estado geral.** Na família Statuspage.io e na Heroku, o estado publicado pelo Provider prevalece, e a regra de Dormant Incident não se aplica. A Cloudflare deixa de pertencer a esse grupo.
- **Relógio na leitura.** O leitor passa a receber a hora do Poll, para decidir o que é Dormant Incident sem ler o relógio por conta própria. O leitor continua sem nada de rede.
- **Maintenance declarada pelo leitor.** O estado declarado passa a incluir Maintenance, e a regra de manutenção em andamento sai da decisão de Provider Status e vai para a leitura. É isso que permite a uma manutenção Dormant ou só de data centers não contar, sem gravar nada novo em cada Incident. A precedência não muda: Maintenance nunca prevalece sobre Down, Outage ou Degraded. As linhas gravadas antes do deploy se corrigem no primeiro Poll.
- **Família `cloudflare`.** Um leitor novo reaproveita a interpretação de `summary.json` da família Statuspage.io e ignora o indicador geral. Uma migration de dados troca a família do Feed da Cloudflare, conforme o ADR 0001. A lista de Core Services fica no leitor, porque só ele a usa.
- **Core Services da Cloudflare.** CDN/Cache, Firewall, Bot Management, Authoritative DNS, Recursive DNS, Network e Workers, pelo nome publicado no Feed. Nenhum componente se chama "WAF"; Firewall é o mais próximo.
- **Data center.** É todo componente fora do grupo "Cloudflare Sites and Services". Os outros grupos são regiões.
- **Classificação de um Incident aberto da Cloudflare.**

| Impacto declarado | Atinge um Core Service | Só serviços fora dos Core Services | Só data centers |
|---|---|---|---|
| `major` ou `critical` | Outage | Degraded | Não muda o estado |
| `minor` | Degraded | Não muda o estado | Não muda o estado |
| `none` ou `maintenance` | Não muda o estado | Não muda o estado | Não muda o estado |

- **Casos da classificação.** Um Incident sem nenhum componente conta como Core Service, inclusive para `minor`. Um Incident que atinge um Core Service e também data centers segue a coluna do Core Service. Um Incident fora do que a tabela muda continua na lista do card.
- **Core Service marcado em falha, sem Incident.** `partial_outage` ou `major_outage` é Outage. `degraded_performance` é Degraded. `under_maintenance` não muda o estado.
- **Manutenção da Cloudflare.** Uma manutenção em andamento só deixa a Cloudflare em Maintenance se atingir algum serviço ou não indicar componente. As agendadas continuam contando na linha de Upcoming Maintenance, como hoje.
- **Conteúdo inesperado da Cloudflare.** Um Core Service ausente do Feed ou um impacto desconhecido é conteúdo fora do formato: o Feed fica não lido, o card mostra Unreachable, e o problema vai ao log.
- **Glossário.** Major Outage, Dormant Incident e Core Service já estão no `GLOSSARY.md`.

## Testing Decisions

- **Um bom teste aqui** entrega um payload ao leitor, com um relógio fixo, e confere só o estado declarado e os Incidents devolvidos. Não testa como a gravidade foi calculada por dentro.
- **Costuras.** As que já existem: o leitor de cada família com payload gravado, e a decisão de Provider Status para a precedência. Nenhuma costura nova.
- **Fixtures.** Um payload real da Cloudflare com indicador `major` e nenhum Incident aberto, capturado da status page. Os casos da tabela podem ser variações desse payload, com Incidents baseados nos reais de outubro de 2026.
- **Casos obrigatórios:**
  - Google Cloud: `SERVICE_OUTAGE` aberto é Outage; `SERVICE_DISRUPTION` aberto é Degraded; `SERVICE_OUTAGE` encerrado não conta.
  - AWS: última atualização "Service disruption" é Outage; "Service impact" depois de "Service disruption" é Degraded; evento resolvido não conta.
  - Azure: problema aberto é Outage. IBM: problema aberto é Degraded.
  - Dormant Incident: 30 dias exatos conta, 31 dias não conta, e o Incident segue na lista devolvida. Uma atualização recente faz ele voltar a contar. Sem data de atualização, vale a de criação.
  - Com a fixture real da AWS, os eventos do Oriente Médio não contam para o estado, com o relógio em 31/10/2026.
  - Cloudflare: indicador `major` só por data centers é Operational; cada célula da tabela; Incident sem componente; Core Service em falha sem Incident; manutenção em andamento só de data centers é Operational; manutenção em andamento num serviço é Maintenance; Core Service ausente e impacto desconhecido resultam em Feed não lido.
  - Statuspage.io: outro Provider da família continua seguindo o indicador geral, e a manutenção em andamento continua dando Maintenance com indicador `none`.
- **Testes que mudam.** Os casos de Maintenance na decisão de Provider Status e nos leitores, porque a regra muda de lugar. A precedência continua testada.
- **Prior art:** os testes das famílias de Feed com payloads gravados e os testes da decisão de Provider Status com relógio fixo.

## Out of Scope

- Regras de gravidade por Provider além das daqui. Heroku vermelha só em Tools e Salesforce com `major` em uma instância continuam Outage, porque o monitor aceita o que o Provider declara.
- Core Services para outros Providers.
- Mudar quantos Providers levam a Critical e os textos da página: `spec-major-outage.md`.
- Retirar as manutenções agendadas de data centers da linha de Upcoming Maintenance.
- Tela de histórico e contagem de Incidents.

## Further Notes

- Fontes: [regra do estado geral do Statuspage](https://support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations/), [escopo da página pública da Azure](https://learn.microsoft.com/en-us/azure/service-health/azure-status-overview) e [queda da Cloudflare em novembro de 2025](https://blog.cloudflare.com/18-november-2025-outage/).
- Teste da classificação nos 50 Incidents mais recentes da Cloudflare, de 16 a 31/10/2026, sem dois Incidents muito longos: Outage duas vezes, 5,7 horas no total; Degraded por `minor` em Core Service, cerca de 13 horas; mais 5 Incidents `major` ou `critical` fora dos Core Services como Degraded.
- A classificação da Cloudflare é um julgamento, sem histórico para calibrar. O usuário vai acompanhá-la depois do deploy.
- A regra de Dormant Incident tem um efeito previsto: a AWS prometeu nova atualização sobre o Bahrein para o início de 2027. Se ela vier com título "Service disruption", a AWS volta a Outage e a página a Critical por até 30 dias, mesmo sem piora real.
- O último título da AWS vale mesmo que o evento melhore. Um título novo que a AWS passe a usar cai em Degraded até alguém o incluir na regra.
