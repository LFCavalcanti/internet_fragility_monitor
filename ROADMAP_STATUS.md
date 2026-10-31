# Roadmap e status: Internet Fragility Monitor

Mantido pelo orquestrador (a sessão principal, na `main`). Agentes de ticket não editam este arquivo; ver `docs/agents/parallel-work.md`.

## 1. Concluído

| # | Ticket | Commit |
|---|---|---|
| 01 | [Atualização de dependências e `npm audit`](.scratch/internet-fragility-monitor/issues/01-upgrade-dependencies-and-audit.md) | `17c9609` |
| 02 | [Manutenção agendada não esconde mais problema](.scratch/internet-fragility-monitor/issues/02-scheduled-maintenance-no-longer-hides-problems.md) | `c252582` |
| 03 | [Falha de leitura vira Unreachable](.scratch/internet-fragility-monitor/issues/03-read-failure-becomes-unreachable.md) | `785afc7` |
| 05 | [Nova regra do Internet Health](.scratch/internet-fragility-monitor/issues/05-internet-health-new-rule.md) | `e0be78e` |
| 06 | [Stale Snapshot](.scratch/internet-fragility-monitor/issues/06-stale-snapshot.md) | `d97b0a4` |
| 04 | [Recent Incidents com uma regra só](.scratch/internet-fragility-monitor/issues/04-recent-incidents-single-rule.md) | `7f0e369` |
| 07 | [Catálogo no banco](.scratch/internet-fragility-monitor/issues/07-provider-catalog-in-database.md) | `5df46e3` |
| 08 | [Poll guiado pelo catálogo, com Probes](.scratch/internet-fragility-monitor/issues/08-poll-driven-by-catalog-with-probes.md) | `b777f34` |
| 09 | [Política de leitura única com a família Statuspage.io](.scratch/internet-fragility-monitor/issues/09-single-read-policy-statuspage-family.md) | `d04b264` |
| 10 | [Demais famílias na política única](.scratch/internet-fragility-monitor/issues/10-remaining-families-on-read-policy.md) | `c4b82fb` |
| 11 | [Feeds reais da Salesforce e da IBM](.scratch/internet-fragility-monitor/issues/11-salesforce-and-ibm-real-feeds.md) | `d706d3d` |
| 12 | [Probes para todos, vários Feeds e falha do monitor](.scratch/internet-fragility-monitor/issues/12-probes-for-all-multiple-feeds-monitor-failure.md) | `5536aa8` |
| 13 | [Módulo de Poll Recording contra SQLite real](.scratch/internet-fragility-monitor/issues/13-poll-recording-module-real-sqlite.md) | `52653a2` |
| 14 | [Identidade do Incident pela fonte](.scratch/internet-fragility-monitor/issues/14-incident-identity-by-source.md) | `75c7b99` |
| 15 | [Down de ponta a ponta](.scratch/internet-fragility-monitor/issues/15-down-end-to-end.md) | `81335c9` |
| 16 | [Retenção e limpeza do esquema](.scratch/internet-fragility-monitor/issues/16-retention-and-schema-cleanup.md) | `6c921f4` |
| 17 | [Política de Poll Schedule](.scratch/internet-fragility-monitor/issues/17-poll-schedule-policy.md) | `dfc6ab0` |
| 20 | [Card em inglês, com aviso no card Unreachable](.scratch/internet-fragility-monitor/issues/20-card-in-english-with-unreachable-notice.md) | `983afc8` |
| 21 | [Faxina depois do ciclo de arquitetura](.scratch/internet-fragility-monitor/issues/21-post-cycle-cleanup.md) | `9585fe3` |
| 19 | [Major Outage no topo da página](.scratch/internet-fragility-monitor/issues/19-major-outage-at-page-top.md) | `3d5341b` |
| 18 | [Leitor declara Maintenance e recebe a hora do Poll](.scratch/internet-fragility-monitor/issues/18-reader-declares-maintenance-and-receives-poll-time.md) | `494ad1c` |
| 22 | [Dormant Incident](.scratch/internet-fragility-monitor/issues/22-dormant-incident.md) | `230f060` |
| 23 | [Descarte do Poll por falha parcial do monitor](.scratch/internet-fragility-monitor/issues/23-partial-monitor-failure-discard.md) | `4defdd7` |
| 24 | [Major Providers chegam a Outage](.scratch/internet-fragility-monitor/issues/24-major-providers-reach-outage.md) | `70a9517` |
| 25 | [Leitor da Cloudflare com Core Services](.scratch/internet-fragility-monitor/issues/25-cloudflare-reader-with-core-services.md) | `b226c22` |

