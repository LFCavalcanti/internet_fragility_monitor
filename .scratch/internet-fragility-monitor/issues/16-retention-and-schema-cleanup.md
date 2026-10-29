# 16: Retenção e limpeza do esquema

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Ao gravar um Poll, as leituras com mais de 90 dias são apagadas; Incidents nunca são apagados. As colunas de tempo de resposta e de severidade, que não são mais usadas, saem do esquema.

**Blocked by:** 15 (por recurso: esquema e módulo de Poll Recording).

**Status:** ready-for-agent

- [ ] A gravação do Poll apaga leituras com mais de 90 dias
- [ ] Incidents não são apagados
- [ ] Colunas de tempo de resposta e de severidade removidas
- [ ] Teste: leitura de 91 dias apagada e de 89 mantida
- [ ] Migration gerada no worktree (em dois passos se o drizzle-kit pedir renomeação) e listada nos Comments
