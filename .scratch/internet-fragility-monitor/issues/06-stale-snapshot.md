# 06: Stale Snapshot

**Spec:** `spec-provider-status.md` · **Trilha:** T2 – Visão geral

**What to build:** Quando o último Poll tem mais de 15 minutos (três ciclos), o hero mostra o estado neutro "Sem leitura recente" com a hora do último Poll, no lugar de qualquer Internet Health, inclusive Critical, e a página mostra um aviso de que os cards podem estar desatualizados.

**Blocked by:** 05.

**Status:** done

- [x] O módulo de Internet Health devolve o estado neutro de Stale Snapshot a partir da hora do último Poll e do relógio
- [x] O hero e o aviso da página exibem o estado neutro e a hora do último Poll
- [x] Testes do módulo: Snapshot de 14 minutos mantém o Internet Health; de 16 minutos vira neutro, inclusive sobre Critical

## Comments

**Resumo (28/10/2026).**

- `lib/internet-health.ts`: `decideInternetHealth` recebe `lastPollAt` (hora do último Poll, `null` quando nenhum Poll foi registrado) além do relógio. Com o último Poll há mais de 15 minutos (`STALE_SNAPSHOT_AFTER_MS`, três ciclos de 5 minutos; exatamente 15 minutos ainda não é Stale), devolve o estado neutro `{ status: "Stale", lastPollAt }`, sem descrição nem destaque, no lugar de qualquer faixa, inclusive Critical. `InternetHealth` virou união: `DecidedInternetHealth` (Healthy, Unstable, Critical) ou `StaleInternetHealth`. `STALE_TEXT = "Sem leitura recente"`, em português como a árvore cita (mesmo critério do texto de Down no Ticket 05).
- Sem nenhum Poll registrado (banco recém-criado), o Snapshot também é tratado como Stale Snapshot, sem hora: não há leitura recente a apresentar.
- Hero: no Stale Snapshot, "Global Status: Sem leitura recente" em cinza neutro e, abaixo, "Last Poll: Oct 26, 14:44 UTC" (ou "No Poll recorded yet."). A ilustração aceita o estado neutro: pacotes em cinza, velocidade base.
- Página: novo `components/stale-snapshot-notice.tsx`, aviso (`role="status"`) acima dos cards: "Sem leitura recente. The provider cards may be out of date. Last Poll: ... UTC". A hora é formatada em UTC (`formatLastPoll`), como a linha de Upcoming Maintenance do card, para não depender do fuso do servidor. A página calcula a hora do último Poll como a leitura mais recente do Snapshot (`lastUpdated` de cada Provider), sem mudar `lib/db-service.ts` nem o esquema.
- Testes: `__tests__/lib/internet-health.test.ts` (14 minutos mantém Critical, 15 minutos ainda não é Stale, 16 minutos vira neutro sobre Critical, sem Poll vira neutro sem hora); `__tests__/components/hero-section.test.tsx` (estado neutro com hora e sem Poll); `__tests__/components/stale-snapshot-notice.test.tsx` (aviso com e sem hora).

**Migrations novas:** nenhuma.

**Fica para depois:** a hora do último Poll vinda da leitura do Snapshot (Ticket 13); o limite de 15 minutos derivado da cadência central (Ticket 17); a página continua dependendo da atualização automática atual para sair do estado neutro depois de um Poll novo (Ticket 17).

**Correção pós-review (28/10/2026).** Formatação UTC única em `lib/format-utc.ts` (`formatUtc` e `formatLastPoll`, com `hourCycle: "h23"`, porque `hour12: false` podia mostrar "24:xx" à meia-noite), usada pela linha de Upcoming Maintenance do card, pelo aviso e pelo hero, que deixou de importar o formatador de um componente irmão. `InternetHealth` voltou a ser só Healthy, Unstable ou Critical; a união com o estado neutro chama-se `HeroState` (`InternetHealth | StaleSnapshotState`), sem `highlight?: undefined`, e o hero estreita por `status`. Defeito contra o glossário corrigido: a hora do último Poll (`lastAnsweredPollAt` em `lib/internet-health.ts`) considera só leituras que não são `unreachable`, então um Poll em que nenhum Provider responde não renova o Snapshot. Interino: o Ticket 13 substitui pela hora real do Poll. Como a leitura do Snapshot só traz a leitura mais recente de cada Provider, com todos os Providers Unreachable agora a hora fica desconhecida e o hero mostra "No Poll recorded yet." até o Ticket 13.
