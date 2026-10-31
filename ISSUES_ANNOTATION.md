# ISSUES_ANNOTATION — pendências (criado em 28/10/2026)

Itens abertos do ciclo de revisão de arquitetura (tickets 02–17), conferidos contra o `ROADMAP_STATUS.md`, os Comments dos tickets 02–07 e os code reviews das ondas 1 a 4. Três seções, como no InventPilot:

- **MINOR ISSUES**: escolhas de detalhe que os agentes fizeram e ninguém confirmou, e textos da tela que esperam decisão. Nada aqui trava o uso.
- **IMPORTANTE ISSUES**: o que depende de uma ação do usuário fora do código ou muda o que a página mostra de forma visível.
- **DEVELOPER DEMANDS**: pedidos do usuário para a próxima rodada, ainda sem spec.

Cada item traz, no fim, entre parênteses, o ticket de origem, só para rastrear.

---

# 1 - MINOR ISSUES

## 1.1 Decisões de produto pendentes (card e hero)

- **Card Unreachable com Incidents antigos:** quando a status page não pode ser lida, o card esconde o último status, mas continua listando os Incidents gravados com a última fase lida (ex.: "investigating", "in progress"), como se fossem atuais. A história 7 pede os Recent Incidents "com suas datas"; a história 6 pede para não tomar dado velho por atual. Decidir se o card avisa que esses Incidents podem estar desatualizados (03).
- **Card Unreachable sem Upcoming Maintenance:** o card Unreachable não mostra a linha de manutenções agendadas. Escolha do agente, apoiada na história 6; a spec não cobre (03).
- **Textos do hero fora do glossário:** o destaque usa "reporting a major outage", "Major outage reported.", "Major outages detected" (o glossário evita "major" para Outage) e "Service Down", "Service Outage", "Service Degraded" (o glossário evita "service" para Provider). Decidir se troca os textos (05).
- **Banco sem nenhum Poll:** o hero entra no estado neutro de Stale Snapshot e mostra "No Poll recorded yet." no lugar da hora do último Poll. A spec não cobre o caso (06).
- **Todos os Providers Unreachable:** até o Ticket 13 trazer a hora real do Poll, a hora do último Poll considera só leituras respondidas; com todos Unreachable desde sempre, o hero e o aviso mostram "No Poll recorded yet." em vez de uma hora (06, correção pós-review `e71d499`).
- **Português e inglês misturados na tela:** a página é em inglês, mas alguns textos ficaram em português porque a spec e a árvore os citam assim: "Não foi possível ler a status page" (card Unreachable), "Status page e serviço sem resposta" (destaque de Down), "Sem leitura recente" (hero e aviso), "verificação de acesso, sem feed de status" (marca de "só acesso" no card). O aviso de Stale ficou "Sem leitura recente. The provider cards may be out of date." Decidir o idioma da página (03, 05, 06, 08).

- **Site do GitHub no catálogo:** o link do site do GitHub é `https://githubstatus.com`, a status page, e não `https://github.com`. A carga do catálogo copiou o valor que já existia, como a spec mandava. Trocar exige uma migration de dados (07, code review).

## 1.2 Escolhas dos agentes ainda não confirmadas

- **Upcoming Maintenance sem data:** manutenção `scheduled` sem data marcada continua contando na linha de Upcoming Maintenance, mas não define a "próxima" data. Manutenção marcada exatamente para agora já conta como começada (02, correção pós-review `7edcfaa`).
- **Linha de Upcoming Maintenance:** em inglês, como o resto do card, com a data em UTC ("25 upcoming maintenances · next Oct 27, 01:00 UTC") (02).
- **Janela de 48 h dos resolvidos:** conta a partir da resolução (`resolvedAt`). Quando a hora da resolução não foi registrada (linhas antigas e RSS da AWS e da Azure, que não publicam essa hora), conta a partir da criação, e a janela nunca fica mais longa do que era antes. Quando um Incident é encerrado pelo Poll, a hora gravada é a do Poll, não a publicada pelo Feed (04).
- **Título da lista no card:** passou de "Recent Activity (48h)" para "Recent Incidents", o termo do glossário (04).
- **Provider só com Probes sem Recent Incidents:** sem Feed, ninguém declara nem encerra Incidents, então o card não lista Incidents desses Providers. Hoje Oracle, Salesforce e IBM não têm Incidents gravados (08).

