# internet_fragility_monitor

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Parallel ticket work and commits

Tickets are implemented in parallel, one git worktree per ticket, and integrated into `main` one at a time by the orchestrator (the main session, on `main`). Before implementing a ticket, read `docs/agents/parallel-work.md`. It covers worktree setup, database and migration rules, the commit convention (`<type>(<scope>): <descricao> (Ticket NN)`, one commit per ticket) and the integration steps. `ROADMAP_STATUS.md` section 3 lists which tickets may run at the same time.

Ticket agents run as `ticket-implementer` (`.claude/agents/ticket-implementer.md`). The orchestrator's role is in the same file, section "Orchestrator role": how to prompt ticket agents, the working rules, and watching running agents for stalls with `scripts/agents-status.mjs`.
