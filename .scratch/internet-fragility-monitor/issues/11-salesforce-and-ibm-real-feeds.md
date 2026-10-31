# 11: Feeds reais da Salesforce e da IBM

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed, (esquema)

**What to build:** Salesforce e IBM passam a ter o estado declarado pelos próprios Feeds: a API de incidentes e manutenções da Salesforce e o RSS da IBM. Uma migration de dados ativa os dois Feeds no catálogo, e os dois Providers perdem a marca de "só acesso".

**Blocked by:** 09 e 10 (10 por recurso: registro de famílias e diretório de leitores).

**Status:** done

- [x] Leitor da família Salesforce (incidentes ativos e manutenções, com ids numéricos)
- [x] Leitor da família RSS da IBM (`guid` como id)
- [x] Migration de dados ativa os Feeds de Salesforce e IBM
- [x] Fixtures reais das duas famílias e testes de leitura
- [x] Migration gerada no worktree e listada nos Comments

## Comments

**O que mudou**

- `lib/status-feed/readers/salesforce.ts` e `ibm-rss.ts`, registrados em `FEED_READERS`, que agora é um `Record` completo: o compilador pede o leitor de toda família.
- `FeedReader` passou de `address` e `read(body, address)` para `addresses` e `read(bodies, addresses)`: o Feed da Salesforce é uma fonte só em dois endereços, como a spec do catálogo pede (uma URL, `/v1`). Um timeout vale para os dois, o Feed só conta como lido com os dois, e um que falha cancela o outro (`controller.abort()` no `finally`).
- Limpezas pedidas: `readers/problem-state.ts` com `declaredByOpenProblems` e `problemPhase`, usadas por AWS, Azure, Google Cloud, Heroku e IBM; `PublishedIncident` foi para `types.ts`, e `ReadIncident` deriva dele; o cabeçalho de `read-policy.ts` cita os limites de gravação. `declaredByOpenProblems` só olha problemas: na IBM, uma manutenção aberta no mesmo Feed não pode degradar.
- `parseRssItems` lê `category`, sempre como lista.
- `isAccessOnly` não mudou: Salesforce e IBM perderam a marca só pela migration, conferido em `poll-catalog`, `snapshot-catalog` e `salesforce-ibm`. Os casos de "só com Probes" dos dois passaram para a Oracle, ou desativam o Feed no próprio teste.

**Esquema e migrations**

- `drizzle/0005_activate_salesforce_ibm_feeds.sql`: só dados, ativa `salesforce-feed` e `ibm-cloud-feed`. As URLs da `0004` foram conferidas contra os Feeds reais e estão certas; nenhuma mudou.
- **Para o operador:** a `0005` entra na lista de migrations de `ISSUES_ANNOTATION.md` 2.1 (já acrescentada). No Poll logo depois do deploy vale o item "Um Poll lido pelo catálogo novo" de 2.2: o último "operational" dos Probes é lido como Feed por um Poll.

**Fixtures** (em `__tests__/fixtures/status-feed/`, coletadas em 30/10/2026 às 22:17 BRT, 31/10 01:17 UTC)

- `salesforce/incidents-active.json`: resposta real inteira de `/v1/incidents/active`, com um incidente `major`.
- `salesforce/maintenances.json`: 8 itens reais, sem `timeline`, um de cada situação: `Active`, `Resolved`, `Canceled`, `Rescheduled`, `Confirmed` com data passada e com data futura. Vêm de duas consultas: a lista inteira paginada (18.031 itens) e a janela do leitor (1000 itens).
- `ibm-rss/feed.rss`: Feed real, com os itens cortados de 741 para 7 (todos os `incident` e `security`, dois `announcement`, dois `release_note`). O XML dos itens é o original.
- `ibm-rss/incidents-and-maintenance-2020-09-26.xml`: captura do Wayback Machine (`20200926120254`), cortada de 288 para 8 itens, porque o Feed de hoje não tem incidente aberto nem manutenção. A captura `20261010135627` também não tem; as outras não puderam ser baixadas (o Wayback Machine respondeu 429).
- Os payloads inteiros de 31/10/2026 e a captura inteira de 2020 passaram pelos leitores sem erro, numa conferência fora da suíte.

**Formatos confirmados**

