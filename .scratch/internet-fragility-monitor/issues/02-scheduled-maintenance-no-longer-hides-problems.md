# 02: Manutenção agendada não esconde mais problema

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores, (esquema)

**What to build:** Nasce o módulo de Provider Status, e o caso real da Cloudflare de 26/10/2026 passa a aparecer certo: um Provider que declara Outage aparece em Outage mesmo com dezenas de manutenções agendadas, e o card mostra uma linha discreta de Upcoming Maintenance com a quantidade e a data da próxima. Maintenance só vale quando está em andamento e nunca prevalece sobre Outage ou Degraded. A classificação vem do próprio Feed: a heurística de texto ("maintenance", "scheduled") sai.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O módulo de Provider Status existe, é puro e recebe o relógio; aplica a precedência Down, Outage, Degraded, Maintenance, Operational
- [ ] Incident ganha tipo (problema ou manutenção), as fases de manutenção (scheduled, in progress, completed) e a data marcada; migration de esquema e migration de dados para os registros atuais com status "maintenance"
- [ ] Os leitores da família Statuspage.io (inclusive as cópias de Cloudflare, GitHub e Vercel) classificam manutenção pela lista própria do Feed e pela fase declarada; a heurística de texto sai
- [ ] O card mostra o estado decidido pelo módulo e a linha de Upcoming Maintenance com link para a status page; manutenção completed não aparece
- [ ] Testes puros do módulo cobrem o caso da Cloudflare (Outage com 25 manutenções agendadas) e a precedência completa
- [ ] Os testes de regra de manutenção do card passam para o módulo; o card fica com teste de renderização do estado e da linha
- [ ] Migrations geradas no worktree e listadas nos Comments
