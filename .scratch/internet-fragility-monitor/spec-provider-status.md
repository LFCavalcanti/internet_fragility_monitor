# Spec: Provider Status e Internet Health decididos num módulo só

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-26-arquitetura.md`, seções 3, 8, 9 e 10. Primeira das cinco specs da revisão de arquitetura de 26/10/2026.

**Depende de:** nenhuma. As specs seguintes (Provider Catalog, Status Feed, Poll Recording e Poll Schedule) alimentam este módulo com mais dados, sem mudar as regras dele.

## Problem Statement

Quem abre a página do Internet Fragility Monitor quer saber duas coisas: como está cada Provider e se a internet como um todo está frágil. Hoje a resposta é decidida em quatro lugares que se contradizem, e a página às vezes afirma o contrário do que os Providers declaram.

- **Manutenção esconde problema.** Em 26/10/2026 a Cloudflare declarava "Partial System Outage", com um Incident ativo, e tinha 25 manutenções agendadas para os dias seguintes. O card mostrava manutenção e o hero ignorava a Cloudflare. Basta uma manutenção, mesmo futura, para o card exibir manutenção e a página tirar o Provider do Internet Health.
- **Falha de leitura vira Outage.** Quando a status page não responde, o Provider aparece em Outage, como se tivesse declarado uma falha grave.
- **Incidents somem por regras de corte diferentes.** Os leitores cortam em 24 horas, a página corta nos 5 mais recentes e o card filtra em 48 horas e mostra no máximo 3. No Google Cloud, um Incident ativo há mais de 24 horas mantém o status degradado, mas desaparece da lista.
- **O Internet Health exagera.** Basta um Provider qualquer em Outage para o hero declarar Critical, e a Cloudflare não conta como Major Provider.
- **Dados velhos parecem atuais.** Se os Polls param, a página continua mostrando o último Snapshot como o estado de agora.
- **O card é impuro.** Ele chama o relógio durante a renderização, que é o único erro de lint que é bug de React.

## Solution

Um módulo de Provider Status passa a ser o único lugar que decide o estado de cada Provider, quais Incidents mostrar e qual é o Internet Health. A página e o card só exibem o que ele decide.

- Seis Provider Status com nome fixo: Down, Outage, Degraded, Maintenance, Operational e Unreachable. Os cinco primeiros seguem essa precedência. Maintenance nunca esconde Down, Outage ou Degraded.
- Maintenance só conta quando está em andamento. Manutenção agendada vira Upcoming Maintenance, que não afeta o estado e aparece numa linha discreta do card.
- Falha de leitura vira Unreachable, um card cinza e neutro, nunca Outage.
- Recent Incident tem uma regra só: ativo aparece sempre, resolvido aparece por 48 horas, e nenhum corte por quantidade esconde um Incident ativo.
- O Internet Health segue a regra nova de Critical, Unstable e Healthy, com AWS, Google Cloud, Azure e Cloudflare como Major Providers.
- Um Stale Snapshot troca o hero por um estado neutro, "Sem leitura recente", com a hora do último Poll.
- O relógio entra como parâmetro, e nada é calculado durante a renderização.

## User Stories

1. Como visitante, quero ver o Provider em Outage quando ele declara Outage, mesmo que tenha manutenções agendadas, para não ser enganado por um card de manutenção.
2. Como visitante, quero que manutenções agendadas apareçam numa linha discreta, com a quantidade e a data da próxima, para saber o que vem sem confundir com o estado atual.
3. Como visitante, quero ver Maintenance só quando a manutenção está em andamento, para saber que a instabilidade de agora é planejada.
4. Como visitante, quero que a linha de Upcoming Maintenance leve à status page do Provider, para conferir os detalhes lá.
5. Como visitante, quero ver um card cinza com "Não foi possível ler a status page" quando a leitura falha, para não confundir falha nossa com falha do Provider.
6. Como visitante, quero que o card Unreachable não mostre o último status conhecido, para não tomar dado velho por atual.
7. Como visitante, quero que o card Unreachable continue mostrando os Recent Incidents já gravados, com suas datas, para não perder o contexto que tínhamos.
8. Como visitante, quero ver um Provider em Down com a cor mais forte da página e o texto "Sem resposta da status page nem do serviço", para reconhecer o pior caso.
9. Como visitante, quero ver todo Incident ativo de um Provider, de qualquer idade, para não perder um problema longo.
10. Como visitante, quero ver Incidents resolvidos nas últimas 48 horas, para entender o que acabou de acontecer.
11. Como visitante, quero que os Incidents ativos venham antes dos resolvidos no card, para ver primeiro o que importa agora.
12. Como visitante, quero que o hero diga Critical quando um Major Provider está em Outage ou Down, para saber que uma parte grande da internet foi afetada.
13. Como visitante, quero que o hero diga Critical quando dois ou mais Providers quaisquer estão em Outage ou Down, para perceber uma falha espalhada.
14. Como visitante, quero que uma queda isolada de um Provider pequeno deixe o hero em Unstable, não Critical, para que Critical signifique algo.
15. Como visitante, quero que Maintenance e Unreachable não contem para o Internet Health, para que manutenção planejada e falha nossa não pintem a internet de frágil.
16. Como visitante, quero que o hero destaque "status page e serviço sem resposta" quando o caso for Down, para distinguir um desastre observado de uma falha declarada.
17. Como visitante, quero que o hero mostre "Sem leitura recente" com a hora do último Poll quando o Snapshot for um Stale Snapshot, para não confiar num estado antigo.
18. Como visitante, quero que esse estado neutro substitua até um Critical antigo, porque um Critical de horas atrás também engana.
19. Como visitante, quero um aviso na página quando o Snapshot estiver velho, para saber que os cards podem não refletir o agora.
20. Como visitante, quero ver a marca "1 de 2 feeds sem leitura" quando só parte dos Feeds de um Provider foi lida, para saber que o estado pode estar incompleto.
21. Como visitante, quero ver a marca "verificação de acesso, sem feed de status" num Provider que só tem Probes, para saber que o estado verde dele é só de acesso.
22. Como visitante, quero que um Provider só com Probes nunca apareça em Degraded, Outage ou Maintenance, porque só um Feed pode declarar esses estados.
23. Como mantenedor, quero que todas essas regras morem num módulo só, para corrigir uma regra num lugar e ver a correção na página e no card.
24. Como mantenedor, quero testar as regras sem renderizar componentes nem abrir banco, para ter testes rápidos e exatos.
25. Como mantenedor, quero que o relógio seja recebido pelo módulo, para testar janelas de tempo com datas fixas.
26. Como mantenedor, quero que o card não chame o relógio durante a renderização, para eliminar o erro de pureza do React.
27. Como mantenedor, quero que a regra de Down já exista no módulo, para que as specs de Status Feed e Poll Recording só precisem fornecer os dados.

## Implementation Decisions

- **Módulo de Provider Status, in-process e puro.** Recebe, para um Provider: as leituras de cada Feed (lida ou não, estado declarado, Incidents), os resultados dos Probes, se o Poll anterior também ficou sem resposta de nenhuma fonte, e o relógio. Devolve o Provider Status, os Recent Incidents em ordem, o resumo de Upcoming Maintenance (quantidade e data da próxima), a marca de Partial Reading e a marca de "só acesso".
- **Regras do Provider Status.**
  - Com Feeds lidos, vence o pior estado declarado entre eles pela precedência.
  - Se só parte dos Feeds foi lida, o estado vem dos lidos e a marca de Partial Reading é ligada.
  - Se nenhum Feed foi lido e algum Probe respondeu, o estado é Unreachable.
  - Se nenhuma fonte respondeu neste Poll e também no anterior, o estado é Down. Só neste Poll, é Unreachable.
  - Um Provider sem Feed, só com Probes, fica Operational com a marca de "só acesso" quando algum Probe responde, e segue a mesma regra de Down.
  - Maintenance em andamento só vence Operational.
- **Módulo de Internet Health, in-process e puro.** Recebe o resultado de cada Provider, quais são Major Providers, a hora do último Poll e o relógio. Devolve Healthy, Unstable, Critical ou o estado neutro de Stale Snapshot, mais o destaque do hero (Provider e Incident principais, ou a menção a vários Providers).
  - Down conta como Outage.
  - Stale Snapshot é um Snapshot com mais de três ciclos de Poll, hoje 15 minutos. A spec de Poll Schedule centraliza o valor do ciclo.
  - Enquanto o Provider Catalog não existir, os quatro Major Providers ficam numa constante deste módulo. A spec do catálogo troca a constante pela marcação no banco.
- **Vocabulário de Incident.** Um Incident ganha um tipo: problema ou manutenção. Problema tem os status investigating, identified, monitoring e resolved. Manutenção tem scheduled, in progress e completed, e guarda a data marcada para começar. Manutenção completed não aparece no card.
- **Mudanças mínimas nos leitores atuais, só para alimentar o vocabulário.** O leitor de Statuspage.io passa a classificar manutenção pela lista própria do feed e pela fase declarada nela, e a heurística de texto ("maintenance", "scheduled") sai. Os leitores deixam de cortar Incidents em 24 horas. Falha de leitura passa a resultar em Unreachable em vez de Outage. A reestruturação completa dos leitores é da spec de Status Feed.
- **Schema.** A tabela de Incidents ganha o tipo e a data marcada da manutenção. Uma migration de dados marca como manutenção os Incidents que hoje têm o status "maintenance" e lhes dá a fase completed; o Poll seguinte atualiza os que continuam no feed.
- **Leitura do Snapshot.** A leitura atual deixa de cortar nos 5 mais recentes. Ela traz, por Provider, os Incidents ativos, os resolvidos dentro da janela de Recent Incident e as manutenções agendadas.
- **Página e card só exibem.** A página monta a entrada dos dois módulos com a hora do servidor no momento da renderização e passa o resultado pronto ao hero e aos cards. O card perde a lógica de estado, a janela de 48 horas, o limite de 3 Incidents e o ramo morto que exibia o tempo de resposta. Os imports sem uso no card e na página saem.
- **Exibição.** Card cinza neutro para Unreachable. Cor mais forte da página, acima do vermelho de Outage, para Down. Todos os Incidents ativos aparecem; os resolvidos completam a lista até 3 itens.

## Testing Decisions

- **Um bom teste aqui** chama o módulo com entradas montadas à mão e um relógio fixo, e confere só a saída: o Provider Status, a ordem dos Incidents, as marcas e o Internet Health. Não olha detalhes internos nem ordem de chamadas.
- **Costura confirmada com o usuário (Q33):** testes puros com relógio recebido, sem jsdom e sem banco.
- **Casos obrigatórios:** o caso real da Cloudflare (Outage com 25 manutenções agendadas); Incident ativo do Google Cloud com mais de 24 horas; precedência completa; Partial Reading; Provider só com Probes; Unreachable no primeiro Poll sem resposta e Down no segundo; as três faixas do Internet Health, inclusive Down de Major Provider; Stale Snapshot substituindo Critical; resolvido com 47 e com 49 horas.
- **Testes do card encolhem para renderização.** Os casos de regra hoje testados no card (estado por cor, manutenção, janela de 48 horas, limite de 3) passam para os testes do módulo. O card fica com testes de que cada estado recebido aparece com o texto e a cor certos.
- **Prior art:** os testes de componente com Testing Library e jsdom já existentes para o card; os testes puros de validação, como exemplo de teste sem renderização.

## Out of Scope

- Ler Probes, vários Feeds por Provider e as famílias novas: spec de Status Feed.
- Guardar se o Poll anterior ficou sem resposta, que é o que habilita Down na prática: spec de Poll Recording. Até lá, um Provider sem resposta aparece como Unreachable.
- Major Providers vindos do banco: spec de Provider Catalog.
- Centralizar o ciclo de Poll: spec de Poll Schedule.
- Notificação de Down, juntar o mesmo incidente entre Feeds e feed para a Oracle.

## Further Notes

- **Suposição desta spec:** manutenção completed não aparece no card. A árvore definiu Recent Incident para problemas; mostrar dezenas de manutenções concluídas poluiria o card de Providers como a Cloudflare.
- Termos conforme o `GLOSSARY.md`.