## 1.3 Faxina técnica

- **Testes e lint pegam os worktrees:** `vitest run` e `eslint .` na checkout principal também varrem `.claude/worktrees/`, e os testes em andamento de um agente aparecem como falhas na `main`. Hoje o orquestrador roda com `--exclude ".claude/**"` e `--ignore-pattern ".claude/**"`. Proposta: acrescentar a exclusão em `vitest.config.mts` e `eslint.config.mjs` (orquestração, 28/10/2026).
- **Testes com banco mockado:** os testes de `dao` e `db-service` dos tickets 02–04 mockam o banco, em vez de usar o SQLite em memória com as migrations reais (decisão Q33). O helper `__tests__/helpers/migrated-db.ts` já existe (Ticket 07); a troca é do Ticket 13 (02, 04).

---

# 2 - IMPORTANTE ISSUES

## 2.1 Ação do usuário antes do próximo deploy

- **`build:prod` mudou:** agora roda só `npm run db:migrate && next build` (antes rodava `drizzle-kit up` e `generate` no servidor). Antes do deploy, conferir que a tabela `__drizzle_migrations` de produção tem só as migrations `0000` a `0002` deste repositório; o migrator aplica as que têm data posterior à última registrada (07).
- **Providers fora do catálogo na produção:** a `0003` cria `active` com padrão ativo e `display_order` com padrão 0. Se a tabela `providers` de produção tiver alguma linha além dos 13 do catálogo, ela fica ativa, sem Feed, e aparece no topo da página. Antes do deploy, conferir que `providers` tem só os 13 ids (code review do 07).
- **Migrations novas para a produção:** `0001_incident_kind_and_scheduled_for` e `0002_maintenance_incidents_to_kind` (02), `0003_provider_catalog` e `0004_provider_catalog_load` (07). A `0004` atualiza os Providers existentes sem trocar os ids; Incidents e leituras continuam ligados. A partir dela, toda mudança no catálogo, inclusive trocar um logo, é uma migration de dados nova (07).
- **Manutenções logo após o deploy:** a `0002` marca como `completed` as manutenções antigas. Até o primeiro Poll depois do deploy, a linha de Upcoming Maintenance não aparece; o Poll devolve a fase e a data às que continuam no Feed (02).

## 2.2 O que a página mostra de errado até um ticket posterior

- **Card da AWS com lista longa:** sem o corte de 24 horas, cada atualização do RSS da AWS vira um Incident ativo (em 28/10/2026, 38 itens de 2 eventos do Oriente Médio, abertos desde 01/03/2026). A AWS aparece Degraded, o que o próprio RSS confirma, mas com dezenas de itens. **Decidido pelo usuário em 28/10/2026:** agrupar as atualizações por evento (parte do `guid` antes do `_`), ativo até a AWS marcar como resolvido. Entra no Ticket 10 (registrado nos Comments dele) (04).
- **Incidents da AWS reabertos pelo título:** a gravação casa Incidents pelo título, e as atualizações da AWS repetem poucos títulos; um Incident encerrado pode voltar a abrir quando outra atualização com o mesmo título aparece. A identidade pela fonte é do Ticket 14; o agrupamento por evento do Ticket 10 reduz o efeito (04).
- **Um Poll lido pelo catálogo novo:** a leitura gravada não registra se veio de Feed ou de Probes; a página decide pelo catálogo atual. Logo depois de uma migration que ative ou desative um Feed, e até o Poll seguinte, a última leitura é interpretada pelo tipo novo (ex.: um "operational" dos Probes da Salesforce lido como Feed). Janela de um Poll; a leitura do Snapshot é refeita no Ticket 13 (08, code review).
- **Manutenções da Cloudflare com o mesmo título:** pela identidade por título, 25 manutenções agendadas aparecem como 22. Ticket 14 (02).

---

# 3 - DEVELOPER DEMANDS

Nenhum pedido aberto.
