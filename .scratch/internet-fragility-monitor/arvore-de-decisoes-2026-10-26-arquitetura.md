# Árvore de decisões: os cinco aprofundamentos da revisão de arquitetura (grilling de 26/10/2026)

**Status:** árvore **fechada** em 26/10/2026 (`/grill-with-docs` em cinco rodadas, 36 perguntas; fronteira vazia). Specs escritas em 26/10/2026 (`/to-spec`), na ordem de implementação: `spec-provider-status.md`, `spec-provider-catalog.md`, `spec-status-feed.md`, `spec-poll-recording.md` e `spec-poll-schedule.md`. ADR: `docs/adr/0001-provider-catalog-no-banco-por-migrations.md`.

**Origem:** revisão de arquitetura de 26/10/2026 (`/improve-codebase-architecture`, relatório HTML fora do repositório), com cinco candidatos: Provider Status, Status Feed, Poll Recording, Provider Catalog e Poll Schedule. O usuário pediu uma spec por candidato.

Convenção: **Decidido** = entra nas specs; **Mantido** = fica como está; **Fora** = não entra nesta rodada. Termos do domínio conforme o `GLOSSARY.md`.

## 1. Diagnóstico (lido no código e no banco local, 26/10/2026)

- **Status decidido em quatro lugares.** Os fetchers cortam Incidents em 24h e transformam falha de leitura em Outage; a persistência assume Operational por padrão e corta em 5 Incidents; `app/page.tsx` calcula o status global com AWS, Google Cloud e Azure como "major"; `components/status-card.tsx` filtra em 48h e deixa Maintenance prevalecer.
- **Caso real de 26/10/2026.** A Cloudflare declarava "Partial System Outage" (indicador `major`), com um Incident ativo e 25 manutenções agendadas para 27 e 28/10. O card mostrava manutenção e o hero ignorava a Cloudflare.
- **Identidade por título falha.** As 25 manutenções da Cloudflare tinham só 22 títulos distintos; o banco local já tinha linhas duplicadas. Os feeds trazem id próprio: `id` na Statuspage e no GCP, `guid` no RSS da AWS. Heroku e Azure estavam sem Incidents na verificação.
- **Feeds dos provedores por ping.** A Salesforce tem API de incidentes com ids (`api.status.salesforce.com`) e a IBM tem RSS (`cloud.ibm.com/status/api/notifications/feed.rss`). Da Oracle não foi achado feed.
- **`update-logos.mjs` quebrado.** Importa `./lib/schema.js`, que não existe, e seria sobrescrito pelo cron a cada Poll.

## 2. Processo e estrutura

- **Estrutura do InventPilot (Decidido).** Pasta única `.scratch/internet-fragility-monitor/`, esta árvore, cinco specs `spec-<assunto>.md` e tickets em `issues/NN-slug.md` com numeração contínua. (Descartado: uma pasta por feature com `spec.md`.)
- **Ticket do upgrade vira o 01 (Decidido).** Movido para `issues/01-upgrade-dependencies-and-audit.md`; `docs/agents/issue-tracker.md` passa a descrever a convenção real.
- **Idioma (Decidido).** Termos do domínio em inglês, iguais à interface e ao código; glossário, árvore, specs e tickets em português.
- **Ordem (Decidido, reordenada na escrita das specs).** Provider Status, Provider Catalog, Status Feed, Poll Recording e Poll Schedule, cada spec dependendo das anteriores. A ordem aprovada na rodada 1 punha o catálogo em quarto; as decisões das rodadas 2 e 3 (Provider Sources no banco) fizeram Status Feed e Poll Recording dependerem da tabela de fontes, então o catálogo subiu para segundo.
- **ADR (Decidido).** O catálogo no banco, alterado só por migrations de dados, virou `docs/adr/0001-provider-catalog-no-banco-por-migrations.md`.

## 3. Provider Status

