# 🌐 Internet Fragility Monitor

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.5.0-informational)
![Tests](https://img.shields.io/badge/tests-779%20passing-brightgreen)

**Internet Fragility Monitor** watches the public status pages of the infrastructure providers that most of the web depends on (AWS, Cloudflare, Azure, Google Cloud, GitHub, Vercel and others) and shows, on a single page, the state of each one and how fragile the internet as a whole is right now.

It is independent of any provider: every reading comes straight from the provider's own status feed, every verdict is derived by rules that live in this repository, and the whole thing runs on one Node process with a SQLite file.

## Table of contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [Monitored providers](#monitored-providers)
- [Getting started](#getting-started)
- [Running in production](#running-in-production)
- [Available scripts](#available-scripts)
- [Project layout](#project-layout)
- [Changing the provider catalog](#changing-the-provider-catalog)
- [Documentation and vocabulary](#documentation-and-vocabulary)
- [Tech stack](#tech-stack)

## What it does

The page has two parts.

**The hero** shows the **Internet Health**, one of three states derived from every provider at once:

| Internet Health | Meaning |
| :-- | :-- |
| **Healthy** | No provider is in Degraded, Outage or Down. Maintenance and Unreachable do not count. |
| **Unstable** | Some provider is in Degraded, Outage or Down, but there is no Major Outage. |
| **Critical** | There is a **Major Outage**: a Major Provider (AWS, Google Cloud, Azure or Cloudflare) in Outage or Down, or three or more providers of any kind in Outage or Down at the same time. |

Below the text, the hero highlights the provider and the incident behind the state, or lists the providers involved when there are several.

**The provider cards**, one per active provider, show its **Provider Status**, one of six states in order of precedence:

| Provider Status | Who says it | Meaning |
| :-- | :-- | :-- |
| **Down** | the monitor | No source of the provider answered for two Polls in a row: not the feed, not the status page, not the login page. The worst case. |
| **Outage** | the provider | A serious failure in a relevant part of the services, as declared by the provider. |
| **Degraded** | the provider | A partial problem: part of the services is slow or failing. |
| **Maintenance** | the provider | A maintenance window is in progress right now. Never hides a problem. |
| **Operational** | the provider | Everything works. |
| **Unreachable** | the monitor | No feed could be read, but something still answers. Describes the reading, not the provider. |

Each card also lists the **Recent Incidents** (every active incident plus the ones resolved in the last 48 hours, up to three), a line with the **Upcoming Maintenance** count and next date, a link to the provider's status page and the time of the last reading. When only part of a provider's feeds could be read, the card says so (**Partial Reading**). When no feed could be read, the incidents shown come from the last successful reading and the card says that too.

If no Poll has run for more than three cycles (15 minutes), the page stops claiming any state: the hero turns neutral ("No recent reading") and a **Stale Snapshot** notice shows the time of the last Poll. The page refreshes itself on the Poll cadence.

## How it works

Everything runs inside the Next.js server process. There is no external worker, queue or database server.

```
                         ┌──────────────────────────────────────────────────┐
  node-cron (every 5')   │                       Poll                       │
  ─────────────────────► │  catalog ─► read every source ─► decide ─► record │
                         └──────────────────────────────────────────────────┘
                                   │ fetch (10 s timeout each)        │ SQLite
                                   ▼                                  ▼
                        status feeds + probes               providers / provider_sources
                        of each provider                    status_checks / incidents
                                                                      │
                         ┌──────────────────────────────────────────────────┐
  browser (auto-refresh) │              page (server-rendered)              │
  ◄───────────────────── │  snapshot ─► Provider Status ─► Internet Health  │
                         └──────────────────────────────────────────────────┘
```

### 1. Provider Catalog

The list of providers and where to read each one lives **in the database**, loaded and changed only by versioned data migrations (see [ADR 0001](docs/adr/0001-provider-catalog-no-banco-por-migrations.md)). Each provider has one or more **Provider Sources**:

- a **Feed**, where the provider itself declares its state and incidents (a Statuspage.io page, an RSS feed, a JSON API);
- **Probes**, plain URLs such as the status page and the login page, used only to check whether the provider answers at all.

A provider can be deactivated, which removes it from the Polls and the page but keeps its history. Providers are never deleted.

### 2. Poll

Every 5 minutes `node-cron` fires a **Poll**, started from Next.js instrumentation when the server boots. On boot, if the last Poll is older than one cycle (or there is none), a Poll runs immediately. Two Polls never overlap: a trigger that lands while one is running is skipped.

A Poll reads every active source of every active provider concurrently. A single **read policy** does all network access: a 10-second timeout per source, no caching, failures logged and isolated so one bad source never affects another. A feed that answers with something the reader cannot parse counts as "answered but unread", which matters for the Down rule.

If more than half of all sources return no HTTP response at all, the Poll is treated as a failure of the monitor's own network and discarded: nothing is recorded, and the page keeps the previous Snapshot.

### 3. Feed readers

Each feed belongs to a **family**, and each family has one reader that only interprets content (validated with Zod) and never touches the network:

| Family | Used by | Format |
| :-- | :-- | :-- |
| `statuspage` | Vercel, GitHub, Jira, DigitalOcean, Hostinger | Statuspage.io JSON (summary, incidents, scheduled maintenances) |
| `cloudflare` | Cloudflare | Statuspage.io JSON, but the state comes from the **Core Services** (the ones third-party sites depend on, such as the CDN) instead of the page's overall indicator |
| `aws-rss` | AWS | RSS where each update is an item and the `guid` carries the event and the instant |
| `azure-rss` | Azure | RSS where each item is an event and the `guid` is a slug |
| `google-cloud` | Google Cloud | `incidents.json` |
| `heroku` | Heroku | Heroku status API |
| `salesforce` | Salesforce | Salesforce status API |
| `ibm-rss` | IBM Cloud | RSS notifications feed |

Oracle Cloud has no readable feed and is monitored by Probes only, so its state is either Operational, Unreachable or Down.

### 4. Recording

The Poll records one reading per provider per Poll (`status_checks`) and reconciles incidents (`incidents`). An incident is identified by the feed it was published in plus the id that feed gives it, never by its title, so a renamed incident does not become a new one. Incidents are never deleted. Readings older than 90 days are purged on each Poll, always keeping the two most recent per provider, because the Down rule needs the previous Poll.

### 5. Deciding the state

Two pure modules turn the latest Snapshot into what the page shows, using the server clock at render time:

- **Provider Status** picks the worst state declared by the feeds that were read (Outage > Degraded > Maintenance > Operational). With no readable feed it falls back to the Probes: Unreachable if something answers, Down if nothing answered in this Poll and in the previous one. An active incident the provider has not updated for 30 days (**Dormant Incident**) still appears in the list but no longer drives the state.
- **Internet Health** applies the Healthy / Unstable / Critical rules above to all providers, after checking that the Snapshot is not stale.

## Monitored providers

The initial catalog ships with 13 providers, in display order:

| Provider | Type | Major | Feed family |
| :-- | :-- | :-: | :-- |
| AWS | cloud | ✔ | `aws-rss` |
| Google Cloud | cloud | ✔ | `google-cloud` |
| Azure | cloud | ✔ | `azure-rss` |
| Cloudflare | cdn | ✔ | `cloudflare` |
| Vercel | paas | | `statuspage` |
| GitHub | paas | | `statuspage` |
| Jira | saas | | `statuspage` |
| IBM Cloud | cloud | | `ibm-rss` |
| DigitalOcean | cloud | | `statuspage` |
| Salesforce | saas | | `salesforce` |
| Oracle Cloud | cloud | | probes only |
| Hostinger | hosting | | `statuspage` |
| Heroku | paas | | `heroku` |

Every provider also has two Probes: its status page and its login page.

## Getting started

### Prerequisites

- **Node.js 22.13 or newer** (`.node-version` pins 22).
- npm (comes with Node).

No database server is needed: the app uses a local SQLite file through `@libsql/client`.

### 1. Install

```bash
git clone https://github.com/LFCavalcanti/internet_fragility_monitor.git
cd internet_fragility_monitor
npm install
```

### 2. Configure

Create a `.env` file at the repository root (it is gitignored):

```dotenv
# Where the SQLite database lives. Any libSQL URL works; this is the default.
DATABASE_URL=file:sqlite.db

# Optional: PostHog analytics and error tracking. Leave out to run without it.
# NEXT_PUBLIC_POSTHOG_KEY=phc_...
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

In development `DATABASE_URL` may be omitted, and `file:sqlite.db` is used with a warning. In production it is required.

### 3. Create the database

Apply the committed migrations. This creates the schema **and loads the provider catalog**, which is why `db:migrate` is the right command here, not `db:push`:

```bash
npm run db:migrate
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On the first start the server finds no Poll recorded, runs one right away and then every 5 minutes. The first page load may show the Stale Snapshot notice for a few seconds until that first Poll finishes.

### 5. Test

```bash
npm test
```

The suite runs on Vitest with jsdom. Database tests use an in-memory SQLite with the **real migrations** applied, so a schema change is tested the same way it will be deployed. Feed readers are tested against recorded fixtures of the real status feeds in `__tests__/fixtures/`.

## Running in production

```bash
npm run build:prod   # applies pending migrations, then builds
npm start
```

Points to keep in mind:

- `DATABASE_URL` must be set. The build applies migrations to that database before `next build`, so stop the previous server first: a migration that removes columns breaks the old code as soon as it is applied.
- Back up the database file before deploying a new version. If the build fails after the migration ran, the old code will not work against the migrated schema.
- The Poll runs inside the web process. Run exactly one instance of the server per database: two instances would poll twice and race on the same file.
- After a long downtime the first Poll purges readings older than 90 days in one go. The file does not shrink by itself; run `VACUUM` with the server stopped if you need to reclaim space.

Pending operator notes for the next deploy are kept in [ISSUES_ANNOTATION.md](ISSUES_ANNOTATION.md), section 2.1.

## Available scripts

| Command | Description |
| :-- | :-- |
| `npm run dev` | Development server with the Poll scheduler running. |
| `npm run build` | Production build only. |
| `npm run build:prod` | Applies pending migrations, then builds. The deploy command. |
| `npm start` | Serves the production build. |
| `npm test` | Runs the whole test suite once. |
| `npm run test:watch` | Runs the tests in watch mode. |
| `npm run test:coverage` | Runs the tests with V8 coverage (text and HTML reports). |
| `npm run lint` | ESLint over the repository. |
| `npm run db:migrate` | Applies the committed migrations to `DATABASE_URL`. |
| `npm run db:generate` | Generates a migration from a change in `lib/schema.ts` (`--custom` for a data migration). |
| `npm run db:studio` | Opens Drizzle Studio to browse the database. |
| `npm run db:push` / `db:up` | Drizzle Kit shortcuts. Not used by the normal flow: `push` skips the data migrations that load the catalog. |

## Project layout

```
app/                    Next.js App Router: layout and the single page (server-rendered, force-dynamic)
components/             Hero, provider card, stale notice, auto-refresh, top bar, UI primitives
lib/
  schema.ts             Drizzle schema: providers, provider_sources, status_checks, incidents
  db.ts                 The single libSQL connection of the process
  cron.ts               node-cron adapter that fires the Poll Schedule
  poll-schedule.ts      Cadence, Stale Snapshot limit, run-on-boot rule, mutual exclusion
  poll.ts               One Poll: read everything, discard on monitor failure, record
  poll-recording.ts     Writes a Poll, reconciles incidents, applies retention, reads the Snapshot
  provider-catalog.ts   Feed families known to the code and catalog helpers
  provider-status.ts    Pure decision of a provider's state, Recent Incidents, Upcoming Maintenance
  internet-health.ts    Pure decision of Healthy / Unstable / Critical and the hero highlight
  incident-status.ts    The single rule for "closed incident" and the 48-hour window
  status-feed/
    index.ts            Reads every active provider through its active sources
    read-policy.ts      The only place that touches the network: timeout, failure handling, logging
    readers/            One reader per feed family
drizzle/                Versioned migrations (schema and data), applied by db:migrate
instrumentation.ts      Starts the scheduler when the Node.js runtime boots
__tests__/              Vitest suites, helpers and recorded feed fixtures
docs/adr/               Architecture decision records
docs/agents/            Conventions for the agent-driven ticket workflow
GLOSSARY.md             The project's vocabulary (Provider, Poll, Snapshot, Down, Major Outage, ...)
ROADMAP_STATUS.md       Tickets done, in progress and planned
ISSUES_ANNOTATION.md    Open decisions and notes for the next deploy
```

## Changing the provider catalog

The database is the only source of the catalog, so adding, deactivating or correcting a provider (even changing a logo) is a **data migration**:

1. Generate an empty migration: `npx drizzle-kit generate --custom --name <slug>`.
2. Write the SQL in the new file under `drizzle/`: an `INSERT` into `providers` and `provider_sources`, or an `UPDATE` setting `active = 0` to retire one.
3. Apply it locally with `npm run db:migrate` and commit the migration together with the updated `drizzle/meta/`.

A new feed **family** also needs code: a reader under `lib/status-feed/readers/`, an entry in `FEED_FAMILIES` in `lib/provider-catalog.ts` and in the reader map in `lib/status-feed/index.ts`, plus a fixture of the real feed under `__tests__/fixtures/status-feed/`. A feed whose family the code does not know is simply left unread; it never breaks a Poll.

## Documentation and vocabulary

The code, the tests and the docs use a fixed vocabulary, defined in [GLOSSARY.md](GLOSSARY.md). Terms such as Provider, Feed, Probe, Poll, Snapshot, Partial Reading, Stale Snapshot, Dormant Incident, Major Provider and Major Outage mean exactly what the glossary says, and the modules reference it.

Architectural decisions are recorded under [docs/adr/](docs/adr/). Development is organised in tickets, implemented in parallel git worktrees and integrated one at a time; the process is described in [docs/agents/parallel-work.md](docs/agents/parallel-work.md) and the current state in [ROADMAP_STATUS.md](ROADMAP_STATUS.md).

## Tech stack

### Framework and UI

- ![Next.js](https://img.shields.io/badge/Next.js-v16.4.3-000000?style=flat&logo=next.js&logoColor=white)
- ![React](https://img.shields.io/badge/React-v19.3.1-61DAFB?style=flat&logo=react&logoColor=black)
- ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.3.3-38B2AC?style=flat&logo=tailwind-css&logoColor=white)
- ![Lucide React](https://img.shields.io/badge/Lucide_React-v1.61.0-F56565?style=flat&logo=lucide&logoColor=white)

### Data and scheduling

- ![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-v0.45.4-C5F74F?style=flat&logo=drizzle&logoColor=black)
- ![libSQL](https://img.shields.io/badge/libSQL_Client-v0.18.0-003B57?style=flat&logo=sqlite&logoColor=white)
- ![Node Cron](https://img.shields.io/badge/Node_Cron-v4.6.0-339933?style=flat&logo=node.js&logoColor=white)
- ![fast-xml-parser](https://img.shields.io/badge/fast--xml--parser-v5.11.2-orange?style=flat)

### Tooling and testing

- ![TypeScript](https://img.shields.io/badge/TypeScript-v6.0.3-3178C6?style=flat&logo=typescript&logoColor=white)
- ![Vitest](https://img.shields.io/badge/Vitest-v5.0.5-729B1B?style=flat&logo=vitest&logoColor=white)
- ![Zod](https://img.shields.io/badge/Zod-v4.6.7-3E67B1?style=flat&logo=zod&logoColor=white)
- ![Date-fns](https://img.shields.io/badge/Date--fns-v4.4.0-770C56?style=flat&logo=date-fns&logoColor=white)
- ![PostHog](https://img.shields.io/badge/PostHog-analytics-1D4AFF?style=flat&logo=posthog&logoColor=white)

## License

[MIT](LICENSE)
