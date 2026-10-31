# 13: Módulo de Poll Recording contra SQLite real

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência

**What to build:** A gravação de um Poll e a leitura do Snapshot passam a viver num módulo só, que absorve as camadas de acesso, validação e reconciliação. O banco é recebido pelo módulo em vez de aberto no import, a gravação de um Poll é uma transação e a leitura do Snapshot usa um número fixo de consultas. O comportamento visível não muda; os testes passam a rodar contra um SQLite real em memória.

**Blocked by:** 12.

**Status:** done

- [x] Um módulo com as operações gravar um Poll e ler o Snapshot; camada de acesso, validação e reconciliação absorvidas
- [x] O banco é criado uma vez na inicialização e passado ao módulo; o log não imprime a URL do banco
- [x] A gravação de um Poll é uma transação: falha no meio não deixa nada gravado
- [x] A leitura do Snapshot usa número fixo de consultas
- [x] Status gravados validados contra o vocabulário do domínio
- [x] A diretiva de server action sai dos módulos que só rodam no servidor; funções sem uso em produção são apagadas
- [x] Testes com SQLite em memória e migrations reais; os testes com mock da camada de acesso, da reconciliação e da conexão, o teste de exemplo do setup e as partes de validação sem uso são apagados

## Comments

**O que mudou.** `lib/poll-recording.ts` absorveu `lib/dao.ts`, `lib/db-service.ts`, `lib/validation.ts` e `lib/snapshot-reading.ts`, que foram apagados, com as diretivas de server action (quem os importava, `app/page.tsx`, `lib/cron.ts` e o módulo de Status Feed, roda só no servidor). O módulo expõe `recordPoll(db, readings, at?)`, `readSnapshot(db, now)` e `readActiveCatalog(db)`, esta última a leitura do catálogo que o Poll precisa. O banco é sempre recebido. Renomeados pelo glossário: `runJob` para `runPoll`, `fetchAllStatuses` para `readAllProviders(catalog)`, que agora recebe o catálogo e não toca no banco, e `sourcesByProvider` para `groupByProvider`, porque agrupa leituras e Incidents também. `readIncidentsOf(feeds)`, em `lib/provider-status.ts`, substitui o `flatMap` repetido.

**Interface para o Ticket 15.** `readSnapshot` devolve `{ providers, lastPollAt }`, e cada entrada traz `reading`, a entrada do módulo de Provider Status sem o relógio. A página só faz `decideProviderStatus({ ...entry.reading, now })`; `StatusResult` saiu, e o card recebe `lastUpdated`. A linha por Feed em `status_checks` ficou em duas funções privadas do módulo, `toRecordedReadings` e `toStatusInput`: a troca para uma leitura por Provider muda só as duas e os testes que abrem as tabelas. `previousPollUnanswered` já viaja em `reading`, ainda sempre falso.

**Hora do Poll (mudança visível).** `lastPollAt` é a leitura mais nova dos Providers ativos, sem filtro: todo Poll gravado grava todos eles, e o Poll sem resposta nem chega a gravar. Saiu `lastAnsweredPollAt`. Um Poll em que só Probes de Providers com Feed responderam não vira mais Stale, e com todos Unreachable o hero mostra o Internet Health com a hora real, em vez de "No Poll recorded yet." ou de um Stale falso. O item de `ISSUES_ANNOTATION.md` foi fechado. Os casos do teste antigo foram para `snapshot-catalog.test.ts`, inclusive Stale com 16 minutos sem Poll gravado e banco sem Poll.

**Transação.** Validação, leituras e reconciliação valem para o Poll inteiro: um erro desfaz todos os Providers, inclusive os já gravados na transação. Isso resolve o defeito dos Comments do Ticket 09 (um Incident ruim parava os Providers seguintes) na direção oposta: agora nada do Poll é gravado, a página fica com o Poll anterior e `runPoll` registra "Poll não gravado:" no log, sem rejeitar; o agendador segue, e o Poll seguinte tenta de novo. A recusa na gravação é só a última barreira: a política de leitura corta os textos, os leitores só produzem status do vocabulário, e um Incident com título vazio ou só de espaços deixa aquele Feed não lido, com registro no log (correção pós-review, ver abaixo). Os testes cobrem falha real do banco, por trigger, e valor inválido.