- **Cinco estados (Decidido).** Operational, Degraded, Outage, Maintenance e Unreachable. Unreachable descreve a leitura, não o Provider, e não é Outage. (Descartado: falha de leitura vira Outage.)
- **Maintenance (Decidido).** Só conta em andamento. Precedência Outage, Degraded, Maintenance, Operational: manutenção nunca esconde problema. A classificação vem do feed; a heurística de texto ("maintenance", "scheduled") sai.
- **Upcoming Maintenance (Decidido).** Manutenção futura não afeta o Provider Status. O card mostra uma linha com a quantidade e a data da próxima, com link para a status page.
- **Recent Incident (Decidido).** Incident ativo aparece sempre, de qualquer idade; resolvido aparece por 48h. Nenhum corte por quantidade esconde Incident ativo. (Descartados: corte de 24h nos fetchers; corte de 5 na persistência.)
- **Internet Health (Decidido).** Critical: um Major Provider em Outage, ou dois ou mais Providers em Outage. Unstable: qualquer outro Degraded ou Outage. Healthy: nenhum dos dois. Maintenance e Unreachable não contam. Major Providers: AWS, Google Cloud, Azure e Cloudflare. (Descartado: qualquer Outage isolado vira Critical.)
- **Card Unreachable (Decidido).** Cinza neutro, "Não foi possível ler a status page", sem último status conhecido, com os Recent Incidents gravados e suas datas.
- **Stale Snapshot (Decidido).** Snapshot com mais de três ciclos de Poll (15 minutos). A página mostra aviso, e o hero mostra um estado neutro "Sem leitura recente" com a hora do último Poll, no lugar de qualquer Internet Health, inclusive Critical.

## 4. Status Feed

- **Identidade do Incident (Decidido).** Provider mais o id publicado pelo próprio Provider; o título só como reserva para feed sem id.
- **Timeout (Decidido).** 10 segundos por status page; estourou, o Provider fica Unreachable naquele Poll e os outros seguem.
- **Salesforce e IBM (Decidido).** Ganham leitores de feed de verdade.
- **Oracle (Mantido).** Continua só com verificação de acesso até existir método melhor ("melhor alguma coisa do que nada").

## 5. Poll Recording

- **Histórico (Decidido).** Leituras guardadas por 90 dias e apagadas no próprio Poll; Incidents ficam para sempre.

## 6. Provider Catalog

- **Banco é a fonte do catálogo (Decidido).** Nome, logo, URLs, tipo, Major Provider e de onde ler. O código guarda só os leitores de cada família de feed. (Descartado: catálogo no código, com a tabela só como âncora.)
- **Carga por migration de dados (Decidido).** A carga inicial e cada mudança do catálogo são migrations versionadas, aplicadas pelo `db:migrate`. (Descartados: script de seed que reaplica uma lista do repositório; tela de administração nesta rodada.)
- **Marcação de ativo (Decidido).** Provider inativo sai dos Polls e da página, mantém o histórico; nunca se apaga Provider.
- **Deploy só com `migrate` (Decidido).** Sai `drizzle-kit up` e `generate` do `build:prod`; migrations são geradas no desenvolvimento e commitadas.
- **`update-logos.mjs` (Decidido).** Apagado.

## 7. Poll Schedule

- **Polls sobrepostos (Decidido).** O disparo é pulado quando o Poll anterior ainda roda, com registro no log. (Descartado: enfileirar.)

## 8. Provider Sources e Down (rodada 3)

