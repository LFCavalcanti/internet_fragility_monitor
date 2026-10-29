# 02: Manutenção agendada não esconde mais problema

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores, (esquema)

**What to build:** Nasce o módulo de Provider Status, e o caso real da Cloudflare de 26/10/2026 passa a aparecer certo: um Provider que declara Outage aparece em Outage mesmo com dezenas de manutenções agendadas, e o card mostra uma linha discreta de Upcoming Maintenance com a quantidade e a data da próxima. Maintenance só vale quando está em andamento e nunca prevalece sobre Outage ou Degraded. A classificação vem do próprio Feed: a heurística de texto ("maintenance", "scheduled") sai.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] O módulo de Provider Status existe, é puro e recebe o relógio; aplica a precedência Down, Outage, Degraded, Maintenance, Operational
- [x] Incident ganha tipo (problema ou manutenção), as fases de manutenção (scheduled, in progress, completed) e a data marcada; migration de esquema e migration de dados para os registros atuais com status "maintenance"
- [x] Os leitores da família Statuspage.io (inclusive as cópias de Cloudflare, GitHub e Vercel) classificam manutenção pela lista própria do Feed e pela fase declarada; a heurística de texto sai
- [x] O card mostra o estado decidido pelo módulo e a linha de Upcoming Maintenance com link para a status page; manutenção completed não aparece
- [x] Testes puros do módulo cobrem o caso da Cloudflare (Outage com 25 manutenções agendadas) e a precedência completa
- [x] Os testes de regra de manutenção do card passam para o módulo; o card fica com teste de renderização do estado e da linha
- [x] Migrations geradas no worktree e listadas nos Comments

## Comments

**Resumo (28/10/2026).**

- `lib/provider-status.ts`: módulo puro `decideProviderStatus({ feeds, probes, previousPollUnanswered, now })`, que devolve `status`, os Incidents a exibir (problemas e manutenções em andamento) e `upcomingMaintenance` (`{ count, next }` ou `null`). Com Feeds lidos, vence o pior estado declarado; manutenção `in_progress` só vence Operational; nenhum Feed lido com Probe respondendo dá Unreachable; sem resposta de nenhuma fonte dá Unreachable, ou Down se o Poll anterior também ficou sem resposta; Provider só com Probes que respondem fica Operational. O relógio é recebido, mas nenhuma regra deste ticket depende dele (a janela de 48 horas chega no 04). As marcas de Partial Reading e de "só acesso" ainda não saem do módulo; chegam com os tickets de Probes e vários Feeds.
- Vocabulário: `IncidentData` virou união discriminada por `kind`: `problem` (investigating, identified, monitoring, resolved) e `maintenance` (scheduled, `in_progress`, completed, com `scheduledFor`). O status antigo `"maintenance"` deixou de existir, inclusive no `incidentStatusSchema`.
- Leitor da Statuspage.io: a lista `incidents` vira problema e a lista `scheduled_maintenances` vira manutenção, com a fase declarada (`verifying` conta como em andamento; `postmortem` como resolved) e a data `scheduled_for`. A heurística de texto saiu. As cópias de Cloudflare, GitHub e Vercel passaram a estender o leitor da família, e por isso GitHub e Vercel agora também leem `scheduled_maintenances`. O leitor ganhou tipos mínimos do summary.json no lugar dos `any`; a validação com Zod continua no Ticket 09. Os demais leitores marcam seus Incidents como `problem`.
- Gravação: Incident novo grava tipo e data marcada; um Incident conhecido é atualizado quando muda a fase/status, o tipo ou a data marcada; manutenção que sai do Feed vira `completed` (nova `completeMaintenance` na camada de acesso) em vez de `resolved`. Os Incidents abertos excluem `resolved` e `completed`.
- Leitura do Snapshot: os problemas mantêm o corte nos 5 mais recentes (o Ticket 04 troca pela regra de Recent Incident), e as manutenções agendadas e em andamento vêm todas, fora do corte, para a contagem de Upcoming Maintenance ficar certa. Manutenções `completed` não vêm.
- Card: recebe `decision` do módulo e mostra o estado decidido, com ícone e cor para os seis estados (Unreachable cinza e Down em `text-red-700` só como base; o card completo de Unreachable é do 03 e o de Down do 15). Linha de Upcoming Maintenance: "25 upcoming maintenances · next Oct 27, 01:00 UTC", com link para a status page; em inglês como o resto do card, e com a data em UTC para não depender do fuso do servidor. A fase `in_progress` aparece como "in progress" na lista. Imports sem uso saíram do card.
- Página: monta a entrada do módulo com a hora do servidor e passa o resultado ao card. A regra do hero (Ticket 05) continua a mesma, mas passa a usar o estado decidido pelo módulo: um Provider em Outage com manutenções agendadas deixa de ser ignorado no Internet Health. O import sem uso de `Badge` saiu.

**Migrations novas:**

- `drizzle/0001_incident_kind_and_scheduled_for.sql` (esquema): `incidents.kind` (text, NOT NULL, default `'problem'`) e `incidents.scheduled_for` (integer timestamp, nulo).
- `drizzle/0002_maintenance_incidents_to_kind.sql` (dados): Incidents com status `"maintenance"` passam a `kind = 'maintenance'`, `status = 'completed'` e `resolved_at` preenchido quando vazio. O Poll seguinte devolve a fase e a data marcada aos que continuam no Feed. Conferido em SQLite em memória e com `drizzle-kit check`.

**Para o operador:** o deploy aplica as duas migrations com `db:migrate`. Logo depois do deploy, até o primeiro Poll, as manutenções antigas aparecem como concluídas, então o card não mostra a linha de Upcoming Maintenance nesse intervalo.

**Fica para depois:** falha de leitura ainda vira Outage, e o ramo morto do tempo de resposta continua no card (Ticket 03). A janela de 48 horas, o limite de 3 no card, o corte de 5 problemas e o erro de pureza do card ficam para o Ticket 04. A regra nova do Internet Health é do Ticket 05. Como a identidade ainda é pelo título, manutenções da Cloudflare com o mesmo título se juntam numa linha só e a contagem pode ficar abaixo da do Feed (22 em vez de 25 no caso real); isso é do Ticket 14.
