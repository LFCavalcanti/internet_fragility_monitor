# 12: Probes para todos, vários Feeds e falha do monitor

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Todos os Providers ativos passam a rodar seus Probes a cada Poll. Com vários Feeds lidos, vence o pior estado e os Incidents se somam; se só parte dos Feeds foi lida, o card mostra a marca de Partial Reading ("1 de 2 feeds sem leitura"). Um Poll em que nenhuma fonte de nenhum Provider responde é descartado como falha do próprio monitor: nada é gravado e o problema vai ao log.

**Blocked by:** 10 e 11.

**Status:** ready-for-agent

- [ ] Probes rodam para todos os Providers ativos
- [ ] O módulo de Provider Status aplica vence-o-pior e Partial Reading; Unreachable quando nenhum Feed é lido e algum Probe responde
- [ ] O card mostra a marca de Partial Reading
- [ ] Poll sem nenhuma resposta não grava nada e registra no log
- [ ] Testes: Provider com dois Feeds, um lido e outro não; dois Feeds com estados diferentes; Poll sem resposta descartado
