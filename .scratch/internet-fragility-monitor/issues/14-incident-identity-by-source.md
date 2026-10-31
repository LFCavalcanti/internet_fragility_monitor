# 14: Identidade do Incident pela fonte

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Um Incident passa a ser identificado pela Provider Source mais o id publicado pelo Feed. Manutenções com o mesmo título viram Incidents diferentes, um título repetido meses depois vira Incident novo, e um Feed não lido não resolve seus Incidents. Os Incidents antigos sem id passam uma única vez pela reconciliação por título; os abertos que ninguém assumir são resolvidos.

**Blocked by:** 13.

**Status:** done

- [x] Incidents ganham fonte e id externo, com unicidade do par
- [x] Reconciliação: insere novo, atualiza conhecido, resolve ausente só de Feed lido
- [x] Passagem única: Incident com id assume linha antiga sem id, aberta, do mesmo Provider e título; as não assumidas são resolvidas no fim desse Poll
- [x] As duplicatas da Cloudflare deixam de ser criadas
- [x] Testes com SQLite em memória para cada um desses casos
- [x] Migration gerada no worktree e listada nos Comments

## Comments

**O que mudou.** `incidents` ganhou `source_id` (referência a `provider_sources`) e `external_id`, com índice único no par. `reconcileIncidents` monta um índice em memória pelo par, a partir de uma consulta por Provider, e grava só o que mudou. `FeedReading` não mudou: a leitura de um Poll passou a `SourcedFeedReading` (`lib/status-feed/provider-reading.ts`), posta em `readFeedSource`, para um Feed lido sem Incidents dizer qual Feed foi. `readFeed`, `lib/cron.ts` e o módulo de Provider Status ficaram como estavam; `recordPoll` agora exige `ProviderReading<ReadIncident>`.

**Migration.** `drizzle/0006_incident_identity.sql`, gerada pelo `drizzle-kit`: duas colunas anuláveis e o índice `incidents_source_external_unique`. Não é migration de dados: a linha de produção fica sem fonte até o primeiro Poll, e várias linhas assim convivem, porque o SQLite não compara NULL em índice único (`__tests__/lib/incident-identity-migration.test.ts`, a partir de um banco na `0005`).

**Reconciliação.** Com a fonte na linha, o Feed lido encerra o que saiu dele mesmo com outro Feed do Provider não lido, e o Incident de Feed não lido fica como está. O que saiu de um Feed enquanto ele esteve fora fecha no primeiro Poll em que ele for lido.

**Passagem única, escolhas.**

- Disputa de uma linha: vale a ordem do Feed. O primeiro Incident assume, o outro é inserido. A escolha não aparece na página, porque quem assume sobrescreve tudo com o que o Feed publica, menos o que o Feed não trouxer (descrição e link).
- Várias linhas antigas com o mesmo título (as duplicatas da Cloudflare): cada Incident assume uma, da mais nova para a mais antiga; a que sobra é resolvida.
- Partial Reading: o Incident do Feed lido ainda assume, mas as linhas não assumidas ficam abertas, porque podem ser do Feed não lido (história 4). São assumidas ou resolvidas no primeiro Poll com todos os Feeds lidos. Com nenhum Feed lido, nada acontece.
- Provider só com Probes: `feeds` vazio, não reconcilia, e a linha antiga fica aberta como antes (`ISSUES_ANNOTATION.md` 1.2).
- O título é procurado só entre as linhas antigas abertas, e nenhuma resta depois da passagem: quem volta depois com aquele título vira linha nova. Linha antiga já encerrada nunca é assumida.
- A comparação de títulos ignora espaços nas pontas: a validação antiga gravava o título cortado (Comments do Ticket 13).

**Incident conhecido, escolhas.**

