# Spec: Provider Catalog no banco, com Provider Sources

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-26-arquitetura.md`, seções 6 e 8. Segunda das cinco specs. Decisão registrada em `docs/adr/0001-provider-catalog-no-banco-por-migrations.md`.

**Depende de:** `spec-provider-status.md`, que define os estados e as marcas que o catálogo alimenta.

## Problem Statement

Hoje o conjunto de Providers acompanhados existe em três cópias que divergem. Uma lista de leitores no código diz quem é lido. Outra lista no código diz nome, logo e endereços. A tabela de Providers no banco é sobrescrita a cada Poll com a lista do código. Elas se ligam por um id em texto: se divergirem, o card do Provider some da página sem nenhum erro.

O dono do monitor quer que o banco guarde as referências aos Providers acompanhados, e não o código. Também quer que um Provider possa ter várias fontes: vários Feeds e endereços de verificação de acesso, como a status page e a página de login do serviço. Hoje não há onde guardar isso, não há como parar de acompanhar um Provider sem apagar o histórico, e o script que tentava corrigir logos no banco está quebrado e seria sobrescrito de qualquer forma.

O deploy também gera migrations de esquema na hora do build, sem revisão.

## Solution

O banco passa a ser a única fonte do Provider Catalog. Cada Provider tem seus dados e uma lista de Provider Sources, cada uma um Feed ou um Probe. O código guarda só os leitores de cada família de Feed. A carga inicial dos 13 Providers e toda mudança futura entram por migrations de dados. Um Provider pode ser desativado, nunca apagado. O deploy só aplica migrations, que são geradas no desenvolvimento e commitadas.

## User Stories

1. Como dono do monitor, quero que os Providers acompanhados morem no banco, para que dado de configuração não fique preso ao código.
2. Como dono do monitor, quero registrar vários Feeds para um Provider, para ler o estado dele de mais de uma origem.
3. Como dono do monitor, quero registrar Probes da status page e da página de login de cada Provider, para que o monitor possa distinguir falha de leitura de queda real.
4. Como dono do monitor, quero marcar um Provider como inativo, para parar de acompanhá-lo sem perder Incidents e leituras antigas.
5. Como dono do monitor, quero marcar uma Provider Source como inativa, para tirar uma fonte com problema sem apagá-la.
6. Como dono do monitor, quero marcar quais Providers são Major Providers no catálogo, para mudar essa lista sem mexer em código.
7. Como dono do monitor, quero que cada mudança no catálogo seja uma migration versionada, para revisar a mudança e tê-la igual em todos os ambientes.
8. Como dono do monitor, quero definir a ordem em que os Providers aparecem na página, para manter os Major Providers no topo.
9. Como visitante, quero ver na página exatamente os Providers ativos do catálogo, sem cards sumindo por divergência de id.
10. Como visitante, quero ver o nome, o logo e o link da status page de cada Provider vindos do catálogo.
11. Como visitante, quero que a Oracle continue aparecendo, com a marca de "só acesso", até existir um Feed para ela.
12. Como mantenedor, quero que um Feed de família desconhecida pelo código deixe o Provider Unreachable e registre o problema no log, em vez de derrubar o Poll.
13. Como mantenedor, quero que o Poll leia o catálogo a cada rodada, para que uma migration de catálogo valha no Poll seguinte.
14. Como mantenedor, quero que o Poll não sobrescreva mais o catálogo, para que o banco seja de fato a fonte.
15. Como mantenedor, quero que os leitores recebam a URL do Feed vinda do catálogo, para que nenhum endereço de Feed fique fixo no código.
16. Como mantenedor, quero que o script quebrado de logos seja apagado, para não haver um caminho falso de mudar o catálogo.
17. Como responsável pelo deploy, quero que o build de produção só aplique migrations, para nunca gerar mudança de esquema sem revisão.
18. Como responsável pelo deploy, quero que a migration de carga funcione no banco de produção que já tem os 13 Providers, preservando os ids e o histórico ligado a eles.
19. Como mantenedor, quero testar a migration de carga num banco em memória, para confiar no catálogo antes do deploy.

## Implementation Decisions

- **Tabela de Providers.** Guarda id, nome, URL do site, URL da status page, tipo, logo, marcação de Major Provider, marcação de ativo e ordem de exibição. Os ids atuais são preservados, porque Incidents e leituras apontam para eles.
- **Tabela de Provider Sources, 1:n com Providers.** Cada fonte tem id, Provider, tipo (Feed ou Probe), família do Feed (só para Feeds), URL, rótulo curto (por exemplo "status page" ou "login") e marcação de ativa.
- **Famílias de Feed.** Os nomes de família são fixos e conhecidos pelo código: Statuspage.io, RSS da AWS, RSS da Azure, Google Cloud, Heroku, Salesforce e RSS da IBM. Separar RSS da AWS e da Azure só se o formato divergir é decisão do implementador, conferida com payload real.
- **Carga inicial por migration de dados.** Insere ou atualiza os 13 Providers e insere suas fontes conforme a tabela abaixo. Num banco que já tem os Providers, atualiza os campos sem trocar os ids.
- **Feeds da Salesforce e da IBM entram inativos.** Os leitores dessas famílias nascem na spec de Status Feed, que os ativa por migration. Até lá, Salesforce e IBM ficam só com Probes, como a Oracle.
- **Probes nesta spec.** O Poll passa a executar os Probes de Providers sem nenhum Feed ativo, substituindo o leitor de ping atual: qualquer resposta HTTP abaixo de 500 conta como de pé; timeout, erro de rede e 5xx contam como falha. Os Probes dos demais Providers passam a rodar na spec de Status Feed.
- **Poll guiado pelo catálogo.** A cada Poll, lê os Providers ativos e suas fontes ativas e monta o leitor de cada Feed pela família, passando a URL do catálogo. Os leitores atuais passam a receber a URL. Família desconhecida resulta em Feed não lido e registro no log.
- **Página guiada pelo catálogo.** Lista os Providers ativos na ordem de exibição, com nome, logo e link vindos do banco. A lista de metadados no código e a função que sobrescrevia o banco a cada Poll são removidas.
- **Major Providers vindos do banco.** A constante provisória do módulo de Internet Health é trocada pela marcação do catálogo.
- **Deploy.** O build de produção deixa de rodar a atualização e a geração de migrations e roda só a aplicação delas.
- **Script de logos apagado.**

### Carga inicial do catálogo

| Ordem | Id | Nome | Major | Feeds (família, ativo) | Probes |
|---|---|---|---|---|---|
| 1 | aws | AWS | sim | RSS da AWS `status.aws.amazon.com/rss/all.rss` | `health.aws.amazon.com/health/status`, `console.aws.amazon.com` |
| 2 | google-cloud | Google Cloud | sim | Google Cloud `status.cloud.google.com/incidents.json` | `status.cloud.google.com`, `console.cloud.google.com` |
| 3 | azure | Azure | sim | RSS da Azure `azure.status.microsoft/en-us/status/feed/` | `azure.status.microsoft/en-us/status`, `portal.azure.com` |
| 4 | cloudflare | Cloudflare | sim | Statuspage.io `www.cloudflarestatus.com` | `www.cloudflarestatus.com`, `dash.cloudflare.com` |
| 5 | vercel | Vercel | não | Statuspage.io `www.vercel-status.com` | `www.vercel-status.com`, `vercel.com/login` |
| 6 | github | GitHub | não | Statuspage.io `www.githubstatus.com` | `www.githubstatus.com`, `github.com/login` |
| 7 | jira | Jira | não | Statuspage.io `jira-software.status.atlassian.com` | `jira-software.status.atlassian.com`, `id.atlassian.com/login` |
| 8 | ibm-cloud | IBM Cloud | não | RSS da IBM `cloud.ibm.com/status/api/notifications/feed.rss` (inativo) | `cloud.ibm.com/status`, `cloud.ibm.com/login` |
| 9 | digital-ocean | DigitalOcean | não | Statuspage.io `status.digitalocean.com` | `status.digitalocean.com`, `cloud.digitalocean.com/login` |
| 10 | salesforce | Salesforce | não | Salesforce `api.status.salesforce.com/v1` (inativo) | `status.salesforce.com`, `login.salesforce.com` |
| 11 | oracle-cloud | Oracle Cloud | não | nenhum | `ocistatus.oraclecloud.com`, `www.oracle.com/cloud/sign-in.html` |
| 12 | hostinger | Hostinger | não | Statuspage.io `statuspage.hostinger.com` | `statuspage.hostinger.com`, `hpanel.hostinger.com` |
| 13 | heroku | Heroku | não | Heroku `status.heroku.com/api/v4/current-status` | `status.heroku.com`, `id.heroku.com/login` |

Todas as URLs usam HTTPS. Nome, URL do site, tipo e logo de cada Provider são os valores atuais da lista de metadados do código. Todos os Probes responderam com código abaixo de 500 em 26/10/2026.

## Testing Decisions

- **Um bom teste aqui** aplica as migrations reais num banco e confere o que ficou gravado, sem mockar o Drizzle.
- **Costura confirmada com o usuário (Q33):** a migration de carga aplicada num SQLite em memória, conferindo os 13 Providers, suas fontes, os quatro Major Providers, a ordem de exibição e os Feeds inativos de Salesforce e IBM.
- **Caso de banco existente:** aplicar as migrations anteriores, inserir os 13 Providers no formato antigo com um Incident ligado, aplicar a migration de carga e conferir que ids e Incident foram preservados.
- **Poll guiado pelo catálogo:** um Provider inativo não é lido, e um Feed de família desconhecida resulta em Feed não lido.
- **Testes que viram descarte:** o teste de que a função antiga chamava a gravação para cada item da lista do código.
- **Prior art:** não há teste com banco real no projeto. O InventPilot aplica as migrations reais num PGlite em memória (Ticket 311); aqui o equivalente é o libsql com banco em memória.

## Out of Scope

- Tela de administração do catálogo: adiada, conforme o ADR 0001.
- Leitores das famílias Salesforce e RSS da IBM, Probes de Providers com Feed, timeouts e Down: spec de Status Feed.
- Identidade de Incident por fonte: spec de Poll Recording.

## Further Notes

- **Suposição desta spec:** a ordem de exibição e o rótulo da fonte não foram discutidos na entrevista. A ordem preserva a da página atual, e o rótulo serve para os textos do card e do log.
- Qualquer mudança futura no catálogo, inclusive trocar um logo, é uma migration nova.
