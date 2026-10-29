# 07: Catálogo no banco

**Spec:** `spec-provider-catalog.md` · **Trilha:** T3 – Catálogo e Status Feed, (esquema)

**What to build:** O Provider Catalog passa a morar no banco (ADR 0001). As tabelas de Providers e de Provider Sources são criadas, e uma migration de dados carrega os 13 Providers com seus Feeds e Probes, conforme a tabela da spec, preservando os ids atuais. A página lista os Providers ativos do catálogo, na ordem de exibição, e os Major Providers vêm do banco. O Poll para de sobrescrever o catálogo. O deploy só aplica migrations, e o script quebrado de logos é apagado.

**Blocked by:** 04 e 06 (por recurso: leitura do Snapshot, página e módulo de Internet Health).

**Status:** done

- [x] Migration de esquema das tabelas de Providers e Provider Sources e migration de dados com a carga da spec
- [x] Num banco com os 13 Providers no formato antigo e um Incident ligado, a migration preserva ids e Incident
- [x] A página lê o catálogo; a lista de metadados no código e a função que sobrescrevia o banco a cada Poll são removidas
- [x] A constante de Major Providers do módulo de Internet Health é trocada pela marcação do catálogo
- [x] Um Provider inativo some da página
- [x] O build de produção roda só a aplicação de migrations; o script de logos é apagado
- [x] Teste: migration de carga aplicada num SQLite em memória confere os 13 Providers, as fontes, os quatro Major Providers, a ordem e os Feeds inativos de Salesforce e IBM
- [x] Migrations geradas no worktree e listadas nos Comments

## Comments

**Resumo (28/10/2026).**

- **Esquema** (`lib/schema.ts`): `providers` ganha `status_page_url` (link do card, anulável), `is_major`, `active` e `display_order`. Nova tabela `provider_sources` (1:n): `id` em texto, `provider_id`, `kind` (`feed` ou `probe`), `family` (só Feeds), `url`, `label` (`feed`, `status page`, `login`) e `active`. Os ids das fontes são legíveis e estáveis (`aws-feed`, `aws-status-page`, `aws-login`), para que migrations futuras (Ticket 11, que ativa os Feeds de Salesforce e IBM) as citem pelo id.
- **Carga** (`drizzle/0004_provider_catalog_load.sql`): os 13 Providers da spec com `INSERT ... ON CONFLICT (id) DO UPDATE`, então num banco que já os tem os ids, Incidents e leituras ficam intactos; nome, site, tipo, logo e status page vêm da antiga lista de metadados do código. Fontes: 12 Feeds (Salesforce e IBM inativos, Oracle sem Feed) e 26 Probes (status page e login de cada Provider), todas em HTTPS.
- **Famílias de Feed** (`lib/provider-catalog.ts`): `FEED_FAMILIES` com `statuspage`, `aws-rss`, `azure-rss`, `google-cloud`, `heroku`, `salesforce`, `ibm-rss`, e `isFeedFamily` para o Ticket 08 tratar família desconhecida. RSS da AWS e da Azure ficam separados porque hoje têm leitores distintos; juntá-los, se o payload real permitir, cabe ao Ticket 08/10. A coluna `family` é texto livre de propósito: família desconhecida vira Feed não lido, não erro.
- **Leitura do Snapshot**: `getLatestStatus(now)` lê `getActiveProviders()` (ativos, por `display_order`) e devolve `{ provider, result }` por Provider. A página monta cards, nome, logo, link e Major Providers a partir disso; não há mais junção por id com uma lista do código, então um card não pode sumir por divergência.
- **Removidos**: `providersList` (`lib/fetchers/index.ts`), `ensureProvidersExist` (`lib/db-service.ts`) e a chamada dela no Poll (`lib/cron.ts`), `upsertProvider` e `getAllProviders` do DAO, o `providerSchema` de validação (só servia à escrita do catálogo pelo código), `MAJOR_PROVIDERS` de `lib/internet-health.ts` (o módulo continua puro e recebe `majorProviders`; a página passa os marcados no catálogo) e `update-logos.mjs` (e a entrada dele no ESLint). Testes descartados: o que conferia a gravação de cada item da lista do código, os do `upsertProvider` e os do `providerSchema`.
- **Deploy**: `build:prod` passa a ser `npm run db:migrate && next build` (sem `db:up` nem `db:generate`).
- **Testes**: `__tests__/helpers/migrated-db.ts` cria um SQLite em memória (libsql) com as migrations reais pelo migrator do Drizzle, opcionalmente só até uma tag, para montar o banco no formato antigo. `__tests__/lib/provider-catalog-migration.test.ts` confere a carga (13 Providers, ordem, quatro Major Providers, metadados, Feeds com família e URL, Salesforce e IBM inativos, Probes, famílias conhecidas) e o caso de banco existente (ids, Incident e leitura preservados). `__tests__/lib/snapshot-catalog.test.ts` confere a leitura do Snapshot no banco real: ordem, dados do catálogo, Provider inativo fora do Snapshot com o histórico mantido.

**Migrations novas.**

- `drizzle/0003_provider_catalog.sql` (gerada): cria `provider_sources` e adiciona as quatro colunas a `providers`.
- `drizzle/0004_provider_catalog_load.sql` (custom, de dados): carga do catálogo.
- Snapshots `drizzle/meta/0003_snapshot.json`, `0004_snapshot.json` e `_journal.json` atualizados. `npx drizzle-kit check`: sem problemas.

**Notas para o operador (deploy de produção).**

- O deploy aplica `0003` e `0004` pelo `db:migrate` do `build:prod`. A `0004` atualiza os 13 Providers existentes no lugar (mesmos ids) e insere os que faltarem; Incidents e leituras gravados continuam ligados.
- O `build:prod` não roda mais `drizzle-kit up` nem `generate`. Se o banco de produção tiver migrations geradas no servidor e não commitadas (pelo `build:prod` antigo), conferir antes do deploy que a tabela `__drizzle_migrations` de produção só tem as migrations `0000` a `0002` deste repositório; o migrator do Drizzle aplica as que têm data posterior à última registrada.
- A partir daqui, toda mudança no catálogo (incluindo trocar um logo) é uma migration de dados nova; o Poll não grava mais os Providers.

**Para depois.**

- Poll guiado pelo catálogo, Probes e família desconhecida no Poll: Ticket 08. Até lá o Poll ainda usa os leitores fixos em `lib/fetchers/index.ts`: um Provider desativado por migration some da página, mas continua sendo lido e gravado em `status_checks` até o Ticket 08.
- Marca de "só acesso" da Oracle: Ticket 08 (ela continua aparecendo, como hoje).
- Ativar os Feeds de Salesforce e IBM: Ticket 11.
