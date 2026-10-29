# Parallel ticket work

Adapted from the InventPilot convention (`D:\_DEV\InventPilot\docs\agents\parallel-work.md`). The main differences are SQLite instead of PostgreSQL, and schema tickets generating their own migrations (see "Database and migrations").

Several agents can implement tickets at the same time. Each ticket runs in its own git worktree on its own branch, and the orchestrator (the main session, in the main checkout on `main`) integrates finished tickets one at a time.

Which tickets may run at the same time is decided in `ROADMAP_STATUS.md`, section "Execução em Paralelo". Never run two tickets from the same lane (trilha) at once: they edit the same files. Never run two **schema tickets** at once, even from different lanes (see "Database and migrations").

## Starting a ticket

The orchestrator must be on `main` with every previously finished ticket already merged. Worktrees branch from the local `HEAD` (`worktree.baseRef: "head"` in `.claude/settings.json`), so the worktree starts from whatever `main` holds at that moment.

- **Interactive:** from the main checkout, run `claude --worktree ticket-NN`, then `/implement .scratch/internet-fragility-monitor/issues/NN-<slug>.md`.
- **Subagent:** spawn the agent with `subagent_type: "ticket-implementer"` and `isolation: "worktree"`, with a prompt built as in "Orchestrator role" below. The type is defined in `.claude/agents/ticket-implementer.md` (Opus, medium effort; InventPilot decision of 26/09/2026). A new file in `.claude/agents/` only loads after the session restarts: if `ticket-implementer` is not among the available agent types, tell the user and do not fall back silently to another type.

Claude Code creates the worktree at `.claude/worktrees/ticket-NN/` on branch `worktree-ticket-NN` (interactive) or at `.claude/worktrees/agent-<id>/` on branch `worktree-agent-<id>` (subagent), and copies the gitignored files listed in `.worktreeinclude` (`.env*` and the `.claude/skills` links).

**At most 4 ticket agents run at the same time** (InventPilot decision of 08/10/2026: more agents repeating the same heavy steps stalled one of them). The waves planned in `ROADMAP_STATUS.md` never need more than 2.

Dependencies: `node_modules` is not shared between worktrees. Run `npm ci` in the worktree **only when the ticket changes `package.json`**. Otherwise reuse the main checkout's installation through a directory junction. On Windows, from PowerShell inside the worktree:

```powershell
New-Item -ItemType Junction -Path node_modules -Target D:\_DEV\internet_fragility_monitor\node_modules
```

If the ticket must change `package.json`, delete the junction first (see below) and run `npm ci` in the worktree.

**Removing a worktree that has the junction:** delete the junction link alone first, then the worktree. `git worktree remove --force` on a worktree that still holds the junction may follow it and wipe the main checkout's `node_modules`.

```powershell
[System.IO.Directory]::Delete("<worktree>\node_modules", $false)   # removes only the link
git worktree remove --force <worktree>
```

## Rules inside a ticket worktree

- Only change what the ticket needs. Do not edit `ROADMAP_STATUS.md`; the orchestrator updates it after integration.
- Edit `GLOSSARY.md` or ADRs only when the ticket really changes the domain model, and keep the edit small.
- **Dev server:** prefer tests. If you must run the app, use a port derived from the ticket number (`npm run dev -- -p 30NN`) and keep `DATABASE_URL` pointing to a database inside the worktree (the default `file:sqlite.db` resolves there). Never point it at the main checkout's `sqlite.db`.
- **New dependencies:** allowed when the ticket requires them. On a `package-lock.json` conflict during rebase, take `main`'s lock file and run `npm install` again.

## Database and migrations

This project uses SQLite through Drizzle and `@libsql/client`. Tests run against an in-memory SQLite with the **real migrations** applied (decision Q33 of `arvore-de-decisoes-2026-10-26-arquitetura.md`), so a ticket that changes the schema needs its migration files inside the worktree to run its own tests.

- **Schema tickets** are the tickets that change the Drizzle schema or add a migration, including data migrations. `ROADMAP_STATUS.md` marks them with **(esquema)**, and no wave runs two of them at once. That keeps `drizzle/meta/_journal.json` linear: each schema ticket starts from a `main` that already holds every earlier migration.
- A schema ticket generates its migration in its own worktree: `npx drizzle-kit generate --name <slug>` for schema changes, and `npx drizzle-kit generate --custom --name <slug>` for a data migration, whose SQL the ticket then writes. List each new migration in the ticket's Comments.
- A ticket that is not a schema ticket never runs `drizzle-kit generate`, `migrate`, `push` or `up`.
- Never run `drizzle-kit migrate` or `push` against the main checkout's `sqlite.db` from a worktree.
- drizzle-kit asks an interactive rename question when a table loses and gains columns in the same diff. There is no TTY here, so generate in two steps: temporarily remove the new columns from the schema and generate the drops, then restore the file and generate the additions.
- **Production is never migrated from here.** The user deploys; the build of production applies the committed migrations (`db:migrate`). Record anything an operator must know in the ticket's Comments.