- Título e link acompanham o Feed. O glossário diz que o título não identifica; ele é só a publicação de agora, e o id continua o mesmo.
- `created_at` também acompanha o Feed. A spec manda atualizar "status, descrição e datas", e a nova ocorrência da AWS, com o mesmo id, precisa aparecer com a data dela (história 1). Isso troca um teste antigo, que dizia "sem mexer na criação": ele travava o comportamento anterior, sem caso que o pedisse.
- `resolved_at`: vale a hora publicada; sem ela, a hora do Poll, só para quem encerra agora. Quem já chegou encerrado guarda a sua, inclusive nenhuma (RSS da Azure), senão pareceria recém-resolvido no Poll seguinte. Antes, qualquer atualização de um encerrado movia a hora para a do Poll. O item de `ISSUES_ANNOTATION.md` 1.2 foi ajustado.
- Mudança agora inclui descrição, título, link e criação, comparados na precisão da coluna (segundos). Sem isso, uma data do Feed com milissegundos contaria como mudança em todo Poll, o que já valia para `scheduled_for`.
- Par repetido dentro de um Feed vira uma linha, vale o último. Sem isso a unicidade recusaria o Poll de todos os Providers. Conferido contra os dados: os ids de Incident e de manutenção da Salesforce são sequências separadas (20,004 mi e 20,17 mi em 31/10/2026), e não se cruzam na janela lida.
- O mesmo id em dois Feeds são dois Incidents: juntar entre Feeds está fora de escopo na spec.

**AWS.** O par reabre a linha: `resolved_at` limpo, status e `created_at` da nova ocorrência. É uma linha por par, então a ocorrência anterior não fica registrada à parte.

**Salesforce além do limite (achado do code review do Ticket 11).** Uma manutenção que só ficou além do limite de 1000 sai de um Feed lido e é encerrada como `completed`, como a spec manda. Quando volta à janela, o par a reabre. O card segue mostrando menos manutenções nesses dias, sem linha nova nem problema falso (`ISSUES_ANNOTATION.md` 1.2).

**Snapshot (achado do code review do Ticket 12).** Cada Incident vai para o seu Feed, e os de Feed não lido só entram na lista: não decidem o estado nem a Upcoming Maintenance. A n-ésima linha de `status_checks` do Poll é o n-ésimo Feed ativo, porque o Poll grava na ordem do catálogo, sem coluna nova. Incident sem Feed certo vai no primeiro Feed não lido, e, se todos foram lidos, no primeiro: é a linha antiga antes do primeiro Poll (decide como antes), o Incident de Feed desativado e o caso de o catálogo ter mudado depois do Poll.

**Para o Ticket 15.** A correspondência acima depende da linha por Feed. Ao passar para uma leitura por Provider, a coluna de Partial Reading precisa dizer **quais** Feeds ficaram sem leitura, não só quantos; com só a contagem, o Snapshot não separa mais os Incidents do Feed não lido. `toStatusInput` e `toRecordedReadings` concentram a troca.

**Fica como está.** Um Incident aberto de um Feed desativado nunca fecha: a spec manda deixar como está o que é de Feed não lido, e num Provider que ainda tem outro Feed ele segue no card. Não acontece com o catálogo de hoje (nenhum Provider tem mais de um Feed ativo, e sem Feed o card não lista Incidents); a migration de dados que desativar um Feed desses deve encerrar os Incidents dele (ADR 0001).

**Mudanças visíveis.** Manutenções de mesmo título aparecem todas (25 na Cloudflare, não 22), e a contagem da Salesforce deixa de oscilar. Um título repetido aparece como novo, com a data dele. Sob Partial Reading, manutenção do Feed não lido não põe mais o Provider em Maintenance nem conta na Upcoming Maintenance. No primeiro Poll depois do deploy, as linhas antigas não assumidas são resolvidas e entram nos Recent Incidents por 48 horas, e um problema recém-resolvido ainda publicado pode aparecer duas vezes nessa janela: a spec só assume linha aberta (`ISSUES_ANNOTATION.md` 2.1).

**Testes.** Novos em `__tests__/lib/poll-recording.test.ts` (identidade, passagem única e Incidents por Feed no Snapshot), `__tests__/lib/incident-identity-migration.test.ts` e `__tests__/lib/poll-catalog.test.ts` (da rede à gravação, com o payload real da Cloudflare). O teste "o título casa com o Incident mais novo" saiu, com a regra. Os itens de título de `ISSUES_ANNOTATION.md` 2.2 foram fechados.