## 2. Ciclo atual: revisão de arquitetura (tickets 02–17)

Origem: `arvore-de-decisoes-2026-10-26-arquitetura.md` e as cinco specs em `.scratch/internet-fragility-monitor/`. Tickets marcados com **(esquema)** alteram o esquema do Drizzle ou criam migration.

| # | Ticket | Spec | Trilha | Bloqueado por |
|---|---|---|---|---|
| ~~02~~ | ~~Manutenção agendada não esconde mais problema~~ **(esquema)** | provider-status | T1 | — |
| ~~03~~ | ~~Falha de leitura vira Unreachable~~ | provider-status | T1 | 02 |
| ~~04~~ | ~~Recent Incidents com uma regra só~~ | provider-status | T1 | 02, 03 |
| ~~05~~ | ~~Nova regra do Internet Health~~ | provider-status | T2 | 02 |
| ~~06~~ | ~~Stale Snapshot~~ | provider-status | T2 | 05 |
| ~~07~~ | ~~Catálogo no banco~~ **(esquema)** | provider-catalog | T3 | 04, 06 |
| ~~08~~ | ~~Poll guiado pelo catálogo, com Probes para quem não tem Feed~~ | provider-catalog | T3 | 03, 07 |
| ~~09~~ | ~~Política de leitura única com a família Statuspage.io~~ | status-feed | T3 | 08 |
| ~~10~~ | ~~Demais famílias na política única~~ | status-feed | T3 | 09 |
| ~~11~~ | ~~Feeds reais da Salesforce e da IBM~~ **(esquema)** | status-feed | T3 | 09, 10 |
| ~~12~~ | ~~Probes para todos, vários Feeds e falha do monitor~~ | status-feed | T3 | 10, 11 |
| ~~13~~ | ~~Módulo de Poll Recording contra SQLite real~~ | poll-recording | T4 | 12 |
| ~~14~~ | ~~Identidade do Incident pela fonte~~ **(esquema)** | poll-recording | T4 | 13 |
| ~~15~~ | ~~Down de ponta a ponta~~ **(esquema)** | poll-recording | T4 | 14 |
| ~~16~~ | ~~Retenção e limpeza do esquema~~ **(esquema)** | poll-recording | T4 | 15 |
| ~~17~~ | ~~Política de Poll Schedule~~ | poll-schedule | T5 | 06, 13 |

## 2.1. Ciclo seguinte: pendências do ciclo de arquitetura (tickets 18–25)

Origem: `arvore-de-decisoes-2026-10-31-pendencias.md` e as quatro specs de 31/10/2026 em `.scratch/internet-fragility-monitor/`. O deploy espera este ciclo. Tickets marcados com **(esquema)** criam migration.

| # | Ticket | Spec | Trilha | Bloqueado por |
|---|---|---|---|---|
| ~~[18](.scratch/internet-fragility-monitor/issues/18-reader-declares-maintenance-and-receives-poll-time.md)~~ | ~~Leitor declara Maintenance e recebe a hora do Poll~~ | declared-severity | T6 | — |
| ~~[19](.scratch/internet-fragility-monitor/issues/19-major-outage-at-page-top.md)~~ | ~~Major Outage no topo da página~~ | major-outage | T7 | — |
| ~~[20](.scratch/internet-fragility-monitor/issues/20-card-in-english-with-unreachable-notice.md)~~ | ~~Card em inglês, com aviso no card Unreachable~~ | major-outage | T8 | — |
| ~~[21](.scratch/internet-fragility-monitor/issues/21-post-cycle-cleanup.md)~~ | ~~Faxina depois do ciclo de arquitetura~~ **(esquema)** | post-cycle-cleanup | T9 | — |
| ~~[22](.scratch/internet-fragility-monitor/issues/22-dormant-incident.md)~~ | ~~Dormant Incident~~ | declared-severity | T6 | 18 |
| ~~[23](.scratch/internet-fragility-monitor/issues/23-partial-monitor-failure-discard.md)~~ | ~~Descarte do Poll por falha parcial do monitor~~ | monitor-failure-discard | T10 | 18 |
| ~~[24](.scratch/internet-fragility-monitor/issues/24-major-providers-reach-outage.md)~~ | ~~Major Providers chegam a Outage~~ | declared-severity | T6 | 22 |
| ~~[25](.scratch/internet-fragility-monitor/issues/25-cloudflare-reader-with-core-services.md)~~ | ~~Leitor da Cloudflare com Core Services~~ **(esquema)** | declared-severity | T6 | 24 |

