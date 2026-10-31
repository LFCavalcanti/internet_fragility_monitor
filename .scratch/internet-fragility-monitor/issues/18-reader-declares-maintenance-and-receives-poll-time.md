# 18: Leitor declara Maintenance e recebe a hora do Poll

**Spec:** `spec-declared-severity.md` · **Trilha:** T6 – Gravidade declarada

**What to build:** Preparação, sem mudança visível na página. O estado declarado por um Feed passa a incluir Maintenance, e a regra de manutenção em andamento sai da decisão de Provider Status e vai para a leitura. O leitor de cada família passa a receber a hora do Poll, que será usada pela regra de Dormant Incident. Uma manutenção em andamento continua dando Maintenance em todos os Providers, com a mesma precedência: nunca prevalece sobre Down, Outage ou Degraded.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] O estado declarado por um Feed inclui Maintenance, e todas as famílias o declaram quando há manutenção em andamento e nenhum problema
- [x] A decisão de Provider Status usa só os estados declarados, sem olhar os Incidents para achar manutenção
- [x] A gravação e a leitura do Snapshot aceitam o novo estado declarado, sem migration
- [x] Linhas gravadas antes da mudança não quebram a leitura e se corrigem no primeiro Poll
- [x] Todo leitor recebe a hora do Poll e nenhum lê o relógio por conta própria
- [x] Os testes de precedência de Provider Status continuam passando; os casos de Maintenance mudam para a leitura
- [x] Sem mudança no card, no topo da página nem nos testes de tela

## Comments

**O que mudou.** `DeclaredStatus` inclui `maintenance`. A regra de manutenção em andamento saiu de `decideStatus` e virou `withOngoingMaintenance`, em `lib/status-feed/readers/problem-state.ts`: Operational com manutenção em andamento é Maintenance, e qualquer outro estado fica como está. `declaredByOpenProblems` a aplica, o que cobre AWS, Azure, Google Cloud e IBM; Statuspage.io, Heroku e Salesforce a aplicam sobre o estado próprio. A decisão de Provider Status agora só compara os estados declarados.

**Por que a regra fica em cada leitor.** A política de leitura poderia aplicá-la a todos, mas o Ticket 25 precisa decidir quais manutenções contam (só de data centers não conta), e o Ticket 22 precisa tirar as Dormant. Cada leitor passa a lista que conta para a mesma função.

**Heroku.** O Feed nunca dá manutenção em andamento (só `scheduled` e `completed`), então a chamada existe pelo critério de todas as famílias e nenhum payload a exercita. O mesmo vale para AWS, Azure e Google Cloud, que só publicam problemas.

**Relógio.** `pollAt` é obrigatório em `readAllProviders` e `readFeed`, e chega a `addresses` e `read` de todo leitor. O `Date.now()` da Salesforce saiu: era o único leitor que lia o relógio. O parâmetro é obrigatório de propósito, para um chamador não voltar ao relógio sem perceber.

**A hora do Poll é uma só.** `runPoll` toma a hora no começo e a dá aos leitores e a `recordPoll`. Antes, a gravação usava a hora do fim do Poll, então `checked_at`, `updated_at` e `resolved_at` recuam a duração da leitura, de 10 segundos no máximo por fonte. Nem o limite de Stale Snapshot nem o Poll da inicialização notam isso na prática.

**Precedência em um lugar só.** `worstDeclared` (`lib/provider-status.ts`) substitui `DECLARED_WORST_FIRST` da gravação, que tinha ficado igual à precedência da decisão.

**Gravação.** `status` em `status_checks` é texto livre, e `feeds` guarda JSON: `maintenance` entra sem migration. O vocabulário do Zod em `assertRecordable` aceita o novo valor.

**Linhas antigas.** A linha gravada antes do deploy diz `operational`, e o Provider com manutenção em andamento aparece Operational até o primeiro Poll, no máximo um ciclo depois, como a spec prevê. Nada quebra na leitura. Há teste para a linha com `feeds` e para a linha sem `feeds`.

**Efeito colateral da regra nova.** Uma manutenção em andamento gravada que nenhum Feed lido declara não muda mais o estado. Fora as linhas antigas acima, isso só acontece com a manutenção de um Feed desativado: ela segue na lista do card, aberta, mas o Provider fica Operational. Antes ele ficava em Maintenance para sempre, porque um Feed fora do Poll nunca a encerra.

**Testes.** Os casos de Maintenance foram da decisão para os leitores (`statuspage`, `salesforce-ibm`), e a decisão ganhou o caso de que um Incident não muda o estado. A precedência continua testada, com os Feeds nas duas ordens. Nenhum teste de tela mudou.

**Migrations novas:** nenhuma. O esquema não mudou: em `lib/schema.ts` só o comentário da coluna `status`.

**Para depois.** Tickets 22, 24 e 25: `read` e `addresses` já recebem `pollAt`, e os leitores desses tickets podem ignorá-lo até precisar.
