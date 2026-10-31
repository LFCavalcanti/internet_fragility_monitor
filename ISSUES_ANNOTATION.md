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
- **Português e inglês misturados na tela:** a página é em inglês, mas alguns textos ficaram em português porque a spec e a árvore os citam assim: "Não foi possível ler a status page" (card Unreachable), "Status page e serviço sem resposta" (destaque de Down), "Sem leitura recente" (hero e aviso), "verificação de acesso, sem feed de status" (marca de "só acesso" no card). O aviso de Stale ficou "Sem leitura recente. The provider cards may be out of date." Decidir o idioma da página (03, 05, 06, 08).

- **Data do Incident da AWS no card:** a decisão de 28/10/2026 fala em Incident "com a data da última atualização", mas o card mostra a data de início: o evento do Oriente Médio aparece como 01/03/2026, não 15/09/2026. O leitor traz as duas datas; a gravação guarda só a de início. Decidir qual data o card mostra (10, code review).
- **Heroku vermelha só em Tools:** o estado da Heroku passou a ser o pior entre Apps, Data e Tools. Um vermelho só em Tools (painel e CLI, com os apps no ar) mostra a Heroku como Outage, e isso conta para o hero, embora sozinha ela não o deixe Critical, por não ser Major Provider. O glossário ampara Degraded para "parte dos serviços", mas não diz se Outage vale para uma parte secundária. Decidir se Tools sozinho chega a Outage (10, code review).
- **Outage da Salesforce por uma instância:** um impacto `major` aberto vira Outage, mesmo em uma só instância entre centenas: é o que a Salesforce declara (a própria API marca essa instância `MAJOR_INCIDENT_CORE`). O campo `isCore` não serve de filtro, porque veio falso nos 21 incidentes da coleta, inclusive nos três `major`. O glossário pede "parte relevante dos serviços"; se uma instância não basta, a regra muda para olhar quantas instâncias (11).
- **Site do GitHub no catálogo:** o link do site do GitHub é `https://githubstatus.com`, a status page, e não `https://github.com`. A carga do catálogo copiou o valor que já existia, como a spec mandava. Trocar exige uma migration de dados (07, code review).
- **Recorrência na AWS e na Azure apaga a anterior:** o id da AWS é serviço e região, e o da Azure é o título em forma de endereço. Um problema que volta no mesmo serviço e região reaproveita a linha do anterior, que some do registro, embora a história 7 peça manter os Incidents como registro do que aconteceu. A data e a descrição passam a ser as da nova ocorrência, então o card fica certo; só o histórico perde a anterior. Decidir se cada ocorrência vira uma linha própria, o que pediria um id que inclua a ocorrência (14, code review).
- **Azure edita o título:** como o id da Azure sai do título (`active-storage-latency-...`), se a Azure editar o título o id provavelmente muda: o Incident antigo aparece resolvido e um novo aparece ao lado por 48 h. Acontece uma vez por edição, e nunca vimos um item real editado. Nada a fazer enquanto não aparecer um caso real (14, code review).

## 1.2 Escolhas dos agentes ainda não confirmadas

- **Upcoming Maintenance sem data:** manutenção `scheduled` sem data marcada continua contando na linha de Upcoming Maintenance, mas não define a "próxima" data. Manutenção marcada exatamente para agora já conta como começada (02, correção pós-review `7edcfaa`).
- **Linha de Upcoming Maintenance:** em inglês, como o resto do card, com a data em UTC ("25 upcoming maintenances · next Oct 27, 01:00 UTC") (02).
- **Janela de 48 h dos resolvidos:** conta a partir da resolução (`resolvedAt`). Quando a hora da resolução não foi registrada (linhas antigas e RSS da Azure, que não publica essa hora), conta a partir da criação, e a janela nunca fica mais longa do que era antes. No RSS da AWS, a hora é a da atualização que marcou o evento como resolvido. Quando o Feed publica a hora de resolução, ela vale; sem hora publicada, um Incident encerrado agora fica com a hora do Poll (04, 10, 14).
- **Heroku Degraded por Data ou Tools:** o estado declarado passou a ser o pior entre os sistemas do Feed. Antes só Apps contava, e um problema declarado em Data ou Tools aparecia Operational com o Incident na lista. Escolha apoiada no glossário (Degraded: parte dos serviços) (10).
- **Fim de evento no RSS da AWS e da Azure:** esses RSS não têm campo de fase. Na AWS, o evento fecha quando a última atualização traz "resolved" no título ou quando a última frase da descrição diz que o problema foi resolvido ou que o serviço opera normalmente ("All other services are operating normally" não conta). A regra vem de uma única amostra real (`apigateway-us-west-2`, 30/10/2026): uma redação nova da AWS pode deixar o evento ativo até sair do RSS (10, code review). Na Azure ficou a regra anterior, a palavra "resolved" no título ou na descrição; os itens reais de 2024 consultados não têm exemplo de resolvido (10).
- **Fim de evento e fases no RSS da IBM:** o RSS não tem campo de fase. Um incidente fecha pela marca no começo do título ("RESOLVED:") ou pelo rodapé fixo `Outage End`, que também dá a hora de resolução; sem nenhuma das duas, fica ativo. Na manutenção, "PLANNED:" é agendada, "MAINTENANCE:" (só em maiúsculas) é em andamento, "COMPLETED:" é encerrada e "CANCELLED:" não é lida. A palavra no meio do título ou no texto não conta. Amostra: Feed de 31/10/2026 (1 incidente) e captura do Wayback Machine de 26/09/2020 (73 incidentes, 184 manutenções). Nenhum item real tem as marcas IDENTIFIED, MITIGATING ou MONITORING no título, que vieram das linhas de STATUS do texto; a captura de 10/10/2026 e o Feed de 31/10/2026 não têm manutenção, então o formato de manutenção só foi visto em 2020. Uma redação nova deixa o incidente ativo até sair do Feed ou a manutenção como agendada (11).
- **Manutenções da Salesforce pela metade em fim de semana de release:** a API entrega no máximo 1000 manutenções por pedido, e há cerca de 18 mil. O leitor pede as 1000 a partir de três dias atrás, em ordem de data. Em fins de semana de release (5.300 itens em 10/10/2026) o limite acaba antes de hoje, e as manutenções em andamento e as agendadas podem ficar de fora até o volume passar: o card mostra menos manutenções, nunca um problema falso. Fora disso, a linha de Upcoming Maintenance conta no máximo cerca de 900, uma por instância, porque a Salesforce publica uma por instância. Manutenção em andamento que começou há mais de três dias também fica de fora (5 de 18.031 duram mais de 72 h) (11).
- **Título da lista no card:** passou de "Recent Activity (48h)" para "Recent Incidents", o termo do glossário (04).
- **Provider só com Probes sem Recent Incidents:** sem Feed, ninguém declara nem encerra Incidents, então o card não lista Incidents desses Providers. Hoje a Oracle não tem Incidents gravados (08).

