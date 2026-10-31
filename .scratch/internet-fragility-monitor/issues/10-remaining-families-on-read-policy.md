# 10: Demais famílias na política única

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Os leitores de RSS da AWS, RSS da Azure, Google Cloud e Heroku passam a usar a política de leitura única, com validação do conteúdo e o id publicado por cada Feed (`guid` nos RSS, `id` no Google Cloud e na Heroku). Os tipos `any` restantes dos leitores somem.

**Blocked by:** 09.

**Status:** done

- [x] Os quatro leitores usam a política e não repetem busca, medição nem tratamento de erro
- [x] Cada leitor valida o conteúdo com Zod e emite Incidents com fonte e id
- [x] Os erros de lint no-explicit-any dos leitores chegam a zero
- [x] Uma fixture real por família; formato do id de Heroku e Azure confirmado nas fixtures
- [x] Testes de leitura de cada família pela interface do módulo de Status Feed

## Comments

- **28/10/2026, decisão do usuário (orquestrador):** o RSS da AWS publica cada *atualização* como um item; o `guid` tem o formato `https://status.aws.amazon.com/#<evento>_<timestamp da atualização>` (ex.: `multipleservices-me-central-1_1789468030`). Em 28/10/2026 os 38 itens do RSS eram 2 eventos (me-central-1 e me-south-1, abertos desde 01/03/2026, última atualização 15/09/2026), nenhum marcado como resolvido. Regra decidida: o leitor da AWS **agrupa as atualizações pelo evento** (parte do `guid` antes do último `_`), que vira o id do Incident, com a data da última atualização; o evento fica ativo até a AWS marcá-lo como resolvido (nada de encerrar por silêncio). O `guid` inteiro não serve de id, porque muda a cada atualização. Conferir se o RSS da Azure tem o mesmo padrão antes de escolher o id dela. Também desta onda: os leitores devem usar `isClosed` de `lib/incident-status.ts` em vez de `status !== 'resolved'` (achado do review do Ticket 04).
- **29/10/2026, code review do Ticket 07:** o 07 deixou RSS da AWS e RSS da Azure como famílias separadas porque os leitores eram distintos, sem conferir o payload real, como pede a spec do catálogo ("conferida com payload real"). Com as fixtures reais deste ticket, confirmar se os formatos divergem; se não divergirem, unir as famílias exige migration de dados e fica como proposta para o usuário.
- **30/10/2026, implementação.**

**O que mudou**

- `lib/fetchers/` inteiro saiu. Os tipos foram para `lib/status-feed/types.ts`, sem a interface `Fetcher`. Os leitores novos são objetos `FeedReader` em `lib/status-feed/readers/`: `aws-rss.ts`, `azure-rss.ts`, `google-cloud.ts` e `heroku.ts`. `rss.ts` (parser e schema, pronto para o RSS da IBM no Ticket 11) e `feed-date.ts` são compartilhados.
- `LEGACY_READERS` sumiu; `FEED_READERS` tem as cinco famílias, e o Ticket 11 só acrescenta `salesforce` e `ibm-rss`. Com isso toda fonte tem timeout de 10 s, fonte isolada, `cache: "no-store"` e duração no log; `next: { revalidate: 60 }` saiu.
- `sourceId` e `externalId` saíram de `IncidentData`. O Incident lido é `ReadIncident` (`IncidentData` mais os dois obrigatórios), e `StatusResult` ficou genérico: `fetchAllStatuses` devolve `StatusResult<ReadIncident>[]`, o banco segue com `IncidentData` até o Ticket 14.
- `FeedReader.read` recebe também o endereço lido, usado pelo Google Cloud para resolver o link relativo (`incidents/<id>`) sem URL fixa no código.
- Renomeados `unread` para `unreachableResult` e `attempt` para `applyReadPolicy`. `hang`, o carregador de fixtures e `healthyResponse` foram para `__tests__/helpers/status-feed.ts`.
- Os leitores usam `isClosed`. `read-failure.test.ts` e `readers-deliver-every-incident.test.ts` saíram: os mesmos casos estão em `__tests__/lib/status-feed/feed-families.test.ts`, com timeout, 5xx, erro de rede e conteúdo fora do formato por família.

**Fixtures** (em `__tests__/fixtures/status-feed/`, coletadas em 30/10/2026 às 21:58 BRT, 31/10 00:58 UTC)

- `aws-rss/all.rss`: RSS real inteiro, 39 itens de 3 eventos.
- `azure-rss/no-incidents.xml`: Feed real de agora, vazio. `azure-rss/active-incident-2024-12-27.xml`: captura do Wayback Machine (`20241227041223`), porque hoje não há item; é o único jeito de ver o `guid` real.
- `google-cloud/incidents.json`: 8 Incidents, todos encerrados na coleta. Só foram reduzidos `updates` (a mais recente e a primeira) e `affected_products` (dois).
- `heroku/current-status.json`: real, sem Incidents e com 3 manutenções. `heroku/open-incidents-2022-04-27.json`: captura do Wayback Machine (`20220427051425`), com dois Incidents abertos e Data e Tools em amarelo. `/api/v4/incidents` também foi consultado em 30/10/2026.

