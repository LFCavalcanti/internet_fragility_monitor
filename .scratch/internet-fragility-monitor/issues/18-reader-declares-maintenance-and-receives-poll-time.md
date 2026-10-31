# 18: Leitor declara Maintenance e recebe a hora do Poll

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Preparação, sem mudança visível na página. O estado declarado por um Feed passa a incluir Maintenance, e a regra de manutenção em andamento sai da decisão de Provider Status e vai para a leitura. O leitor de cada família passa a receber a hora do Poll, que será usada pela regra de Dormant Incident. Uma manutenção em andamento continua dando Maintenance em todos os Providers, com a mesma precedência: nunca prevalece sobre Down, Outage ou Degraded.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] O estado declarado por um Feed inclui Maintenance, e todas as famílias o declaram quando há manutenção em andamento e nenhum problema
- [ ] A decisão de Provider Status usa só os estados declarados, sem olhar os Incidents para achar manutenção
- [ ] A gravação e a leitura do Snapshot aceitam o novo estado declarado, sem migration
- [ ] Linhas gravadas antes da mudança não quebram a leitura e se corrigem no primeiro Poll
- [ ] Todo leitor recebe a hora do Poll e nenhum lê o relógio por conta própria
- [ ] Os testes de precedência de Provider Status continuam passando; os casos de Maintenance mudam para a leitura
- [ ] Sem mudança no card, no topo da página nem nos testes de tela