## 1.3 Faxina técnica

- **Histórico inteiro lido a cada Poll:** a reconciliação lê todos os Incidents do Provider, porque um id encerrado pode reabrir, e Incidents nunca são apagados. A Salesforce publica cerca de mil manutenções por Poll, e cada manutenção nova vira uma linha que fica para sempre, então essa leitura só cresce. Sem efeito hoje; se pesar, a leitura pode se limitar às linhas abertas e aos ids publicados naquele Poll (14, code review).
- **Testes e lint pegam os worktrees:** `vitest run` e `eslint .` na checkout principal também varrem `.claude/worktrees/`, e os testes em andamento de um agente aparecem como falhas na `main`. Hoje o orquestrador roda com `--exclude ".claude/**"` e `--ignore-pattern ".claude/**"`. Proposta: acrescentar a exclusão em `vitest.config.mts` e `eslint.config.mjs` (orquestração, 28/10/2026).

---

# 2 - IMPORTANTE ISSUES

## 2.1 Ação do usuário antes do próximo deploy

- **`build:prod` mudou:** agora roda só `npm run db:migrate && next build` (antes rodava `drizzle-kit up` e `generate` no servidor). Antes do deploy, conferir que a tabela `__drizzle_migrations` de produção tem só as migrations `0000` a `0002` deste repositório; o migrator aplica as que têm data posterior à última registrada (07).
- **Providers fora do catálogo na produção:** a `0003` cria `active` com padrão ativo e `display_order` com padrão 0. Se a tabela `providers` de produção tiver alguma linha além dos 13 do catálogo, ela fica ativa, sem Feed, e aparece no topo da página. Antes do deploy, conferir que `providers` tem só os 13 ids (code review do 07).
- **Migrations novas para a produção:** `0001_incident_kind_and_scheduled_for` e `0002_maintenance_incidents_to_kind` (02), `0003_provider_catalog` e `0004_provider_catalog_load` (07), `0005_activate_salesforce_ibm_feeds` (11), `0006_incident_identity` (14), `0007_provider_reading` (15). A `0005` ativa os Feeds de Salesforce e IBM. A `0006` só acrescenta colunas e um índice; as linhas existentes ficam sem fonte e sem id até o primeiro Poll. A `0007` só acrescenta duas colunas e um índice em `status_checks`; as linhas existentes nunca contam para Down, então o primeiro Poll sem resposta depois do deploy é Unreachable e só o segundo é Down. A `0004` atualiza os Providers existentes sem trocar os ids; Incidents e leituras continuam ligados. A partir dela, toda mudança no catálogo, inclusive trocar um logo, é uma migration de dados nova (07).
- **Manutenções logo após o deploy:** a `0002` marca como `completed` as manutenções antigas. Até o primeiro Poll depois do deploy, a linha de Upcoming Maintenance não aparece; o primeiro Poll grava como linhas novas as que continuam no Feed, com a fase e a data, porque só uma linha antiga aberta é assumida; as `completed` ficam como histórico (02, 14).
- **Primeiro Poll depois da `0006`:** as linhas antigas abertas ganham fonte e id, e as que nenhum Incident assumir são resolvidas de uma vez, com a hora do Poll, e entram nos Recent Incidents por 48 horas. Um problema já resolvido nas últimas 48 horas que o Feed ainda publique (AWS, Google Cloud) aparece duas vezes no card durante o resto dessas 48 horas: a linha antiga, encerrada, e a nova, com id. Some sozinho (14).

## 2.2 O que a página mostra de errado até um ticket posterior

Nenhum item aberto.

---

# 3 - DEVELOPER DEMANDS

Nenhum pedido aberto.
