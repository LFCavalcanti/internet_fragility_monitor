# 04: Recent Incidents com uma regra só

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores

**What to build:** Um Incident ativo aparece sempre no card, de qualquer idade, e um resolvido aparece por 48 horas. Os cortes de 24 horas nos leitores, de 5 na leitura do Snapshot e de 3 no card deixam de esconder Incidents ativos: os ativos vêm primeiro e os resolvidos completam a lista até 3 itens. O card deixa de chamar o relógio durante a renderização; a página passa a hora do servidor ao módulo.

**Blocked by:** 02 e 03 (03 por recurso: mesmos leitores, card e módulo).

**Status:** done

- [x] Os leitores do Google Cloud, da AWS e da Azure não cortam mais Incidents em 24 horas
- [x] A leitura do Snapshot traz os Incidents ativos, os resolvidos dentro de 48 horas e as manutenções agendadas, sem corte por quantidade
- [x] O módulo decide os Recent Incidents e a ordem; o card só exibe
- [x] O erro de lint react-hooks/purity do card some
- [x] Testes do módulo: Incident ativo do Google Cloud com mais de 24 horas aparece; resolvido com 47 horas aparece e com 49 horas não; um sexto Incident ativo não é cortado
- [x] Os testes de 48 horas e de limite de 3 do card passam para o módulo

## Comments

**Resumo (28/10/2026).**

- Módulo (`lib/provider-status.ts`): decide os Recent Incidents e a ordem. Ativo = problema aberto ou manutenção em andamento, de qualquer idade, sempre exibido. Resolvido = problema encerrado há menos de 48 horas. Ordem: ativos primeiro (do mais novo para o mais antigo, por criação), e os resolvidos (do mais recente para o mais antigo, por resolução) completam a lista até 3 itens. Nenhum ativo é cortado. Manutenção agendada (vai para a Upcoming Maintenance) e manutenção completed (suposição da spec) não entram. `isRecentlyResolved(incident, now)` é exportada e usada também pela leitura do Snapshot, para a regra existir uma vez.
- **Escolha registrada: a janela de 48 horas conta da resolução (`resolvedAt`), não da criação.** O glossário diz "resolvido há menos de 48 horas", e o achado de review mostrou que contar da criação some com Incidents longos (e, na Statuspage, `created_at` de manutenção é a data do anúncio). Quando a resolução não está registrada (linhas antigas gravadas já resolvidas, e RSS da AWS e da Azure, que não publicam a hora), conta da criação: nunca estica a janela além do que existia antes. Manutenção em andamento anunciada há dias aparece sempre, e o card mostra Maintenance (teste no módulo).
- `IncidentData` ganhou `resolvedAt?` (opcional). O leitor do Google Cloud preenche com `end`; a gravação de um Incident novo já encerrado guarda essa hora em `incidents.resolved_at` (coluna já existente); `updateIncidentStatus`/`closeIncident` já gravavam a hora do encerramento. A leitura do Snapshot devolve `resolvedAt`.
- Leitores da AWS, da Azure e do Google Cloud não cortam mais em 24 horas; o estado declarado por eles passa a considerar todos os Incidents não resolvidos do Feed.
- Leitura do Snapshot (`getLatestStatus(now)`): sem corte de 5. Traz todos os Incidents abertos (problemas, manutenções agendadas e em andamento) e os problemas resolvidos dentro da janela; manutenção completed nunca. Recebe o mesmo relógio que a página passa aos módulos.
- Card: só exibe `decision.incidents`, sem filtro nem limite; não chama o relógio na renderização. Recebe `now` da página e mostra as idades com `formatDistance(data, now)` em vez de `formatDistanceToNow` (que também lê o relógio). O título da lista mudou de "Recent Activity (48h)" para "Recent Incidents", porque um ativo pode ter qualquer idade. O erro `react-hooks/purity` sumiu.
- Testes: casos de 48 h e de limite de 3 saíram do card para o módulo (Google Cloud ativo com mais de 24 h, resolvido com 47 h e 49 h, janela pela resolução, sexto ativo não cortado, ordem, manutenção em andamento anunciada há 6 dias). O teste antigo "up to 5 incidents" da leitura virou o teste da regra nova. Teste novo `__tests__/lib/fetchers/no-24h-cut.test.ts`. O teste do Feed não lido passou a esperar a ordem nova (ativos antes do resolvido, história 11).
- Sem migration e sem mudança de esquema.

**Efeito visível a observar:** em 28/10/2026 o RSS da AWS trazia 37 itens, nenhum marcado "resolved", alguns de março de 2026 (disrupção das regiões do Oriente Médio). Sem o corte de 24 horas eles passam a ser Incidents ativos: a AWS aparece Degraded com esses Incidents na lista. É a regra decidida (ativo de qualquer idade aparece); a identidade por `guid` e a leitura do RSS são dos Tickets 10 e 14.

Correções pós-review (29/10/2026): `isRecentlyResolved` e a janela de 48 horas saíram de `lib/provider-status.ts` para `lib/incident-status.ts`, junto da regra de Incident encerrado; `closedAt` virou `closedAtMs` (devolve milissegundos, usado no corte da janela e na ordenação); helper `hoursBefore(now, h)` em `__tests__/helpers/time.ts` no lugar dos `hoursAgo` repetidos; `__tests__/lib/fetchers/no-24h-cut.test.ts` virou `readers-deliver-every-incident.test.ts`, com relógio fixo (`vi.useFakeTimers`/`setSystemTime`). Sem mudança de comportamento.
