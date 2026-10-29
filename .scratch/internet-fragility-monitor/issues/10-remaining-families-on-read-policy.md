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
