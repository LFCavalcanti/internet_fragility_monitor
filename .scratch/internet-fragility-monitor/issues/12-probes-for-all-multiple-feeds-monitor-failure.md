# 12: Probes para todos, vários Feeds e falha do monitor

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Todos os Providers ativos passam a rodar seus Probes a cada Poll. Com vários Feeds lidos, vence o pior estado e os Incidents se somam; se só parte dos Feeds foi lida, o card mostra a marca de Partial Reading ("1 de 2 feeds sem leitura"). Um Poll em que nenhuma fonte de nenhum Provider responde é descartado como falha do próprio monitor: nada é gravado e o problema vai ao log.

**Blocked by:** 10 e 11.

**Status:** done

- [x] Probes rodam para todos os Providers ativos
- [x] O módulo de Provider Status aplica vence-o-pior e Partial Reading; Unreachable quando nenhum Feed é lido e algum Probe responde
- [x] O card mostra a marca de Partial Reading
- [x] Poll sem nenhuma resposta não grava nada e registra no log
- [x] Testes: Provider com dois Feeds, um lido e outro não; dois Feeds com estados diferentes; Poll sem resposta descartado

## Comments

**O que mudou.** `fetchAllStatuses` devolve `ProviderReading` (`lib/status-feed/provider-reading.ts`): `accessOnly`, a `FeedReading` de cada Feed e o resultado de cada Probe, exatamente a entrada do módulo de Provider Status. O achatamento em `StatusResult` saiu da leitura; `StatusResult` ficou só como a leitura gravada que o Snapshot devolve. Todas as fontes de todos os Providers ativos correm em paralelo, cada uma com o próprio timeout de 10 s, e os Feeds extras deixaram de ser ignorados. O módulo decide `partialReading` (`{ unread, total }`) e o card mostra "1 de 2 feeds sem leitura".

**Caminho da Partial Reading até o card, sem coluna nova.** O Poll grava em `status_checks` uma linha por Feed, todas com a mesma hora (`toRecordedReadings`), e a leitura do Snapshot traz as linhas da hora mais recente (`getLatestStatusChecks`) e remonta um `FeedReading` por linha (`toProviderStatusInput`). O vence-o-pior e a marca saem do mesmo módulo, sem segundo caminho. Linhas antigas, uma por Poll, continuam valendo como um Feed. Hoje todo Provider tem no máximo um Feed ativo, então nada muda no volume de linhas.

**Para o Ticket 13.** A spec de Poll Recording fala em "uma leitura por Provider, com o Provider Status". Para manter a marca sem coluna nova, o módulo novo precisa continuar gravando uma linha por Feed. Com uma linha por Provider, a marca precisa de uma coluna, e isso muda o ticket (o 13 não é de esquema). O agrupamento pela mesma hora vale por Poll, o que o `checked_at` em segundos sustenta com um Poll a cada 5 minutos. O `runJob` foi exportado para os testes rodarem o descarte de verdade.

**"Respondeu" não é "foi lido".** A spec manda descartar quando nenhuma fonte respondeu, e o glossário define Down por fonte que não responde; Feed não lido é outra coisa (história 12). Vale para Feed a regra dos Probes: resposta HTTP abaixo de 500 conta como resposta, inclusive 200 fora do formato, 404 e 200 com o corpo travado (o código chegou). Timeout antes do código, erro de rede e 5xx não contam. Num Feed em dois endereços, basta um responder. `FeedReading` não lido ganhou `answered`. O módulo de Provider Status usa o mesmo critério para Down, e o Ticket 15 pode gravar "nenhuma fonte respondeu" com ele. Por um Feed com 200 fora do formato, um Poll sem mais nada é gravado, com aquele Provider Unreachable. Feed de família desconhecida conta como sem resposta.

**Sem nenhuma fonte.** Catálogo vazio ou nenhuma fonte ativa não é falha do monitor: o Poll segue, e o Provider sem fonte fica Unreachable, como no Ticket 08.

**Partial Reading e Incidents.** A linha gravada não diz de qual Feed o Incident veio até o Ticket 14. Sob Partial Reading, os Incidents do Feed lido são inseridos e atualizados, mas nenhum é encerrado, porque o ausente pode ser do Feed não lido; o que saiu do Feed lido fecha no primeiro Poll com todos lidos. No Snapshot, todos os Incidents vão juntos no primeiro Feed lido: o pior estado e a soma saem iguais, e as manutenções agendadas do Feed não lido seguem na Upcoming Maintenance até o Ticket 14.

**Migrations.** Nenhuma.

- **31/10/2026, code review do Ticket 12 (orquestrador):** sem correção agora; nenhum dos achados acontece com o catálogo atual, em que cada Provider tem no máximo um Feed ativo. Decisão técnica do orquestrador sobre a `DECISAO PENDENTE`: o Ticket 13 mantém uma linha por Feed, sem coluna nova, e o Ticket 15, que já é de esquema, passa para "uma leitura por Provider" da spec, com a marca de Partial Reading em coluna. Para o Ticket 13: a hora do último Poll ignora leituras `unreachable` (`lib/internet-health.ts`), e um Poll gravado só com Probes respondendo vira Stale; com o descarte de Poll, a hora deve ser a do Poll gravado. Para o Ticket 14: o comentário deste ticket de que "o pior estado sai igual" não vale sob Partial Reading, porque uma manutenção em andamento gravada do Feed não lido deixa o Provider em Maintenance, e a Upcoming Maintenance dele conta (contra a spec de Provider Status); os Incidents de Feed não lido devem sair da decisão, e os do Feed lido devem fechar mesmo com outro Feed não lido. Dois Feeds com o mesmo título duplicam a linha até o 14. Para o Ticket 15: num Feed em dois endereços, um 503 rápido aborta o outro, e `answered` pode ficar falso; Feed de família sem leitor conta como sem resposta sem ter ido à rede. Os dois pesam na regra de Down.
