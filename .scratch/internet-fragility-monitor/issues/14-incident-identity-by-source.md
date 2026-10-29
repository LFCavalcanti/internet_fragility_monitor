# 14: Identidade do Incident pela fonte

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Um Incident passa a ser identificado pela Provider Source mais o id publicado pelo Feed. Manutenções com o mesmo título viram Incidents diferentes, um título repetido meses depois vira Incident novo, e um Feed não lido não resolve seus Incidents. Os Incidents antigos sem id passam uma única vez pela reconciliação por título; os abertos que ninguém assumir são resolvidos.

**Blocked by:** 13.

**Status:** ready-for-agent

- [ ] Incidents ganham fonte e id externo, com unicidade do par
- [ ] Reconciliação: insere novo, atualiza conhecido, resolve ausente só de Feed lido
- [ ] Passagem única: Incident com id assume linha antiga sem id, aberta, do mesmo Provider e título; as não assumidas são resolvidas no fim desse Poll
- [ ] As duplicatas da Cloudflare deixam de ser criadas
- [ ] Testes com SQLite em memória para cada um desses casos
- [ ] Migration gerada no worktree e listada nos Comments