- **Salesforce:** `id` numérico nas duas listas (`20004549`, `20175289`), convertido para texto. `externalId` existe, mas vem vazio em parte dos itens e não é o id que a spec cita. O Feed não publica título de incidente: o título é `<type> #<id>`, como `Disruption #20004549`, que não muda com a resposta nem com as instâncias afetadas.
- **IBM:** `guid` é `INC12259399` nos incidentes e `CHG0886589` nas manutenções. `category` classifica o item: `incident` e `maintenance` são Incidents; `announcement`, `release_note` e `security` não são, e são 740 dos 741 itens de hoje.
- A raiz `/v1` devolve a documentação Swagger da API, de onde vieram os parâmetros e as listas publicadas.

**Fim de um Incident na IBM.** Não há campo de fase. Procurei antes de recorrer ao texto: o item só tem `title`, `description`, `link`, `guid`, `category` e `pubDate`, e `/status/api/notifications` responde 404. O que há é o prefixo do título e um rodapé fixo gerado pela IBM no fim de `description` (`Outage Start`, `Outage End`, `Update Time`), mais sólido que a narrativa. Regra e amostra em `ISSUES_ANNOTATION.md` 1.2. Os 72 incidentes com RESOLVED na captura de 2020 têm `Outage End`, e o de hoje também. O único com outro prefixo (`INC2825083`, INVESTIGATING) também tem, e seguia assim semanas depois do fim: por isso `Outage End` encerra sozinho. A hora de resolução é a do rodapé. O título vem sem o prefixo, para o mesmo Incident não trocar de título entre as fases.

**Escolhas registradas**

- **Salesforce, estado declarado:** o pior impacto aberto; `major` é Outage, e o resto, com incidente ativo, é Degraded. `minor` e `major` são os dois valores publicados por `/incidents/impactTypes`; outro valor é conteúdo fora do formato. Nos RSS não há gravidade, e por isso seguem com Degraded.
- **Salesforce, fase da manutenção:** o campo `status`. `Active` é em andamento, `Resolved` é encerrada e `Confirmed` é agendada, mesmo depois da data, porque a Salesforce deixa manutenções passadas como `Confirmed` (as de 29/10 na fixture); com data passada, não contam como Maintenance nem como Upcoming Maintenance, como na Heroku. `Canceled` e `Rescheduled` não vão acontecer e não são lidas. A lista não é publicada; os cinco valores são todos os das 18.031 manutenções, e outro valor é conteúdo fora do formato (história 12).
- **Salesforce, janela:** `/v1/maintenances` sem filtro devolve 1000 itens fora de ordem, e a manutenção em andamento da coleta não estava entre eles. O leitor pede `startTime` de três dias atrás, `sort=plannedStartTime`, `order=ASC`, `limit=1000`. A API não tem filtro por status (`status=` é ignorado), e `sort=status` não põe as ativas no começo. O filtro `startTime` olha a data de início, arredondada para o dia, por isso uma janela menor perderia manutenções em andamento (99% duram até 55 h). O limite e o efeito nos fins de semana de release estão em `ISSUES_ANNOTATION.md` 1.2. Paginar custaria até 7 MB por Poll só para esses dias.
- **Salesforce, relógio no leitor:** o endereço leva a hora atual, mas o conteúdo continua lido sem relógio: `addresses` monta o pedido e `read` só interpreta.
- **Salesforce, Incidents encerrados:** os incidentes vêm só de `/incidents/active`, como o ticket pede. Quem sai da lista é encerrado pela gravação, com a hora do Poll.
- **IBM, estado declarado:** Degraded com incidente aberto, como nos outros RSS.
- **IBM, manutenção sem marca:** fica agendada, com `scheduledFor` em `Outage Start`. "Maintenance:" com inicial maiúscula só apareceu num item de 2018 sem datas; só `MAINTENANCE:` conta como em andamento.

**Mudanças visíveis**

- Os cards de Salesforce e IBM deixam de mostrar a marca de "só acesso" e passam a mostrar o que o Feed declara.
- Na coleta, a Salesforce estaria em Outage (`major` em USA1230) e a IBM em Operational.
- O card da Salesforce ganha uma linha de Upcoming Maintenance com centenas de itens, um por instância (cerca de 900 na coleta). Até o Ticket 14 vale o item de título em `ISSUES_ANNOTATION.md` 2.2.

**Para o Ticket 14:** ao trocar a identidade, a Salesforce passa a ter cerca de 1000 Incidents lidos por Poll; a busca `allDbIncidents.find` por item vale a pena rever. **Para o Ticket 16:** essas linhas contam na retenção.
