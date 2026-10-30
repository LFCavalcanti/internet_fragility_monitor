# 10: Demais famílias na política única

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Os leitores de RSS da AWS, RSS da Azure, Google Cloud e Heroku passam a usar a política de leitura única, com validação do conteúdo e o id publicado por cada Feed (`guid` nos RSS, `id` no Google Cloud e na Heroku). Os tipos `any` restantes dos leitores somem.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] Os quatro leitores usam a política e não repetem busca, medição nem tratamento de erro
- [ ] Cada leitor valida o conteúdo com Zod e emite Incidents com fonte e id
- [ ] Os erros de lint no-explicit-any dos leitores chegam a zero
- [ ] Uma fixture real por família; formato do id de Heroku e Azure confirmado nas fixtures
- [ ] Testes de leitura de cada família pela interface do módulo de Status Feed

## Comments

- **28/10/2026, decisão do usuário (orquestrador):** o RSS da AWS publica cada *atualização* como um item; o `guid` tem o formato `https://status.aws.amazon.com/#<evento>_<timestamp da atualização>` (ex.: `multipleservices-me-central-1_1789468030`). Em 28/10/2026 os 38 itens do RSS eram 2 eventos (me-central-1 e me-south-1, abertos desde 01/03/2026, última atualização 15/09/2026), nenhum marcado como resolvido. Regra decidida: o leitor da AWS **agrupa as atualizações pelo evento** (parte do `guid` antes do último `_`), que vira o id do Incident, com a data da última atualização; o evento fica ativo até a AWS marcá-lo como resolvido (nada de encerrar por silêncio). O `guid` inteiro não serve de id, porque muda a cada atualização. Conferir se o RSS da Azure tem o mesmo padrão antes de escolher o id dela. Também desta onda: os leitores devem usar `isClosed` de `lib/incident-status.ts` em vez de `status !== 'resolved'` (achado do review do Ticket 04).
- **29/10/2026, code review do Ticket 07:** o 07 deixou RSS da AWS e RSS da Azure como famílias separadas porque os leitores eram distintos, sem conferir o payload real, como pede a spec do catálogo ("conferida com payload real"). Com as fixtures reais deste ticket, confirmar se os formatos divergem; se não divergirem, unir as famílias exige migration de dados e fica como proposta para o usuário.
