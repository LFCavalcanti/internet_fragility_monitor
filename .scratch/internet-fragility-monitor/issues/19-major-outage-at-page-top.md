# 19: Major Outage no topo da página

**Spec:** `spec-major-outage.md` · **Trilha:** T7 – Topo da página

**What to build:** O topo da página passa a distinguir um problema de um Provider de um problema que atinge a internet. Major Outage é um Major Provider em Outage ou Down, ou três ou mais Providers quaisquer em Outage ou Down, e é exatamente o que define Critical. Dois Providers comuns em Outage deixam a página Unstable. O destaque e os textos seguem a tabela de situações da spec, e todo o texto do topo fica em inglês, inclusive o aviso de Stale Snapshot.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Critical vale para um Major Provider em Outage ou Down, ou para três ou mais Providers em Outage ou Down; dois Providers comuns são Unstable
- [ ] Cada linha da tabela de situações da spec aparece com o estado, o texto e o destaque previstos
- [ ] "Multiple Outages" para dois Providers comuns, "Major Outage" para um Major Provider sozinho e "Widespread Outage" para vários Providers em Major Outage
- [ ] "Provider Down", "Provider Outage" e "Provider Degraded" no lugar de "Service ..."; "Widespread Instability" fica
- [ ] A palavra "major" nunca aparece para um Provider comum sozinho
- [ ] "No recent reading", "Status page and service not responding" e o aviso de Stale em inglês, sem português no topo nem no aviso
- [ ] Stale Snapshot continua vencendo qualquer faixa, inclusive Critical
- [ ] Um Major Provider em Degraded continua Unstable
- [ ] Testes do módulo de Internet Health, do topo da página e do aviso de Stale atualizados
