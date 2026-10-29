# 03: Falha de leitura vira Unreachable

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores

**What to build:** Quando a status page de um Provider não pode ser lida, o Provider aparece Unreachable, num card cinza e neutro com "Não foi possível ler a status page", e não mais em Outage. O card não mostra o último status conhecido, mas continua mostrando os Recent Incidents já gravados, com suas datas.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Nenhum leitor converte erro de leitura em Outage; o resultado é Unreachable
- [ ] O vocabulário de Provider Status aceita Unreachable de ponta a ponta: leitura, gravação, leitura do Snapshot e card
- [ ] O card Unreachable é cinza, mostra o texto combinado, não mostra último status e mostra os Recent Incidents gravados
- [ ] O ramo morto do card que exibia o tempo de resposta é removido
- [ ] Teste do módulo e teste de renderização do card para Unreachable
