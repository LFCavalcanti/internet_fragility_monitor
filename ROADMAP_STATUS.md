# Roadmap e status: Internet Fragility Monitor

Mantido pelo orquestrador (a sessão principal, na `main`). Agentes de ticket não editam este arquivo; ver `docs/agents/parallel-work.md`.

## 1. Concluído

| # | Ticket | Commit |
|---|---|---|
| 01 | [Atualização de dependências e `npm audit`](.scratch/internet-fragility-monitor/issues/01-upgrade-dependencies-and-audit.md) | `17c9609` |

## 2. Ciclo atual: revisão de arquitetura (tickets 02–17)

Origem: `arvore-de-decisoes-2026-10-26-arquitetura.md` e as cinco specs em `.scratch/internet-fragility-monitor/`. Tickets marcados com **(esquema)** alteram o esquema do Drizzle ou criam migration.

| # | Ticket | Spec | Trilha | Bloqueado por |
|---|---|---|---|---|
| 02 | Manutenção agendada não esconde mais problema **(esquema)** | provider-status | T1 | — |
| 03 | Falha de leitura vira Unreachable | provider-status | T1 | 02 |
| 04 | Recent Incidents com uma regra só | provider-status | T1 | 02, 03 |
| 05 | Nova regra do Internet Health | provider-status | T2 | 02 |
| 06 | Stale Snapshot | provider-status | T2 | 05 |
| 07 | Catálogo no banco **(esquema)** | provider-catalog | T3 | 04, 06 |
| 08 | Poll guiado pelo catálogo, com Probes para quem não tem Feed | provider-catalog | T3 | 03, 07 |
| 09 | Política de leitura única com a família Statuspage.io | status-feed | T3 | 08 |
| 10 | Demais famílias na política única | status-feed | T3 | 09 |
| 11 | Feeds reais da Salesforce e da IBM **(esquema)** | status-feed | T3 | 09, 10 |
| 12 | Probes para todos, vários Feeds e falha do monitor | status-feed | T3 | 10, 11 |
| 13 | Módulo de Poll Recording contra SQLite real | poll-recording | T4 | 12 |
| 14 | Identidade do Incident pela fonte **(esquema)** | poll-recording | T4 | 13 |
| 15 | Down de ponta a ponta **(esquema)** | poll-recording | T4 | 14 |
| 16 | Retenção e limpeza do esquema **(esquema)** | poll-recording | T4 | 15 |
| 17 | Política de Poll Schedule | poll-schedule | T5 | 06, 13 |

## 3. Execução em Paralelo (Trilhas)

Dentro de uma trilha a execução é **sequencial**, porque os tickets mexem nos mesmos arquivos. Trilhas diferentes podem rodar **em paralelo**, cada uma num agente com o seu worktree. Além disso, **nunca rodam dois tickets (esquema) ao mesmo tempo**, mesmo de trilhas diferentes, para o histórico de migrations ficar linear.

| Trilha | Sequência | Áreas de código |
|---|---|---|
| **T1 – Card e leitores** | 02 → 03 → 04 | leitores de status, card do Provider, módulo de Provider Status, leitura do Snapshot |
| **T2 – Visão geral** | 05 → 06 | página, hero, módulo de Internet Health |
| **T3 – Catálogo e Status Feed** | 07 → 08 → 09 → 10 → 11 → 12 | esquema do catálogo, leitores e registro de famílias, ponto de entrada do Poll |
| **T4 – Persistência** | 13 → 14 → 15 → 16 | gravação do Poll, leitura do Snapshot, esquema de Incidents e leituras |
| **T5 – Agendamento** | 17 | agendador, inicialização, atualização automática da página |

### Por que há pouco paralelismo neste ciclo

Análise de colisão feita em 26/10/2026, cruzando cada ticket com as áreas de código que ele altera.

- **03 e 04** mexem nos mesmos leitores, no card e no módulo de Provider Status: sequenciais, mesmo sem dependência lógica entre eles.
- **07** muda a página (lê o catálogo), o Internet Health (Major Providers do banco) e a leitura do Snapshot. Colide com 04 e 06, então espera os dois.
- **10 e 11** parecem independentes, mas os dois registram famílias de Feed no mesmo ponto e mexem no mesmo diretório de leitores: sequenciais.
- **13** reescreve a gravação do Poll, chamada pelo mesmo ponto de entrada que 08 e 12 alteram: espera a trilha T3 terminar.
- **14, 15 e 16** são todos (esquema) e todos mexem no módulo de Poll Recording: sequenciais.
- **15 e 17** colidem no módulo de Internet Health (texto de Down e cadência), então 17 vai junto com 14.

### Ondas

Uma onda só começa quando os tickets da onda anterior de que ela depende estão integrados na `main`. No máximo 4 agentes por vez; este ciclo nunca passa de 2. Os agentes de ticket rodam como `ticket-implementer` (Opus, esforço médio), e o orquestrador acompanha os que estão rodando para pegar os travados ou sem ação há muito tempo (`docs/agents/parallel-work.md`, "Orchestrator role").

| Onda | Em paralelo | Trilhas |
|---|---|---|
| 1 | **02** (esquema) | T1 |
| 2 | **03**, **05** | T1, T2 |
| 3 | **04**, **06** | T1, T2 |
| 4 | **07** (esquema) | T3 |
| 5 | **08** | T3 |
| 6 | **09** | T3 |
| 7 | **10** | T3 |
| 8 | **11** (esquema) | T3 |
| 9 | **12** | T3 |
| 10 | **13** | T4 |
| 11 | **14** (esquema), **17** | T4, T5 |
| 12 | **15** (esquema) | T4 |
| 13 | **16** (esquema) | T4 |

No fim de cada onda, o orquestrador roda a suíte completa, o typecheck, o lint e o code review de dois eixos na `main`, conforme `docs/agents/parallel-work.md`.
