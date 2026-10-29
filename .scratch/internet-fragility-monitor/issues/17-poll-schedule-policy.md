# 17: Política de Poll Schedule

**Spec:** `spec-poll-schedule.md` · **Trilha:** T5 – Agendamento

**What to build:** A cadência de 5 minutos passa a existir num lugar só e vale para o agendador, a decisão de rodar ao iniciar, a atualização automática da página e o limite de Stale Snapshot. Um disparo que encontra um Poll em andamento é pulado e registrado no log. Relógio e disparo são injetados, e o node-cron vira só o adaptador que dispara.

**Blocked by:** 06 e 13.

**Status:** ready-for-agent

- [ ] Política com cadência, limite de Stale Snapshot (três ciclos), regra de rodar ao iniciar e exclusão mútua
- [ ] O módulo de Internet Health e a atualização automática da página usam a cadência da política
- [ ] Disparo durante Poll em andamento é pulado e registrado; erro no Poll libera o próximo disparo
- [ ] A marca que evita inicializar duas vezes é separada da marca de Poll em andamento
- [ ] Testes com relógio, disparo e Poll falsos; o teste atual do agendamento, inclusive o caso vazio, é substituído
