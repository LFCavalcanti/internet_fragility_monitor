# 06: Stale Snapshot

**Spec:** `spec-provider-status.md` · **Trilha:** T2 – Visão geral

**What to build:** Quando o último Poll tem mais de 15 minutos (três ciclos), o hero mostra o estado neutro "Sem leitura recente" com a hora do último Poll, no lugar de qualquer Internet Health, inclusive Critical, e a página mostra um aviso de que os cards podem estar desatualizados.

**Blocked by:** 05.

**Status:** ready-for-agent

- [ ] O módulo de Internet Health devolve o estado neutro de Stale Snapshot a partir da hora do último Poll e do relógio
- [ ] O hero e o aviso da página exibem o estado neutro e a hora do último Poll
- [ ] Testes do módulo: Snapshot de 14 minutos mantém o Internet Health; de 16 minutos vira neutro, inclusive sobre Critical
