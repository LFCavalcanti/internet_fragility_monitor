# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/internet-fragility-monitor/`. This follows the convention of the sibling project InventPilot. Specs, tickets and decision trees are written in Portuguese; domain terms stay in English, as defined in `GLOSSARY.md`.

## Conventions

- One project directory: `.scratch/internet-fragility-monitor/`. Don't create one directory per feature.
- **Decision trees** from grilling sessions: `arvore-de-decisoes-<YYYY-MM-DD>[-<slug>].md`. Each records the decisions as Decidido, Mantido, Fora and Descartados, and links the specs written from it.
- **Specs**: `spec-<slug>.md`, one per feature, with a `Status:` line and the sections Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope and Further Notes.
- **Tickets**: one file per ticket at `issues/<NN>-<slug>.md`. Numbering is continuous across all specs (the next ticket takes the highest existing number plus one), never restarting per feature and never a single combined tickets file.
- Each ticket names its spec and has a `Blocked by:` line (`None` when it can start immediately).
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings; `done` marks a finished ticket)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create the spec or ticket file under `.scratch/internet-fragility-monitor/`, following the naming above.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
