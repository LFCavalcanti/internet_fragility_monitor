# Spec: Status Feed com política de leitura única e um leitor por família

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-26-arquitetura.md`, seções 4, 8, 9 e 10. Terceira das cinco specs.

**Depende de:** `spec-provider-status.md` (estados, Partial Reading, regra de Down) e `spec-provider-catalog.md` (Provider Sources, famílias e URLs no banco).

## Problem Statement

A leitura das status pages está copiada em nove arquivos. Cada leitor repete a mesma busca, a medição de tempo, a checagem de resposta e o tratamento de erro, e quatro deles são cópias quase linha a linha. O conteúdo recebido é tratado sem nenhum tipo, o que concentra 26 erros de lint.

Só a verificação de acesso tem timeout. Uma status page travada segura o Poll inteiro, porque a rodada espera todos os Providers juntos. Os Providers sem Feed são lidos por um simples acesso ao site, que não diz se o Provider declarou algum problema, embora a Salesforce e a IBM publiquem feeds de verdade. E não há como distinguir "não conseguimos ler a status page" de "nada do Provider responde", que é o pior desastre possível.

## Solution

Um módulo de Status Feed concentra a política de leitura: timeout de 10 segundos por Provider Source, resultado independente por fonte, duração registrada no log e validação do conteúdo recebido. Cada família de Feed vira um leitor pequeno que só interpreta o conteúdo e o traduz para o vocabulário do domínio. Os Probes de todos os Providers passam a rodar, Salesforce e IBM ganham leitores reais, e um Poll em que nenhum Provider responde é descartado como falha do próprio monitor.

## User Stories

1. Como visitante, quero que uma status page lenta não atrase os outros cards, para ver o estado de todos os Providers a cada Poll.
2. Como visitante, quero que um Provider cuja status page estourou o tempo apareça Unreachable naquele Poll, e não Outage.
3. Como visitante, quero ver o estado da Salesforce e da IBM declarado pelos próprios feeds, e não só pelo acesso ao site.
4. Como visitante, quero que um Provider com vários Feeds mostre o pior estado entre eles, para não perder um problema declarado em um só.
5. Como visitante, quero ver os Incidents de todos os Feeds de um Provider juntos no card.
6. Como visitante, quero ver a marca de Partial Reading quando um dos Feeds de um Provider não pôde ser lido.
7. Como visitante, quero que manutenções sejam classificadas pelo que o Feed declara, para que um título com a palavra "maintenance" não engane o monitor.
8. Como visitante, quero que a queda da conexão do próprio monitor não declare todos os Providers em Down, para não ver um SEV0 global falso.
9. Como mantenedor, quero que a política de leitura exista uma vez, para mudar timeout ou tratamento de erro num lugar só.
10. Como mantenedor, quero adicionar um Provider de família já suportada só com uma migration de catálogo, sem código novo.
11. Como mantenedor, quero adicionar uma família nova escrevendo só a interpretação do conteúdo dela.
12. Como mantenedor, quero que o conteúdo de cada Feed seja validado contra o formato esperado, para que uma mudança do Provider vire Feed não lido e registro no log, e não um erro silencioso.
13. Como mantenedor, quero ver no log a duração de cada leitura, para diagnosticar timeouts.
14. Como mantenedor, quero que cada Incident lido traga a Provider Source de origem e o id que o Feed dá a ele, para a spec de Poll Recording identificá-lo.
15. Como mantenedor, quero que os Probes considerem de pé qualquer resposta abaixo de 500, inclusive redirecionamento e 403, porque páginas de login bloqueiam robôs.
16. Como mantenedor, quero testar cada família com payloads reais gravados, sem rede.
17. Como mantenedor, quero testar timeout e respostas 5xx sem esperar a rede de verdade.
18. Como mantenedor, quero que os leitores copiados sejam apagados, para não haver duas versões da mesma regra.

## Implementation Decisions

- **Módulo de Status Feed.** Recebe os Providers ativos com suas fontes ativas e devolve, para cada Provider, a leitura de cada Feed (lida ou não, estado declarado, Incidents) e o resultado de cada Probe. Essa é exatamente a entrada que o módulo de Provider Status espera.
- **Política de leitura, aplicada a toda Provider Source.** Timeout de 10 segundos. Uma fonte que falha não afeta as outras, nem as do mesmo Provider. A duração e o resultado de cada leitura vão para o log. O tempo de resposta deixa de fazer parte do resultado.
- **Leitores por família.** Statuspage.io, RSS da AWS, RSS da Azure, Google Cloud, Heroku, Salesforce e RSS da IBM. Cada leitor recebe o conteúdo já obtido pela política e devolve estado declarado e Incidents. O conteúdo é validado com schemas do Zod, que já é dependência do projeto, e os tipos `any` somem.
- **Classificação de manutenção pelo Feed.** Cada família informa se um item é problema ou manutenção e a fase dele, pela estrutura do próprio Feed: a lista de manutenções da Statuspage.io, o endpoint de manutenções da Salesforce e os equivalentes de cada família. A heurística de texto não volta.
- **Identidade do Incident.** Cada Incident lido carrega a Provider Source de origem e o id publicado pelo Feed: `id` na Statuspage.io, no Google Cloud, na Heroku e na Salesforce; `guid` nos RSS. O título só é usado quando o Feed não publica id.
- **Probes.** Rodam para todos os Providers ativos a cada Poll. Qualquer resposta HTTP abaixo de 500 conta como de pé; timeout, erro de rede ou 5xx contam como falha.
- **Falha do próprio monitor.** Se nenhuma fonte de nenhum Provider ativo respondeu, o Poll é descartado: nada é gravado e o problema vai ao log. Se persistir, o Snapshot vira Stale Snapshot pelas regras da spec de Provider Status.
- **Migration de catálogo.** Ativa os Feeds da Salesforce e da IBM.
- **Remoção.** Os leitores atuais, inclusive o de ping, são substituídos e apagados.

## Testing Decisions

- **Um bom teste aqui** entrega ao módulo um catálogo de fontes e respostas de rede simuladas, e confere só a leitura devolvida: estados, Incidents com origem e id, resultados de Probes. Não testa como a busca foi feita por dentro.
- **Costura confirmada com o usuário (Q33):** payloads reais gravados de cada família e a rede simulada, incluindo timeout e 5xx.
- **Fixtures.** Um payload gravado por família, capturado das status pages reais, guardado junto aos testes. Para Statuspage.io, incluir o payload da Cloudflare com indicador `major` e manutenções agendadas, e um com manutenção em andamento.
- **Casos obrigatórios:** uma fonte em timeout não atrasa as outras; 5xx de Feed resulta em Feed não lido; Probe com 302 e com 403 conta como de pé; payload fora do formato resulta em Feed não lido; Provider com dois Feeds, um lido e outro não; Poll sem nenhuma resposta é descartado.
- **Prior art:** não há testes de leitores hoje. Os testes atuais de agendamento mostram como simular módulos no Vitest, mas aqui a simulação fica só na rede, que é a dependência externa.

## Out of Scope

- Gravar a leitura, reconciliar Incidents pela identidade e guardar se o Poll anterior ficou sem resposta: spec de Poll Recording. Até lá, a gravação continua casando Incidents pelo título e Down não ocorre.
- Juntar o mesmo incidente publicado em Feeds diferentes: a revisitar.
- Feed para a Oracle e notificação de Down.

## Further Notes

- Em 26/10/2026 a Salesforce respondeu em `api.status.salesforce.com/v1/incidents/active` e `.../v1/maintenances`, com ids numéricos. O RSS da IBM trouxe `guid` no formato `INC12259399`.
- Heroku e Azure estavam sem Incidents na verificação. O formato do id delas deve ser confirmado com payload real ao gravar as fixtures.
