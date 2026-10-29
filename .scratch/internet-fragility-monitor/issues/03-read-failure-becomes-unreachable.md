# 03: Falha de leitura vira Unreachable

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores

**What to build:** Quando a status page de um Provider não pode ser lida, o Provider aparece Unreachable, num card cinza e neutro com "Não foi possível ler a status page", e não mais em Outage. O card não mostra o último status conhecido, mas continua mostrando os Recent Incidents já gravados, com suas datas.

**Blocked by:** 02.

**Status:** done

- [x] Nenhum leitor converte erro de leitura em Outage; o resultado é Unreachable
- [x] O vocabulário de Provider Status aceita Unreachable de ponta a ponta: leitura, gravação, leitura do Snapshot e card
- [x] O card Unreachable é cinza, mostra o texto combinado, não mostra último status e mostra os Recent Incidents gravados
- [x] O ramo morto do card que exibia o tempo de resposta é removido
- [x] Teste do módulo e teste de renderização do card para Unreachable

## Comments

**Resumo (28/10/2026).**

- Leitores: AWS, Azure, Google Cloud, Heroku, a família Statuspage.io (Jira, DigitalOcean, Hostinger e as cópias de Cloudflare, GitHub e Vercel) e o Probe por ping devolvem `unreachable` quando a leitura falha (erro de rede ou HTTP de erro), nunca `outage`. Novo tipo `ReadingStatus` (`DeclaredState | 'unreachable'`) em `StatusResult.status`. Teste novo `__tests__/lib/fetchers/read-failure.test.ts` cobre todos os leitores.
- Gravação: `statusValueSchema` aceita `unreachable` e deixa de aceitar `unknown` (termo a evitar no glossário; nenhum leitor o gravava). Uma leitura `unreachable` grava só o status check: os Incidents gravados não são encerrados nem alterados, porque falha nossa não é evidência de que o Provider encerrou algo. Antes, a lista vazia da falha resolvia todos os Incidents abertos.
- Leitura do Snapshot: `getLatestStatus` traz `unreachable` como veio, com os Incidents gravados (sem mudança de código; teste novo).
- Módulo: `FeedReading` não lido pode trazer os Incidents já gravados do Feed. Eles entram nos Recent Incidents, mas não decidem o estado nem a Upcoming Maintenance (escolha coerente com a história 6, "não tomar dado velho por atual"; a história 7 só pede os Recent Incidents).
- Página: um resultado `unreachable` vai ao módulo como Feed não lido com os Incidents gravados. A regra do hero não mudou; Unreachable já não contava para o Internet Health.
- Card: Unreachable fica cinza e neutro (`grayscale`, fundo e borda `muted`, texto do estado em `muted-foreground`), com "Não foi possível ler a status page" sob o estado, sem último status conhecido e com os Recent Incidents gravados e suas datas. O ramo morto do tempo de resposta (`'unknown'` com `as any`) saiu. O texto fica em português, como pedido no ticket e na spec, embora o resto do card esteja em inglês.
- Sem migration: o status é texto no SQLite. Em `lib/schema.ts` só mudou o comentário da coluna `status_checks.status`.

**Fica para depois:** a janela de 48 horas, o limite de 3 e o erro de pureza do card (`Date.now()` na renderização) são do Ticket 04. Down (Poll anterior sem resposta) é do Ticket 15; até lá, todo Provider sem leitura aparece Unreachable. A marca de "só acesso" dos Providers só com Probe vem com os tickets de Probes; hoje um Probe que responde ainda vai ao módulo como Feed lido Operational.