**Validação.** O enum de status passa a valer de verdade: leitura contra `ReadingStatus` e Incident pela fase do seu tipo (problema não aceita fase de manutenção). Título de 1 a 500 e descrição até 5000. A diferença para antes é o título só de espaços: a regra antiga o aceitava e gravava vazio, a nova o recusa. A validação não altera mais o título: o `trim` antigo gravava o título cortado, ele não casava mais com o do Feed e cada Poll criava uma linha nova. `INCIDENT_TITLE_MAX` e `INCIDENT_DESCRIPTION_MAX` moram em `lib/incident-status.ts`, módulo puro que a política de leitura e a gravação importam sem levar o banco.

**Consultas.** A reconciliação faz uma consulta de Incidents por Provider com Feed lido, e um mapa por título no lugar de um `find` por item; a gravação continua por item. A reconciliação por título é a mesma, inclusive a comparação com o estado antes do Poll, até o Ticket 14. `checked_at` agora é uma hora só para o Poll inteiro, e encerramentos e atualizações usam essa hora. `readSnapshot` são quatro consultas num `batch`, que também garante um só instante do banco (história 5); os encerrados entram por um corte em SQL na janela de 48 h, e a regra exata continua em `isRecentlyResolved`. `status_checks` não tem índice, e a última leitura por Provider varre a tabela: o Ticket 16 limita o tamanho, e um índice, se fizer falta, é migration.

**Banco.** `lib/db.ts` não conecta no import nem imprime a URL. A conexão fica em `globalThis`, porque a instrumentação e as páginas são empacotadas em separado e cada uma teria a sua cópia do módulo. `instrumentation.ts` chama `initCron(getDb())`, sem esperar, como antes (`register` precisa terminar antes do servidor responder), e a página chama `readSnapshot(getDb(), now)`. Sem `DATABASE_URL` em produção, o erro continua na subida.

**Testes.** Novos: `__tests__/lib/poll-recording.test.ts`, `__tests__/lib/db.test.ts` (conexão, reescrito sem mock de banco) e `__tests__/lib/cron.test.ts` (reescrito com banco real; só `node-cron` e a rede são simulados). Apagados: `dao.test.ts`, `db-service.test.ts`, `validation.test.ts` e `setup.test.ts`; cada caso em uso em produção foi levado para `poll-recording.test.ts`, e os de funções sem uso (`urlSchema`, `safeValidate`, `getProviderById`, `upsertIncident`) saíram com elas. `migrated-db.ts` ganhou `statementsDuring`, usado para conferir que o número de consultas não cresce. O SQLite em memória do `@libsql/client` 0.18 tem uma conexão só: com a transação aberta, qualquer outra leitura pelo mesmo cliente rejeita, o que não acontece com banco em arquivo (conferido com 1000 itens e leituras concorrentes).

**Migrations.** Nenhuma. Esquema intacto.

**Correção pós-review (31/10/2026).** Na entrega, um Incident com título em branco passava pelos leitores (Statuspage, Salesforce e Heroku só exigem `min(1)`; na IBM, o título "RESOLVED:" fica vazio depois de tirar a marca de fase) e a gravação recusava o Poll de todos os Providers, enquanto o item ficasse no Feed: a página inteira virava Stale. Isso contrariava `spec-status-feed.md` (histórias 12 e "uma fonte que falha não afeta as outras"). `readFeed` agora trata esse caso como conteúdo fora do formato, num ponto só para todas as famílias: aquele Feed fica não lido e os demais Providers gravam normalmente. O Provider afetado aparece Unreachable, ou como Partial Reading se tiver outro Feed, até o item sair do Feed. Saíram também os tipos sem uso `NewIncident`, `NewStatusCheck` e `StatusCheck` de `lib/schema.ts`. A checagem de URL de até 2048 caracteres saiu com `lib/validation.ts`, sem registro na entrega: o banco não tem limite de tamanho, então nada quebra.

**Fica para depois.** Os achados do review do Ticket 12 para os Tickets 14 e 15 continuam lá. "Um Poll lido pelo catálogo novo" (`ISSUES_ANNOTATION.md`) não saiu aqui, porque exige gravar a origem da leitura numa coluna; o texto do item aponta para o Ticket 15.
