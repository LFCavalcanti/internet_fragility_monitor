# 15: Down de ponta a ponta

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Cada Poll grava, por Provider, se nenhuma fonte respondeu. A leitura do Snapshot informa se o Poll anterior também ficou sem resposta, e o módulo de Provider Status declara Down no segundo Poll seguido. O card mostra Down com a cor mais forte da página e "Sem resposta da status page nem do serviço", e o hero destaca "status page e serviço sem resposta".

**Blocked by:** 14 (por recurso: esquema e módulo de Poll Recording).

**Status:** done

- [x] A leitura gravada guarda a indicação de que nenhuma fonte respondeu
- [x] A leitura do Snapshot informa a indicação do Poll anterior
- [x] Primeiro Poll sem resposta: Unreachable; segundo seguido: Down
- [x] Card e hero exibem Down com o destaque combinado; Down de Major Provider deixa o hero Critical
- [x] Testes: dois Polls seguidos sem resposta num SQLite em memória; Poll com resposta entre os dois zera a contagem
- [x] Migration gerada no worktree e listada nos Comments

## Comments

**O que mudou.** `status_checks` passa a ter uma linha por Provider em cada Poll, como a spec pede. `recordPoll` grava a indicação de que nenhuma fonte respondeu, `readSnapshot` lê as duas últimas leituras de cada Provider e preenche `previousPollUnanswered`, e o módulo de Provider Status, que já tinha a regra, declara Down. Quem chama `recordPoll` e `readSnapshot` não mudou. O card ganhou o texto e o destaque de Down; o hero já estava pronto desde o Ticket 05 (`DOWN_TEXT`, ícone, borda e Critical) e não mudou.

**Desenho das colunas.**

- `no_source_answered` (booleano, padrão falso): nenhum Feed e nenhum Probe respondeu. O padrão é o que protege as linhas antigas: nelas, "unreachable" pode ser só um Feed não lido com Probes de pé, porque esses Probes não eram gravados.
- `feeds` (JSON, anulável): `[{ sourceId, declared }]`, um item por Feed ativo no Poll, com `declared: null` para o Feed sem leitura. Guarda **quais** Feeds ficaram sem leitura e também a origem da leitura: lista vazia é leitura por Probes. Com isso o Snapshot não consulta mais o catálogo para interpretar uma leitura nova, e o item "Um Poll lido pelo catálogo novo" fecha nas duas metades: a leitura não troca de tipo, e cada Incident fica no seu Feed. Foi preferido a uma coluna só de ids não lidos porque aquela ainda dependeria do catálogo para saber quais foram lidos, e a uma tabela filha porque ela só repetiria a chave do Poll. O Ticket 16 limita o volume.
- `status` continua sendo a leitura, não o Provider Status decidido: o pior estado entre os Feeds lidos, ou "unreachable". A spec fala em gravar o Provider Status, mas ele depende do relógio e dos Incidents, e Down do Poll anterior; a decisão segue na leitura do Snapshot, por um caminho só, e `recordPoll` não precisou receber a decisão. Um estado só basta para o vence-o-pior: manutenção em andamento só vale quando o pior é "operational", e aí todos os Feeds lidos declararam isso. `feeds` guarda cada um de qualquer forma, e a decisão usa o que veio dali.
- Índice `status_checks_provider_checked_at`. A consulta de janela (`row_number`) custava 560 ms em 400 mil linhas, contra 210 ms da antiga. Com o índice e um `CROSS JOIN`, que no SQLite fixa `providers` por fora, sai em menos de 1 ms. Sem o `CROSS JOIN`, o planejador varria a tabela e levava 12 s (registrado no comentário de `latestChecks`).

**Migration.** `drizzle/0007_provider_reading.sql`, gerada pelo `drizzle-kit`: as duas colunas e o índice. Não é migration de dados. As linhas antigas ficam com `no_source_answered` falso e `feeds` nulo (`__tests__/lib/provider-reading-migration.test.ts`, a partir de um banco na `0006`).

