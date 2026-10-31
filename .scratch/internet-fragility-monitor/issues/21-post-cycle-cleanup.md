# 21: Faxina depois do ciclo de arquitetura

**Spec:** `spec-post-cycle-cleanup.md` · **Trilha:** T9 – Faxina

**What to build:** Três correções pequenas. O link do site do GitHub passa a levar ao GitHub, por uma migration de dados. A suíte de testes deixa de varrer os worktrees dos agentes. Um teste passa a falhar se a consulta da última leitura voltar a varrer a tabela inteira.

**Blocked by:** None (can start immediately).

**Status:** done

**Ticket de esquema:** tem migration de dados, e não pode rodar junto do Ticket 25.

- [x] Depois das migrations, o site do GitHub é `https://github.com`, com a status page intacta
- [x] A migration aparece nos Comments do ticket, para entrar na lista de deploy do `ISSUES_ANNOTATION.md`
- [x] `vitest run` na checkout principal não pega testes de `.claude/**`, sem parâmetro extra, e as exclusões padrão seguem valendo
- [x] Um teste contra base real migrada confere que a consulta da última leitura não varre `status_checks`
- [x] Conferido uma vez à mão que um JOIN comum faz esse teste falhar, com o resultado nos Comments

## Comments

**Migration nova:** `drizzle/0009_github_site_url.sql`, de dados, gerada com `drizzle-kit generate --custom`. Troca `providers.url` do `github` para `https://github.com`. Não toca em `status_page_url` nem nos Provider Sources. Entra na lista de deploy do `ISSUES_ANNOTATION.md`, seção 2.1.

**O que mudou:**

- `vitest.config.mts`: `exclude: [...configDefaults.exclude, '.claude/**']`.
- `lib/poll-recording.ts`: `latestChecks` passa a ser exportada, para o teste pedir o plano sem duplicar o SQL (`.toSQL()`). Nada mais mudou ali.
- `__tests__/lib/latest-checks-plan.test.ts`: novo. Roda `EXPLAIN QUERY PLAN` na base migrada e confere que nenhum passo é `SCAN` de `status_checks` nem do alias `recent`, e que as duas leituras mais novas vêm do índice `status_checks_provider_checked_at`.
- `__tests__/lib/provider-catalog-migration.test.ts`: caso novo, de `0008` para a `0009`. Só o `url` do GitHub muda em `providers`, e `provider_sources` fica igual.

**Conferência à mão do JOIN comum:** troquei `.crossJoin(statusChecks)` por `.innerJoin(statusChecks, eq(statusChecks.providerId, providers.id))`. O teste do plano falhou, com o passo `SCAN status_checks USING INDEX status_checks_provider_checked_at` (1 falhou, 1 passou). É a varredura descrita na spec, percorrendo o índice inteiro: por isso o teste olha o prefixo `SCAN`, sem exigir que venha sem índice. Revertido em seguida.

**Conferência à mão da exclusão:** com um `probe.test.ts` temporário em `.claude/worktrees/t21-probe/__tests__/` e outro em `__tests__/t21-probe-b/node_modules/dep/`, `vitest list --filesOnly` não listou nenhum dos dois. Sem o `.claude/**` na config, listou só o primeiro. Ou seja, a exclusão funciona e a padrão de `node_modules` segue valendo. Os dois arquivos foram apagados.

**Observação:** a página não mostra `providers.url`. O `SnapshotProvider` não carrega esse campo e o card só tem link para a status page. A correção fica gravada no catálogo, mas não muda nada na tela hoje.
