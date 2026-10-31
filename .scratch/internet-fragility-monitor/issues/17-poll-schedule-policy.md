# 17: Política de Poll Schedule

**Spec:** `spec-poll-schedule.md` · **Trilha:** T5 – Agendamento

**What to build:** A cadência de 5 minutos passa a existir num lugar só e vale para o agendador, a decisão de rodar ao iniciar, a atualização automática da página e o limite de Stale Snapshot. Um disparo que encontra um Poll em andamento é pulado e registrado no log. Relógio e disparo são injetados, e o node-cron vira só o adaptador que dispara.

**Blocked by:** 06 e 13.

**Status:** done

- [x] Política com cadência, limite de Stale Snapshot (três ciclos), regra de rodar ao iniciar e exclusão mútua
- [x] O módulo de Internet Health e a atualização automática da página usam a cadência da política
- [x] Disparo durante Poll em andamento é pulado e registrado; erro no Poll libera o próximo disparo
- [x] A marca que evita inicializar duas vezes é separada da marca de Poll em andamento
- [x] Testes com relógio, disparo e Poll falsos; o teste atual do agendamento, inclusive o caso vazio, é substituído

## Comments

**O que mudou.** `lib/poll-schedule.ts` é a política, um módulo puro: `POLL_CADENCE_MS`, `isStaleSnapshot` (mais de três ciclos, ou nenhum Poll) e `createPollSchedule`, que recebe relógio, forma de disparar, operação de Poll e leitura da hora do último Poll. `lib/cron.ts` virou só o adaptador: `initCron(db)` liga a política ao banco, e `cronExpressionFor(cadenceMs)` deriva a expressão do `node-cron`. `lib/internet-health.ts` perdeu `STALE_SNAPSHOT_AFTER_MS`. `AutoRefresh` recebe `cadenceMs` por prop, entregue por `app/page.tsx`. Nenhum desses tem número próprio.

**`runPoll` mudou para `lib/poll.ts`.** Assim o teste da operação de Poll não carrega o `node-cron`, e `lib/cron.ts` fica só com o adaptador. `poll-catalog.test.ts` mudou uma linha de import.

**Marcas.** São duas, no fechamento de `createPollSchedule`: `started` (já inicializei) e `pollStartedAt` (Poll em andamento, com a hora em que começou, que vai à linha de log do disparo pulado: "Disparo pulado: Poll em andamento desde ..."). O disparo pulado usa `console.warn`, e não há fila. A exclusão mútua nunca rejeita, e um `finally` libera a marca, mesmo com uma operação falsa que rejeita ou lança.

**Uma vez só por processo (história 9).** A instância da política fica numa variável de `lib/cron.ts`, não em `globalThis` como a conexão do Ticket 13. A conexão precisa disso porque instrumentação e páginas usam `getDb`. Aqui, só `instrumentation.ts` importa `lib/cron.ts`, as páginas importam apenas a constante de `lib/poll-schedule.ts`, cuja cópia no bundle delas não tem estado, e a documentação do Next diz que `register` roda uma vez por servidor. Conferido no build de produção (ver "Fronteira").

**Ordem na inicialização.** Consulta da hora, depois agendamento, depois Poll da inicialização, sem nada assíncrono entre agendar e tomar a marca. Antes o agendamento vinha depois do Poll, e nenhum disparo podia cair durante ele. Com a nova ordem:
- um disparo durante o Poll da inicialização é pulado como qualquer outro;
- um disparo não cai durante a consulta, porque ainda não há agendamento, então não existe a corrida de um Poll agendado e um Poll da inicialização decididos sobre a mesma hora antiga;
- um Poll lento na inicialização não atrasa o começo do agendamento.

`instrumentation.ts` não mudou: `initCron` continua sem `await`, porque `register` precisa terminar antes do servidor responder.

**Cadência como parâmetro.** `cadenceMs` é opcional em `createPollSchedule`, `isStaleSnapshot` e `decideInternetHealth`, com padrão na constante. Nada de produção passa outro valor: não há variável de ambiente nem configuração nova. Os testes usam 7 e 10 minutos para provar que o limite de Stale e a regra de iniciar acompanham a cadência.

**Limite do `node-cron`.** O campo de minutos só repete por igual dentro da hora para divisores de 60. `cronExpressionFor` recusa com erro qualquer outra cadência (7 minutos, 90 segundos, 60 minutos ou mais), em vez de agendar um ritmo desigual sem avisar. Mudar `POLL_CADENCE_MS` para 10 ou 15 minutos funciona sem tocar em mais nada; para 7, o monitor falha ao subir o agendamento com a mensagem. Uma cadência de hora em hora exigiria outra forma de expressão, que a spec não pede.

**Fronteira servidor e navegador.** `lib/poll-schedule.ts` não importa nada, e `lib/internet-health.ts`, que os componentes importam, só leva esse módulo a mais. `next build --webpack` rodado no worktree, com `DATABASE_URL` apontando para um arquivo do scratchpad (o Turbopack recusa o `node_modules` em junction): nenhum arquivo de `.next/static` contém `node-cron` nem o cliente do banco, e no servidor `node-cron` e o código da política só aparecem no chunk da instrumentação, que o bundle da página não carrega.

**Testes.** `__tests__/lib/poll-schedule.test.ts` é novo, com relógio, disparo e Poll falsos e todos os casos obrigatórios, além da borda de exatamente um ciclo e de exatamente três ciclos, Poll que rejeita ou lança, disparo durante o Poll da inicialização e duas inicializações simultâneas. `__tests__/lib/cron.test.ts` foi reduzido ao adaptador, com banco real e `node-cron` simulado: expressão derivada, leitura da hora no banco, banco fechado, Poll agendado grava, Poll descartado na inicialização. `__tests__/lib/poll.test.ts` recebeu os casos de `runPoll` do Ticket 13 (falha ao gravar, falha ao ler o catálogo, Incident sem título). `__tests__/components/auto-refresh.test.tsx` é novo. O caso de Stale com outra cadência também passa por `decideInternetHealth`, em `internet-health.test.ts`.

**Logs.** As mensagens do Poll ao iniciar deixaram de citar "5 minutes". "Running scheduled Poll..." saiu: mentiria num disparo pulado, e o fim do Poll já vai ao log.

**Migrations novas:** nenhuma. Esquema intacto.

**Down falso (`ISSUES_ANNOTATION.md` 2.3).** Não implementado, é decisão do usuário. A ordem nova ajuda só um pouco: um disparo durante o Poll da inicialização não vira mais um segundo Poll, mas um Poll da inicialização que termina segundos antes do disparo seguinte ainda deixa os dois próximos. Se a opção for tempo mínimo entre Polls, a política é o lugar fácil, porque já vê todo disparo, tem o relógio e sabe quando o Poll começou: bastam uma hora do último Poll em memória e uma comparação em `runExclusive`. Isso pularia um Poll inteiro; exigir o tempo mínimo só para declarar Down ficaria em Provider Status, com `checked_at`, e não na política.
