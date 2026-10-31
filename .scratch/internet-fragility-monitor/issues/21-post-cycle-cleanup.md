# 21: Faxina depois do ciclo de arquitetura

**Spec:** `spec-post-cycle-cleanup.md` · **Trilha:** T9 – Faxina

**What to build:** Três correções pequenas. O link do site do GitHub passa a levar ao GitHub, por uma migration de dados. A suíte de testes deixa de varrer os worktrees dos agentes. Um teste passa a falhar se a consulta da última leitura voltar a varrer a tabela inteira.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Ticket de esquema:** tem migration de dados, e não pode rodar junto do Ticket 25.

- [ ] Depois das migrations, o site do GitHub é `https://github.com`, com a status page intacta
- [ ] A migration aparece nos Comments do ticket, para entrar na lista de deploy do `ISSUES_ANNOTATION.md`
- [ ] `vitest run` na checkout principal não pega testes de `.claude/**`, sem parâmetro extra, e as exclusões padrão seguem valendo
- [ ] Um teste contra base real migrada confere que a consulta da última leitura não varre `status_checks`
- [ ] Conferido uma vez à mão que um JOIN comum faz esse teste falhar, com o resultado nos Comments