## 3. Execução em Paralelo (Trilhas)

Dentro de uma trilha a execução é **sequencial**, porque os tickets mexem nos mesmos arquivos. Trilhas diferentes podem rodar **em paralelo**, cada uma num agente com o seu worktree. Além disso, **nunca rodam dois tickets (esquema) ao mesmo tempo**, mesmo de trilhas diferentes, para o histórico de migrations ficar linear.

| Trilha | Sequência | Áreas de código |
|---|---|---|
| **T1 – Card e leitores** | ~~02~~ → ~~03~~ → ~~04~~ | leitores de status, card do Provider, módulo de Provider Status, leitura do Snapshot |
| **T2 – Visão geral** | ~~05~~ → ~~06~~ | página, hero, módulo de Internet Health |
| **T3 – Catálogo e Status Feed** | ~~07~~ → ~~08~~ → ~~09~~ → ~~10~~ → ~~11~~ → ~~12~~ | esquema do catálogo, leitores e registro de famílias, ponto de entrada do Poll |
| **T4 – Persistência** | ~~13~~ → ~~14~~ → ~~15~~ → ~~16~~ | gravação do Poll, leitura do Snapshot, esquema de Incidents e leituras |
| **T5 – Agendamento** | ~~17~~ | agendador, inicialização, atualização automática da página |
| **T6 – Gravidade declarada** | ~~18~~ → ~~22~~ → ~~24~~ → ~~25~~ | leitores, decisão de Provider Status, catálogo de famílias |
| **T7 – Topo da página** | ~~19~~ | módulo de Internet Health, topo da página, aviso de Stale |
| **T8 – Card** | ~~20~~ | card do Provider |
| **T9 – Faxina** | ~~21~~ | catálogo por migration, configuração de testes, teste da consulta da última leitura |
| **T10 – Descarte do Poll** | ~~23~~ | política de leitura, regra de descarte, operação de Poll |

### Colisões do ciclo 18–25

Análise de 31/10/2026, cruzando cada ticket com as áreas de código que ele altera.

- **18 bloqueia o 23:** os dois mexem na política de leitura e no tipo da leitura de um Feed. Depois do 18, o 23 não colide com o 22, que fica nos leitores.
- **22 vem antes do 24:** com a gravidade primeiro, a `main` ficaria com a AWS em Outage pelos eventos parados do Oriente Médio até a regra de Dormant Incident entrar.
- **19 e 20 não têm bloqueio:** o card não importa nada do módulo de Internet Health, e os textos do topo ficam todos no 19. Sem a T6, só falta o efeito real em produção, e o deploy espera o ciclo inteiro.
- **21 e 25 são (esquema):** nunca ao mesmo tempo. As ondas já garantem isso.
- **18 e 21 tocam a Poll Recording em pontos diferentes:** a regra do estado gravado e a consulta da última leitura. Conflito improvável; se houver, resolve no rebase.

### Por que há pouco paralelismo neste ciclo

Análise de colisão feita em 26/10/2026, cruzando cada ticket com as áreas de código que ele altera.