**Formato do id e divergência entre os RSS**

- **Heroku:** `id` numérico (`2966`, `2423`), convertido para texto.
- **Azure:** `guid` é um slug legível e fixo do evento (`active-storage-latency-timeouts-or-http-500-errors-in-south-central-us`), com um item por evento e sem instante. Os 4 itens reais de 2024 no Wayback Machine têm esse formato. O Feed lista só o que está em andamento.
- **AWS × Azure:** os formatos divergem (na AWS, um item por atualização, com `guid` `#<evento>_<instante>`). As famílias ficam separadas, e não há proposta de unificação.

**Encerramento na AWS, conferido na fixture:** o RSS não tem campo de fase. O evento `apigateway-us-west-2` termina a descrição com "The issue is resolved and the service is operating normally.", com título "Service impact: ...". A regra antiga, só pelo título, o deixaria ativo. O evento fecha quando a última atualização traz `resolved` no título ou termina com "service(s) is/are operating normally"; a data de resolução é a dela. Os 2 eventos do Oriente Médio não têm a marca e seguem ativos, sem encerramento por silêncio.

**Escolhas registradas**

- O evento da AWS é serviço e região, então uma nova ocorrência repete o id. As atualizações até um resolvido anterior não contam para a data de início da ocorrência atual. **Para o Ticket 14:** um id de AWS encerrado pode voltar a abrir legitimamente.
- `createIncident` lançava com os textos reais do Google Cloud (relatórios de até 18.154 caracteres, limite de 5.000), o que, pelo código, interrompe a gravação dos Providers seguintes daquele Poll (não conferido em produção). O Ticket 09 tinha observado o risco com "nenhuma fixture chega perto"; esta chega. `readFeed` agora corta título e descrição aos limites da gravação (`INCIDENT_TITLE_MAX` e `INCIDENT_DESCRIPTION_MAX` em `lib/validation.ts`), para todas as famílias. O resto do item do Ticket 09 (transação e validação) continua no Ticket 13.
- Heroku: `declared` é o pior estado entre os sistemas, em vez de só Apps. O Glossário define Degraded como parte dos serviços; na fixture de 2022, Data e Tools em amarelo com Apps verde dariam Operational com dois Incidents abertos. É mudança visível.
- Heroku: cor fora de `green`/`yellow`/`red`, lista `status` vazia ou sem `incidents`/`scheduled` é conteúdo fora do formato (antes virava Operational). `state` não é lista fechada: só `open`, `resolved` e `upcoming` foram vistos e não há lista publicada; `resolved` encerra, e o resto de `incidents` segue `investigating`, como antes.
- Heroku: a lista `scheduled` passa a ser lida como manutenção (spec, "Classificação de manutenção pelo Feed"). O Feed deixa manutenções passadas com `state: "upcoming"` e `resolved: false`: a atualização do tipo `resolved` as encerra, e as outras ficam `scheduled` com `scheduledFor = created_at`, que na fixture é o início anunciado. Com data passada, não contam como Upcoming Maintenance nem como Maintenance. A fase `in_progress` não existe no Feed.
- Google Cloud, AWS e Azure seguem declarando Degraded com qualquer Incident ativo, como antes; nenhum ticket pede ler a gravidade publicada.
- Título de RSS, data e os campos `id`, `service_name` e `external_desc` do Google Cloud agora são obrigatórios: o antigo "Unknown Issue" saiu, e o item vira conteúdo fora do formato.

**Observado, fica para o Ticket 14:** na AWS, os dois eventos do Oriente Médio têm o mesmo título, e na Heroku as manutenções também. A gravação ainda casa pelo título; os itens estão em `ISSUES_ANNOTATION.md`.

**Esquema e migrations:** nenhuma.

- **30/10/2026, code review do Ticket 10 (orquestrador):** dois defeitos na marca de fim da AWS, corrigidos com teste: "All other services are operating normally." encerrava o evento, e "The issue has been resolved.", "All services are now operating normally." e a frase certa seguida de `<a>` não encerravam. A marca agora vale só na última frase, sem links. Pendentes para o usuário, em `ISSUES_ANNOTATION.md` 1.1: qual data o card mostra para o evento da AWS (início ou última atualização, como dizia a decisão de 28/10) e se vermelho só em Tools chega a Outage na Heroku. Divergência de textos, sem efeito no código: o `GLOSSARY.md` diz que o id nunca é o título, e `spec-status-feed.md` permite o título quando o Feed não publica id, caso da Azure sem `guid`.