**Linhas antigas.** Uma linha antiga nunca conta para Down: nem duas "unreachable" seguidas, nem depois do deploy. O primeiro Poll sem resposta depois do deploy é Unreachable, e o segundo é Down. Até o primeiro Poll novo, a leitura antiga é interpretada pelo catálogo, como antes. Uma linha antiga por Feed só existiria com dois Feeds ativos no mesmo Provider, o que nunca aconteceu (Comments do 14): a leitura pega só a mais nova, e os testes que montavam várias linhas à mão passaram a montar a linha nova, com as mesmas verificações.

**Poll anterior.** É a leitura gravada antes da última, para aquele Provider, em uma consulta só, com a ordem por hora e id: dois Polls no mesmo segundo contam como dois.

**Poll descartado.** Não conta nem zera. O glossário descarta o Poll como falha do próprio monitor, e ele não diz nada sobre o Provider: calado, descartado, calado é Down, porque os dois Polls gravados são seguidos; respondeu, descartado, calado é Unreachable; e a falha do monitor, sozinha, não põe ninguém em Down, por mais Polls que descarte. Vale o mesmo para um intervalo sem Polls, ou para um Provider reativado: os dois Polls gravados são vizinhos, sem olhar a hora.

**Quem conta como resposta.** `sourcesUnanswered(feeds, probes)`, em `lib/provider-status.ts`, é a regra única: a gravação, o descarte do Poll e a decisão a usam. Sem nenhuma fonte, não houve o que responder: um Provider sem fontes ativas nunca é Down, mesmo com o Poll anterior sem resposta. `answered` passou a obrigatório em `FeedReading`: a leitura gravada agora sabe, e um campo esquecido não pode virar Down falso. Nos testes, quem escrevia `{ read: false }` passou a dizer `answered: false`, que era o valor implícito. Como a linha guarda a resposta por Provider, um Feed não lido volta do banco com `answered` igual a "alguma fonte respondeu", e os Probes de um Provider com Feed não voltam; a decisão é a mesma. Probes de Providers com Feed chegam à gravação, e todo Provider do catálogo tem dois. Feed de família desconhecida conta como sem resposta (Comments do 12): com os Probes calados, é Down, e com um Probe de pé, Unreachable.

**Feed em dois endereços (achado do review do Ticket 12).** Hoje é a Salesforce. Um 503 rápido num endereço cancelava o outro, que podia ter respondido, e `answered` ficava falso. Os endereços agora correm até o fim, dentro do mesmo timeout de 10 s, e isso troca um teste, que dizia "cancela o outro, sem esperar o timeout": ele travava justamente o defeito. O custo é o Feed levar até 10 s quando um endereço falha e o outro trava, igual a um Probe que trava; o Poll já espera todas as fontes.

**Provider só com Probes.** Unreachable no primeiro Poll sem resposta, Down no segundo, Operational quando um Probe volta, sempre com a marca de "só acesso". No card, a marca aparece junto do texto de Down.

**Incidents em Down.** Não mudou nada: como no Unreachable, o Feed não lido não reconcilia, os Incidents gravados seguem como estão e na lista do card, e a Upcoming Maintenance não aparece. Nenhum texto novo.

**Mudanças visíveis.** Down aparece na página pela primeira vez: card com borda e fundo vermelho-escuros, ícone `text-red-700` e "Sem resposta da status page nem do serviço"; no hero, Down de Major Provider vira Critical, e de outro Provider, Unstable, com "Status page e serviço sem resposta". Um Provider que passou por uma migration de catálogo mostra a leitura como foi lida até o Poll seguinte, em vez de reinterpretá-la.

**Testes.** Novos: `__tests__/lib/provider-reading-migration.test.ts`; o bloco "Down: nenhuma fonte respondeu por dois Polls seguidos" e "a leitura gravada vale pelo que foi lido" em `poll-recording.test.ts`; "Down: da rede ao Snapshot" em `poll-catalog.test.ts`, com `runPoll` e a rede simulada; Down no card e no módulo. Os testes que abrem `status_checks` foram atualizados para a linha por Provider, conferindo também `feeds`.

**Fica para o Ticket 16.** Retenção e remoção de `response_time` e `severity`, sem antecipação aqui.