- **03 e 04** mexem nos mesmos leitores, no card e no módulo de Provider Status: sequenciais, mesmo sem dependência lógica entre eles.
- **07** muda a página (lê o catálogo), o Internet Health (Major Providers do banco) e a leitura do Snapshot. Colide com 04 e 06, então espera os dois.
- **10 e 11** parecem independentes, mas os dois registram famílias de Feed no mesmo ponto e mexem no mesmo diretório de leitores: sequenciais.
- **13** reescreve a gravação do Poll, chamada pelo mesmo ponto de entrada que 08 e 12 alteram: espera a trilha T3 terminar.
- **14, 15 e 16** são todos (esquema) e todos mexem no módulo de Poll Recording: sequenciais.
- **15 e 17** colidem no módulo de Internet Health (texto de Down e cadência), então 17 vai junto com 14.

### Ondas

Uma onda só começa quando os tickets da onda anterior de que ela depende estão integrados na `main`. No máximo 4 agentes por vez; o ciclo 02–17 nunca passou de 2, e a onda 15 usa os 4. Os agentes de ticket rodam como `ticket-implementer` (Opus, esforço médio), e o orquestrador acompanha os que estão rodando para pegar os travados ou sem ação há muito tempo (`docs/agents/parallel-work.md`, "Orchestrator role").

| Onda | Em paralelo | Trilhas |
|---|---|---|
| 1 | ~~**02**~~ (esquema) | T1 |
| 2 | ~~**03**~~, ~~**05**~~ | T1, T2 |
| 3 | ~~**04**~~, ~~**06**~~ | T1, T2 |
| 4 | ~~**07**~~ (esquema) | T3 |
| 5 | ~~**08**~~ | T3 |
| 6 | ~~**09**~~ | T3 |
| 7 | ~~**10**~~ | T3 |
| 8 | ~~**11**~~ (esquema) | T3 |
| 9 | ~~**12**~~ | T3 |
| 10 | ~~**13**~~ | T4 |
| 11 | ~~**14**~~ (esquema) | T4 |
| 12 | ~~**15**~~ (esquema) | T4 |
| 13 | ~~**16**~~ (esquema) | T4 |
| 14 | ~~**17**~~ | T5 |
| 15 | ~~**18**~~, ~~**19**~~, ~~**20**~~, ~~**21**~~ (esquema) | T6, T7, T8, T9 |
| 16 | ~~**22**~~, ~~**23**~~ | T6, T10 |
| 17 | ~~**24**~~ | T6 |
| 18 | ~~**25**~~ (esquema) | T6 |

No fim de cada onda, o orquestrador roda a suíte completa, o typecheck, o lint e o code review de dois eixos na `main`, conforme `docs/agents/parallel-work.md`.

### Registro das ondas