- **Provider Sources já nesta rodada (Decidido).** Tabela 1:n ligada ao Provider, com dois tipos: Feed, que declara estado e informa a família, e Probe, que só testa acesso. Cada fonte tem URL e marcação de ativa. Um Provider pode ter **vários Feeds**, e o Provider Status de um Poll considera todos eles. (Descartado: colunas fixas de feed na tabela de Providers; deixar o 1:n para uma melhoria futura.)
- **Down (Decidido).** Sexto Provider Status: nenhum Provider Source responde, nem Feeds nem Probes. Observado pelo monitor, não declarado pelo Provider; o pior caso (SEV0). Precedência: Down, Outage, Degraded, Maintenance, Operational. Unreachable continua valendo quando nenhum Feed é lido mas algum Probe responde.
- **Falha do próprio monitor (Decidido).** Poll em que todos os Providers ativos falham é descartado: nada é gravado e o problema vai ao log. Se persistir, o Snapshot vira Stale Snapshot. (Descartado: declarar os 13 Providers Down.)
- **Confirmação (Decidido).** Down só depois de dois Polls seguidos sem resposta de nenhuma fonte; no primeiro, o card mostra Unreachable.
- **Resposta de Probe (Decidido).** Qualquer resposta HTTP abaixo de 500 conta como de pé, inclusive redirecionamento e 403. Falha: timeout de 10 segundos, erro de rede ou 5xx.
- **Down na página (Decidido).** Conta como Outage no Internet Health: um Major Provider em Down torna o hero Critical, com o texto "status page e serviço sem resposta". O card usa a cor mais forte da página, acima do vermelho de Outage, com "Sem resposta da status page nem do serviço".
- **Provider só com Probes, como a Oracle (Decidido).** Probes respondendo resultam em Operational, com a marca "verificação de acesso, sem feed de status" no card. Probes falhando por dois Polls resultam em Down. Nunca fica Degraded, Outage ou Maintenance.

## 9. Vários Feeds, testes e dados antigos (rodada 4)

- **Vence o pior (Decidido).** Com vários Feeds lidos, o Provider Status é o pior entre eles pela precedência; os Incidents de todos os Feeds se somam no card.
- **Leitura parcial (Decidido).** Se só parte dos Feeds responde, o status vem dos Feeds lidos e o card mostra a marca "1 de 2 feeds sem leitura". (Descartado: o Provider inteiro fica Unreachable.)
- **Identidade por fonte (Decidido, a revisitar).** Um Incident é identificado pelo Provider Source em que foi publicado mais o id que esse Feed dá a ele. O mesmo incidente publicado em dois Feeds aparece como dois Incidents; juntar entre Feeds fica para depois. O usuário quer revisitar este ponto.
- **Costuras de teste (Decidido).** Provider Status: testes puros com relógio recebido, sem jsdom nem banco; as regras hoje testadas no card migram para cá. Status Feed: payloads reais gravados de cada família e rede simulada, com timeout e 5xx. Poll Recording: SQLite em memória com as migrations reais. Provider Catalog: a migration de carga aplicada em SQLite em memória, conferindo os 13 Providers e suas fontes. Poll Schedule: relógio e disparo injetados, node-cron fora do teste. Os testes que só verificam mocks (dao, cadeia do Drizzle, db) são apagados.
- **Incidents antigos sem id (Decidido).** Reconciliação única: na primeira vez que um Incident com id aparece, ele assume a linha antiga, sem id e aberta, do mesmo Provider e mesmo título. As antigas abertas que ninguém assumir são resolvidas no fim desse Poll. O título só é chave nessa passagem.
- **Notificação de Down (Fora).** E-mail, webhook ou Slack para SEV0 é uma feature própria, com destinatários e regras contra repetição. Próxima melhoria.

## 10. Tempo de resposta (rodada 5)

- **Sai do Snapshot e da tela (Decidido).** Hoje é gravado em toda leitura e só aparece num ramo morto do card. Mede a nossa leitura, não o Provider, e perde o valor único com vários Provider Sources. Cada leitura de Provider Source registra a duração só no log, para diagnosticar timeouts.

## 11. Fora desta rodada

- Notificação de Down (seção 9).
- Tela de administração do Provider Catalog (seção 6).
- Juntar o mesmo incidente publicado em Feeds diferentes (seção 9, a revisitar).
- Feed de status da Oracle, enquanto não houver fonte (seção 4).