## Finishing a ticket

1. Run `npx tsc --noEmit`, `npm run lint` and the **tests affected by the ticket** (the files you changed and the suites that cover them, e.g. `npx vitest run __tests__/lib/<area>`); all must pass. Do not run the full suite in the worktree: the orchestrator runs it once per wave, on `main`, after integration. `main` still has pre-existing lint errors, so the rule is no new lint errors in the files you touched.
2. **Do not run the `code-review` skill in the worktree** (InventPilot decision of 08/10/2026: one review per wave, run by the orchestrator). Instead, before committing, check your own diff against every acceptance criterion of the ticket and every spec story it cites, and fix what is missing. List in the Comments anything you could not meet and why. Never hand back while sub-agents or other background work are still running.
3. Set the ticket's status to `**Status:** done` and append a `## Comments` section with a short summary: what changed, new migrations, and anything left for later.
4. Commit on the worktree branch, following the repository's convention:
   - Message: `<type>(<scope>): <descrição em português, sem acentos> (Ticket NN)`, for example `feat(status): manutencao agendada nao esconde mais Outage (Ticket 02)`.
   - Types in use: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`.
   - Prefer one commit per ticket. Squash WIP commits before handing back, relative to the commit the worktree started from (`git merge-base HEAD main` taken when you start, or the first parent of your first commit), never relative to the current `main`: `main` moves while you work, and squashing onto it would revert other tickets.
   - Include the ticket file change and the migration files in the same commit.
   - End the message with the co-author trailer the harness provides.

## Handing back (integration by the orchestrator)

Integrate one ticket at a time, in the order the tickets finished:

1. In the worktree: `git rebase main`. Resolve conflicts keeping both tickets' behavior; for `package-lock.json`, take `main`'s file and run `npm install`. Run the tests again.
2. In the main checkout: `git merge --ff-only <branch>`, then `npm install` if `package.json` changed.
3. If the ticket added migrations: confirm `drizzle/meta/_journal.json` is linear, then apply all migrations to a throwaway copy of the local `sqlite.db` in the scratchpad and run `npx drizzle-kit check`. Report the result in the wave summary. The local `sqlite.db` may then be migrated with `npm run db:migrate`; it is a disposable development file.
4. Update `ROADMAP_STATUS.md` (completed tickets, next wave) and commit it as `docs(roadmap): ...`.
   At the end of each wave, with every ticket of the wave merged, run the **full suite** (`npm test`) plus `npx tsc --noEmit` and `npm run lint` on `main` once, before starting the next wave.
   Also at the end of each wave, run the **two-axis code review** (`code-review` skill, standards and spec) over the wave's commits on `main`, with the wave's specs and tickets as the spec source. It may run while the next wave's agents work. Fix every finding that is a defect or a missed requirement before the wave is reported closed, with a test, in a commit tagged with the ticket it belongs to (`fix(<scope>): ... (Ticket NN)`). Findings that would change product behavior are recorded in the ticket's Comments as pending decisions for the user.
5. Remove the worktree and branch: delete the `node_modules` junction link first (see "Removing a worktree that has the junction"), then `git worktree remove` and `git branch -d` on the worktree's branch.

Only after that should the orchestrator start tickets that depend on this one.

## Orchestrator role

The orchestrator is the main session, on `main`. It plans the wave, spawns the ticket agents, watches them while they run, integrates what they deliver and keeps `ROADMAP_STATUS.md` current. These rules come from what worked in InventPilot.

### Prompting a ticket agent

The agent knows only its prompt. Write it in Portuguese and include:

- the ticket path, the spec and the stories the ticket cites, and this file, to be read in full;
- the **fixed point**: the agent records `git rev-parse HEAD` when it starts, as the base of its squash;
- the steps: `/tdd`, the `node_modules` junction (or `npm ci` if the ticket changes `package.json`), the checks of "Finishing a ticket", the ticket file update and the commit message with its type and scope;
- the quality bar: fix every defect it finds in code it wrote or touched; defer only what belongs to a named later ticket or needs the user; no style judgments as pending items; before raising a `DECISAO PENDENTE`, check that the case can happen (foreign keys, NOT NULL, rules of earlier tickets) and that the glossary, ADRs and specs do not already answer it; never loosen a test; reread the checklist and the stories before handing back;
- the safety rules: no database commands outside what "Database and migrations" allows, no edits to `ROADMAP_STATUS.md`, nothing deleted outside the project, scratch files prefixed `t<NN>-`, scripts run with the absolute path of its own worktree, `git diff --stat <fixed point>` before the commit (the scratchpad is shared between parallel agents; in InventPilot one agent's script once ran in another agent's worktree);
- the other tickets of the wave and the files they touch, and any interim choice an earlier ticket left that this ticket must replace;
- the final report: worktree, branch and commit; tsc, tests and lint; what changed; visible changes; schema and migrations; pending items (or "nenhuma").

### Working rules

- **Integrate as soon as an agent finishes**, without asking, following "Handing back". Report the result and integrate in the same turn.
- Run each integration step as its own command. In InventPilot the auto-mode classifier blocked a migration and a commit chained with `&&` to a `git checkout --`.
- **Before passing a `DECISAO PENDENTE` to the user, check its facts** in the code and the data. Ask the user only product and business-rule questions, in plain language with a screen example and no jargon. Technical choices (test seams, test dependencies, cleanup) are decided by the orchestrator and recorded in the ticket.
- **The user decides scope.** Never create tickets, specs or ADRs on your own, not even small ones from a code review: report the finding, propose the ticket (title, why, scope) and wait.
- The user owns the product. There is no external "client": never write "confirmar com o cliente" or similar anywhere.
- **`ROADMAP_STATUS.md` after every wave:** mark the wave closed, list commits and migrations, name the next wave, and strike through every finished ticket in every table of the cycle (`~~02~~`, or `~~[02](link)~~` when linked). The user follows progress by the struck-through tickets.
- **Fast validation:** run tsc, `vitest run` and `eslint .` once over the project, never one process per file. For a flaky test, read the cause in the code first; at most one or two reruns to see the failure.
- **No blocking waits.** Run long commands with `run_in_background` and answer with what you already have; the completion notification brings the rest. Never wait with an `until`/`sleep` loop in the foreground.
- When the user says stop, stop at once, with no further tool call, and say where you stopped.

### Monitoring running agents

While ticket agents run, the orchestrator watches for agents that are stuck or have gone a long time without any action, and acts on them. Silence is not progress: an agent that hangs looks the same as one that is working until someone reads its transcript.

The tool is `scripts/agents-status.mjs`. It reads the transcripts of this project's subagents (`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`) and the worktree `.claude/worktrees/agent-<id>/` of each one.

- `node scripts/agents-status.mjs` lists the agents still running: state (thinking, or which tool it is waiting on), time running, time since its last action, worktree branch, commits and changed files, and the transcript path. `--all` includes the finished ones.
- `node scripts/agents-status.mjs --watch` prints one line per alert and exits when no agent is left running.

The limits are `--idle 10` (minutes without any new line in the transcript) and `--max 45` (minutes running in total; in InventPilot, Ticket 275 passed 45 minutes and was stopped). Both can be changed per run.

1. **Right after spawning a wave**, arm the `Monitor` tool with `node scripts/agents-status.mjs --watch`, `timeout_ms: 1800000` and a description such as "agentes da onda N parados". It runs in the background and does not block the session. Re-arm it when it expires while agents are still running. When the user asks how the agents are doing, run the script without `--watch` and answer from its output.
2. **On an idle alert**, read the last lines of that agent's transcript before doing anything:
   - Waiting on a long tool that is still sensible (for example, a test run that is still progressing): leave it alone and look again on the next alert.
   - Going in circles (the same command failing again and again, the suite rerun after a flaky test, a question nobody will answer): send a concrete correction with `SendMessage`.
   - No action for 20 minutes or more, or the process is gone: treat it as stuck. Stop it with `TaskStop` and recover the work from its worktree (next step).
3. **On a 45-minute alert**, tell the user in one line what the agent is doing and how far it got. Keep it running unless the user says stop; stopping an agent that still makes progress is the user's call.
4. **Recovering a stopped or dropped agent:** rebuild its state from Git, never by guessing. Check the worktree's commits ahead of `main` and its uncommitted files:
   - If it committed, rebase and integrate it.
   - If it has work but no commit, resume the same agent with `SendMessage` (its context is intact), or finish the ticket yourself from the worktree, checked with tsc, lint and the affected tests.
   - If it died before changing anything, relaunch it from scratch.

   In InventPilot a usage-quota stop killed four agents in flight and nothing was lost this way.
5. **Every agent idle at the same moment** points to the machine, the connection or the usage quota, not to the agents. Check one transcript and the machine before stopping any agent. In InventPilot a machine freeze once halted every agent and the main session for two hours.
6. Tell the user every action taken on an agent (correction, stop, relaunch, recovery), and record it in the wave's line of `ROADMAP_STATUS.md`.

## More than one person

This project has one person today. If a second person joins, adopt the "Two people at once (person branches)" section of the InventPilot guide.
