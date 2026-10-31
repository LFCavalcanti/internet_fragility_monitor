# 19: Major Outage no topo da página

**Spec:** `spec-major-outage.md` · **Trilha:** T7 – Topo da página

**What to build:** O topo da página passa a distinguir um problema de um Provider de um problema que atinge a internet. Major Outage é um Major Provider em Outage ou Down, ou três ou mais Providers quaisquer em Outage ou Down, e é exatamente o que define Critical. Dois Providers comuns em Outage deixam a página Unstable. O destaque e os textos seguem a tabela de situações da spec, e todo o texto do topo fica em inglês, inclusive o aviso de Stale Snapshot.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Critical vale para um Major Provider em Outage ou Down, ou para três ou mais Providers em Outage ou Down; dois Providers comuns são Unstable
- [x] Cada linha da tabela de situações da spec aparece com o estado, o texto e o destaque previstos
- [x] "Multiple Outages" para dois Providers comuns, "Major Outage" para um Major Provider sozinho e "Widespread Outage" para vários Providers em Major Outage
- [x] "Provider Down", "Provider Outage" e "Provider Degraded" no lugar de "Service ..."; "Widespread Instability" fica
- [x] A palavra "major" nunca aparece para um Provider comum sozinho
- [x] "No recent reading", "Status page and service not responding" e o aviso de Stale em inglês, sem português no topo nem no aviso
- [x] Stale Snapshot continua vencendo qualquer faixa, inclusive Critical
- [x] Um Major Provider em Degraded continua Unstable
- [x] Testes do módulo de Internet Health, do topo da página e do aviso de Stale atualizados

## Comments

**Resumo (31/10/2026).**

- `lib/internet-health.ts`: `isMajorOutage` é a única conta de Critical (limiar de dois para três). Textos e destaques seguem a tabela de situações. `STALE_TEXT` e `DOWN_TEXT` em inglês.
- `components/hero-section.tsx`: o texto do Internet Health agora aparece sempre, com o destaque abaixo dele. Antes o destaque tomava o lugar do texto, e "Major outage at AWS..." nunca chegaria à tela, contra o item "cada linha da tabela aparece com o estado, o texto e o destaque" e contra a nota da spec "cita a quantidade, e o destaque traz os nomes".
- `components/hero-section.tsx`: "Global Status:" virou "Internet Health:". O glossário lista "global status" em _Avoid_, e a story 12 pede os termos do glossário.
- O aviso de Stale muda só pela constante `STALE_TEXT`.
- Testes: `__tests__/lib/internet-health.test.ts`, `__tests__/components/hero-section.test.tsx`, `__tests__/components/stale-snapshot-notice.test.tsx`.

**Escolhas registradas.**

- Major Provider em Outage sem Incident ativo: a tabela só prevê o título do Incident. Usei o mesmo "Outage reported." do Provider comum, sem texto novo.
- Um título de Incident é copiado do Provider e pode conter "major" por conta própria: o monitor não reescreve títulos, então a regra de "major" vale para os textos do monitor.

**Migrations novas:** nenhuma.

**Fica para depois:** os textos do card (stories 13 e 14 e as linhas de tradução do card) são do Ticket 20.