- **Onda 1 (fechada, 28/10/2026):** Ticket 02, commit `c252582`. Migrations `0001_incident_kind_and_scheduled_for` (esquema) e `0002_maintenance_incidents_to_kind` (dados); `_journal.json` linear, aplicadas numa cópia do `sqlite.db` e `drizzle-kit check` sem problemas. Na `main`: 114 testes passando, tsc limpo, lint sem erro novo (17 erros já existentes). Próxima: onda 2 (03, 05).
- **Onda 2 (fechada, 28/10/2026):** Tickets 05 (`e0be78e`) e 03 (`785afc7`), sem migrations. Na `main`: 156 testes passando, tsc limpo, lint sem erro novo (16 erros já existentes). O 06 começou assim que o 05 entrou, sem esperar o 03 (trilhas diferentes). Code review da onda 1 achou defeitos no 02 (Upcoming Maintenance sem relógio, `resolved_at` não limpo ao reabrir manutenção, nomes fora do glossário, regra de Incident encerrado triplicada); a correção vai num `fix(...) (Ticket 02)` antes do 04.
- **Onda 3 (fechada, 28/10/2026):** 04 integrado (`7f0e369`); na `main` 191 testes, tsc limpo, lint sem erro novo. Antes: 06 integrado (`d97b0a4`); code review do 06 feito. Correções pós-review das ondas 1–3, num agente só: `7edcfaa` (Ticket 02: Upcoming Maintenance com relógio, `resolved_at` limpo ao reabrir, regra única de Incident encerrado em `lib/incident-status.ts`, nomes do glossário), `3d98bad` (Ticket 05: nomes do módulo de Internet Health), `e71d499` (Ticket 06: hora do último Poll ignora leituras Unreachable, formatação UTC única em `lib/format-utc.ts`, tipo `HeroState`). Na `main`: 177 testes, tsc limpo, lint sem erro novo. 04 rodando depois das correções (mesmos arquivos). Decisões de produto pendentes para o usuário: Incidents gravados no card Unreachable com a última fase lida; card Unreachable sem Upcoming Maintenance; textos do hero com "major outage"/"Service Down"; Stale com banco vazio ("No Poll recorded yet."); aviso de Stale com português e inglês misturados.
- **Onda 4 (fechada, 28/10/2026):** Ticket 07, commit `5df46e3`. Migrations `0003_provider_catalog` (esquema) e `0004_provider_catalog_load` (dados); `_journal.json` linear, aplicadas numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Na `main`: 194 testes, tsc limpo, lint sem erro novo (15 erros já existentes). Nota para o deploy: `build:prod` agora só aplica migrations; conferir antes que a `__drizzle_migrations` de produção tenha só 0000–0002 deste repositório. Decisão do usuário: o RSS da AWS agrupa atualizações por evento (prefixo do `guid`), ativo até a AWS resolver; entra no Ticket 10 (registrado nos Comments dele). Próxima: onda 5 (08).
- **Onda 5 (fechada, 29/10/2026):** Ticket 08, commit `b777f34`, sem migrations. Agente sem travas (cerca de 10 min); rebase sobre `3447cae` sem conflito. Na `main`: 217 testes, tsc limpo, lint sem erro novo (15 erros já existentes). Code review do Ticket 07 feito nesta onda (sem defeito bloqueante); pendências registradas em `3447cae` (`ISSUES_ANNOTATION.md` 1.1 e 2.1, Comments do Ticket 10). Code review do Ticket 08 sem defeito bloqueante; pendências em `1171117`. Decisões do usuário (29/10/2026): a marca de "só acesso" continua no card Unreachable de Provider só com Probes; o `GLOSSARY.md` fica como está. Correções pós-review num agente só (cerca de 11 min, sem travas): `9f5741b` (Ticket 04: janela de Recent Incident em `lib/incident-status.ts`, `closedAtMs`, helper de tempo nos testes, teste renomeado com relógio fixo), `38dfd96` (Ticket 07: um tipo só de Snapshot em `lib/snapshot-reading.ts`, Major Provider como marca do item, testes de `getLatestStatus` no SQLite real, `$type<>` em `type` e `label`), `90af870` (Ticket 08: predicado único `isAccessOnly`, `SourceKind`, fontes agrupadas uma vez por Poll). Na `main`: 219 testes, tsc limpo, lint sem erro novo (15 erros já existentes). Próxima: onda 6 (09).
- **Onda 6 (fechada, 30/10/2026):** Ticket 09, commit `d04b264`, sem migrations. Agente sem travas (cerca de 8 min). Na `main`: 270 testes, tsc limpo, lint sem erro novo (15 erros já existentes). Code review dos dois eixos sem defeito: nenhuma violação dura nem implementação errada. Até o Ticket 10, as famílias legadas seguem sem timeout (uma delas travada segura o Poll inteiro) e sem duração no log. Próxima: onda 7 (10).
- **Onda 7 (fechada, 30/10/2026):** Ticket 10, commit `c4b82fb`, sem migrations. Agente sem travas (cerca de 13 min). Code review: dois defeitos na marca de fim do RSS da AWS, corrigidos no `fix(feed)` seguinte a este ticket; demais achados são juízos ou decisões para o usuário (`ISSUES_ANNOTATION.md` 1.1). Lint caiu para 6 erros já existentes, todos em testes que o Ticket 13 apaga ou reescreve. Próxima: onda 8 (11).
- **Onda 8 (fechada, 31/10/2026):** Ticket 11, commit `d706d3d`. Migration `0005_activate_salesforce_ibm_feeds` (dados); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Agente sem travas (cerca de 22 min). Na `main` antes da correção: 366 testes, tsc limpo, lint sem erro novo (6 erros já existentes). Code review: categoria desconhecida da IBM, item sem `guid` e lista da Salesforce no limite, corrigidos no `fix(feed)` seguinte a este ticket. Próxima: onda 9 (12).
- **Onda 9 (fechada, 31/10/2026):** Ticket 12, commit `5536aa8`, sem migrations. Agente sem travas (cerca de 14 min). Na `main`: 405 testes, tsc limpo, lint sem erro novo (6 erros já existentes). Code review sem defeito que aconteça com o catálogo atual; achados distribuídos aos Tickets 13, 14 e 15 nos Comments do 12. O 13 mantém uma linha por Feed; o 15 passa para uma leitura por Provider. Próxima: onda 10 (13).
- **Onda 10 (fechada, 31/10/2026):** Ticket 13, commit `52653a2`, sem migrations. A primeira tentativa morreu quando a máquina desligou, em 4 minutos e só com leituras: nada a recuperar, worktree removido e agente relançado do zero com o mesmo prompt (cerca de 14 min, sem travas). Na `main`: 403 testes, tsc limpo, lint com 0 erros (os 6 antigos sumiram) e 3 avisos antigos. Code review: um defeito, Incident com título em branco recusava o Poll de todos os Providers, corrigido em `bd55c08`; aquele Feed agora fica não lido. No mesmo commit, `runPoll` e títulos de teste pelo glossário e tipos sem uso apagados. Depois da correção: 405 testes. Próxima: onda 11 (14). O 17, planejado junto do 14, ficou para depois do 16: o pedido da rodada foi "até o 16".
- **Onda 11 (fechada, 31/10/2026):** Ticket 14, commit `75c7b99`. Migration `0006_incident_identity` (esquema); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Agente sem travas (cerca de 14 min). Na `main`: 454 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review sem defeito bloqueante; termos do glossário nos testes e log de encerramento em `997681b`. Decisão pendente para o usuário em `ISSUES_ANNOTATION.md` 1.1: recorrência na AWS e na Azure apaga a ocorrência anterior do registro. Próxima: onda 12 (15).
- **Onda 12 (fechada, 31/10/2026):** Ticket 15, commit `81335c9`. Migration `0007_provider_reading` (esquema); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Agente sem travas (cerca de 14 min). `status_checks` passa a uma linha por Provider. Na `main`: 513 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review: Down segue a spec; comentários e Comments corrigidos em `6ae9ed5`. Decisão pendente para o usuário, a mais importante até aqui, em `ISSUES_ANNOTATION.md` 2.3: falha parcial da rede do monitor pode produzir Down falso. Próxima: onda 13 (16).
- **Onda 13 (fechada, 31/10/2026):** Ticket 16, commit `6c921f4`. Migration `0008_remove_response_time_severity` (esquema); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Agente sem travas (cerca de 10 min). Na `main`: 536 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review sem defeito funcional; teste de Provider inativo, comentários e pendências em `e4db712`. Primeira execução real desde o Ticket 13: `next build` limpo e `next start` sobre uma cópia migrada, com HTTP 200, as 38 fontes lidas, um Poll gravado com 13 linhas e Incidents com fonte e id. Com isso a trilha T4 terminou. Próxima: onda 14 (17).
- **Onda 14 (fechada, 31/10/2026):** Ticket 17, commit `dfc6ab0`, sem migrations. Agente sem travas (cerca de 7 min). Worktree ficou com a trava do agente depois do fim, sem processo nem alteração pendente: destravado e removido pelo orquestrador. Na `main`: 564 testes, tsc limpo, lint com 0 erros e 3 avisos antigos, build limpo. Code review sem defeito com a cadência atual; `1809840` tira `cadenceMs` de `decideInternetHealth` e faz uma cadência inválida derrubar a subida, em vez de deixar o monitor no ar sem agendamento. Execução real: `next start` sobre cópia migrada, Poll do boot e um Poll disparado pelo `node-cron` de verdade, ambos gravados.
- **Onda 15 (fechada, 31/10/2026):** Tickets 20 (`983afc8`), 21 (`9585fe3`), 19 (`3d5341b`) e 18 (`494ad1c`), os quatro agentes em paralelo, sem travas (de 3 a 7 min) e sem conflito de rebase. Migration `0009_github_site_url` (dados); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Na `main`: 599 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review: "Service Providers" continuava fora do glossário (story 12) e faltavam dois casos mistos de Major Provider, corrigidos em `011fc76` (601 testes). Mudanças visíveis decididas pelos agentes e mantidas: o rótulo "Global Status:" vira "Internet Health:" e o texto do hero aparece sempre, acima do destaque. Consequências do 18: as horas gravadas num Poll passam a ser as do começo dele (até cerca de 10 s antes), e um Feed desativado com manutenção aberta deixa de prender o Provider em Maintenance. Pendências: aviso no card Down em `ISSUES_ANNOTATION.md` 2.3; site do Provider sem nenhuma tela em 1.1. O comentário "dado velho" em `lib/provider-status.ts` fica para o code review da onda 16, porque o 23 mexe no mesmo bloco. Próxima: onda 16 (22, 23).
- **Onda 16 (fechada, 31/10/2026):** Tickets 22 (`230f060`) e 23 (`4defdd7`), sem migrations, agentes sem travas (cerca de 6 min cada) e sem conflito de rebase. Na `main`: 663 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review sem defeito de comportamento: `2d2226e` faz o teste de item resolvido da Azure usar um relógio perto da data dele, porque com relógio de 2026 ele passaria também pela regra de Dormant Incident; `6d8fb7b` tira "dado velho" do comentário. Com o Feed gravado, a AWS sai de Degraded para Operational, e os eventos do Oriente Médio continuam na lista. Mantidos, com os fatos conferidos: "evento" nos testes é o termo do Feed da AWS, usado pelas specs; Feed de família sem leitor conta como sem resposta HTTP, caso que não existe com o catálogo atual; redirect cujo destino falha conta como sem resposta HTTP (Comments do 23). Próxima: onda 17 (24).
- **Onda 17 (fechada, 31/10/2026):** Ticket 24, commit `70a9517`, sem migrations. Agente sem travas (cerca de 5 min). Na `main` antes das correções: 690 testes, tsc limpo, lint com 0 erros e 3 avisos antigos. Code review: os leitores seguem a spec, com dois defeitos corrigidos. `d6ce9ce` faz o destaque do hero citar o Incident ativo que mudou por último, porque ele citava o criado por último, mesmo Dormant: na volta dos Emirados, a página apontaria o Bahrein. `0b5ec2c` faz o título "Active" da Azure valer sobre "resolved" na descrição, que esconderia uma Outage. Depois das correções: 692 testes. Próxima: onda 18 (25).
- **Onda 18 (fechada, 31/10/2026):** Ticket 25, commit `b226c22`. Migration `0010_cloudflare_feed_family` (dados); `_journal.json` linear, aplicada numa cópia do `sqlite.db`, `drizzle-kit check` sem problemas, `sqlite.db` local migrado. Agente sem travas (cerca de 8 min). Na `main`: 776 testes, tsc limpo, lint com 0 erros e 3 avisos antigos, build limpo. Code review: um Incident `none` ou `maintenance` num Core Service marcado em falha levava a Cloudflare a Operational, corrigido em `c16bfdc`, com a definição de problema que conta num lugar só e o `GLOSSARY.md` atualizado em Core Service (779 testes). Decisão pendente em `ISSUES_ANNOTATION.md` 2.3: o destaque do topo pode citar outro Incident do Provider. Execução real: `next start` sobre cópia migrada, Poll do boot gravado com 13 linhas e HTTP 200; AWS e Cloudflare Operational, Internet Health em Healthy e os eventos parados da AWS ainda no card. Fim do ciclo 18–25.

### Onde paramos (31/10/2026)

Ciclo de pendências concluído: todos os tickets 18–25 integrados na `main`, com code review feito em todas as ondas. Antes, o ciclo de arquitetura (02–17) já estava fechado.

As duas decisões do `ISSUES_ANNOTATION.md`, seção 2.3, foram tomadas. Em aberto: o pedido da seção 3, ainda sem spec, e o deploy, com as ações da seção 2.1.
