# 05: Nova regra do Internet Health

**Spec:** `spec-provider-status.md` · **Trilha:** T2 – Visão geral

**What to build:** O hero passa a seguir a regra nova: Critical quando um Major Provider está em Outage ou Down, ou dois ou mais Providers quaisquer estão em Outage ou Down; Unstable em qualquer outro Degraded, Outage ou Down; Healthy no resto. Maintenance e Unreachable não contam. A Cloudflare vira Major Provider. A regra sai da página para um módulo de Internet Health, e o hero recebe o destaque pronto.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] O módulo de Internet Health existe, é puro e recebe o relógio, os resultados dos Providers e a lista de Major Providers
- [ ] Os quatro Major Providers ficam numa constante do módulo até o ticket 07
- [ ] A página não decide mais o Internet Health; passa ao hero o resultado do módulo
- [ ] O tipo duplicado do destaque do hero deixa de existir
- [ ] Down tem destaque próprio no hero ("status page e serviço sem resposta"), ainda sem dados que o produzam
- [ ] Testes do módulo cobrem as três faixas, Down de Major Provider, queda isolada de Provider pequeno (Unstable) e Maintenance e Unreachable fora da conta
