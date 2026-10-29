# 11: Feeds reais da Salesforce e da IBM

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed, (esquema)

**What to build:** Salesforce e IBM passam a ter o estado declarado pelos próprios Feeds: a API de incidentes e manutenções da Salesforce e o RSS da IBM. Uma migration de dados ativa os dois Feeds no catálogo, e os dois Providers perdem a marca de "só acesso".

**Blocked by:** 09 e 10 (10 por recurso: registro de famílias e diretório de leitores).

**Status:** ready-for-agent

- [ ] Leitor da família Salesforce (incidentes ativos e manutenções, com ids numéricos)
- [ ] Leitor da família RSS da IBM (`guid` como id)
- [ ] Migration de dados ativa os Feeds de Salesforce e IBM
- [ ] Fixtures reais das duas famílias e testes de leitura
- [ ] Migration gerada no worktree e listada nos Comments
