# ISSUES_ANNOTATION — pendências (criado em 28/10/2026)

Itens abertos depois da árvore `.scratch/internet-fragility-monitor/arvore-de-decisoes-2026-10-31-pendencias.md`. O que foi decidido está nela e nas specs de 31/10/2026 (`spec-declared-severity.md`, `spec-major-outage.md`, `spec-monitor-failure-discard.md` e `spec-post-cycle-cleanup.md`). Três seções, como no InventPilot:

- **MINOR ISSUES**: observações e faxina técnica que ficam para depois. Nada aqui trava o uso.
- **IMPORTANTE ISSUES**: o que depende de uma ação do usuário fora do código ou muda o que a página mostra de forma visível.
- **DEVELOPER DEMANDS**: pedidos do usuário para a próxima rodada, ainda sem spec.

Cada item traz, no fim, entre parênteses, o ticket de origem, só para rastrear.

---

# 1 - MINOR ISSUES

## 1.1 Observações

- **Azure edita o título:** como o id da Azure sai do título (`active-storage-latency-...`), se a Azure editar o título o id provavelmente muda: o Incident antigo aparece resolvido e um novo aparece ao lado por 48 h. Acontece uma vez por edição, e nunca vimos um item real editado. Nada a fazer enquanto não aparecer um caso real (14, code review).
- **Site do Provider não aparece na tela:** a `0009` corrigiu o site do GitHub no catálogo, mas nenhuma tela lê esse campo: o card só tem link para a status page. A correção fica guardada no banco, sem efeito visível, até alguma tela usar o site (21, code review).

## 1.2 Faxina técnica

- **Histórico inteiro lido a cada Poll:** a reconciliação lê todos os Incidents do Provider, porque um id encerrado pode reabrir, e Incidents nunca são apagados. A Salesforce publica cerca de mil manutenções por Poll, e cada manutenção nova vira uma linha que fica para sempre, então essa leitura só cresce. Sem efeito hoje; se pesar, a leitura pode se limitar às linhas abertas e aos ids publicados naquele Poll (14, code review).

---

# 2 - IMPORTANTE ISSUES

## 2.1 Ação do usuário antes do próximo deploy

- **`build:prod` mudou:** agora roda só `npm run db:migrate && next build` (antes rodava `drizzle-kit up` e `generate` no servidor). Antes do deploy, conferir que a tabela `__drizzle_migrations` de produção tem só as migrations `0000` a `0002` deste repositório; o migrator aplica as que têm data posterior à última registrada (07).
- **Providers fora do catálogo na produção:** a `0003` cria `active` com padrão ativo e `display_order` com padrão 0. Se a tabela `providers` de produção tiver alguma linha além dos 13 do catálogo, ela fica ativa, sem Feed, e aparece no topo da página. Antes do deploy, conferir que `providers` tem só os 13 ids (code review do 07).
- **Migrations novas para a produção:** `0001_incident_kind_and_scheduled_for` e `0002_maintenance_incidents_to_kind` (02), `0003_provider_catalog` e `0004_provider_catalog_load` (07), `0005_activate_salesforce_ibm_feeds` (11), `0006_incident_identity` (14), `0007_provider_reading` (15), `0008_remove_response_time_severity` (16), `0009_github_site_url` (21), `0010_cloudflare_feed_family` (25). A `0005` ativa os Feeds de Salesforce e IBM. A `0006` só acrescenta colunas e um índice; as linhas existentes ficam sem fonte e sem id até o primeiro Poll. A `0007` só acrescenta duas colunas e um índice em `status_checks`; as linhas existentes nunca contam para Down, então o primeiro Poll sem resposta depois do deploy é Unreachable e só o segundo é Down. A `0008` remove `response_time` e `severity` sem recriar as tabelas (3 s em 1,4 milhão de linhas). É a primeira que tira colunas: o processo antigo quebra assim que ela é aplicada, porque o Drizzle cita todas as colunas. Como `build:prod` migra antes do `next build`, parar o servidor antigo antes do build; senão a página e os Polls falham até o novo subir. Se o `next build` falhar depois da migration, o banco já está na `0008` e o código antigo não volta a funcionar: fazer cópia do banco antes do deploy para poder recuar. A `0010` troca a família do Feed da Cloudflare; o código antigo não a conhece, e o card fica Unreachable até o novo subir. A `0004` atualiza os Providers existentes sem trocar os ids; Incidents e leituras continuam ligados. A partir dela, toda mudança no catálogo, inclusive trocar um logo, é uma migration de dados nova (07).
- **Manutenções logo após o deploy:** a `0002` marca como `completed` as manutenções antigas. Até o primeiro Poll depois do deploy, a linha de Upcoming Maintenance não aparece; o primeiro Poll grava como linhas novas as que continuam no Feed, com a fase e a data, porque só uma linha antiga aberta é assumida; as `completed` ficam como histórico (02, 14).
- **Primeiro Poll depois do deploy apaga o histórico antigo:** as leituras com mais de 90 dias saem de uma vez, numa pausa única do processo: 8 s para 1 milhão de linhas, no teste com um ano de leituras. A página espera, sem erro, e os Polls seguintes levam dezenas de milissegundos. O arquivo do banco não encolhe, só para de crescer; para reduzi-lo, rodar `VACUUM` com o servidor parado (16).
- **Primeiro Poll depois da `0006`:** as linhas antigas abertas ganham fonte e id, e as que nenhum Incident assumir são resolvidas de uma vez, com a hora do Poll, e entram nos Recent Incidents por 48 horas. Um problema já resolvido nas últimas 48 horas que o Feed ainda publique (AWS, Google Cloud) aparece duas vezes no card durante o resto dessas 48 horas: a linha antiga, encerrada, e a nova, com id. Some sozinho (14).

## 2.2 O que a página mostra de errado até um ticket posterior

Nenhum item aberto.

## 2.3 Decisão de produto antes do próximo deploy

- **Aviso de última leitura no card Down:** o card Unreachable avisa "These Incidents come from the last reading and may be out of date.", mas o card Down, que lista os mesmos Incidents antigos, não avisa, porque a spec só pediu no Unreachable. Exemplo: a Vercel para de responder com um Incident aberto; no primeiro Poll o card mostra o aviso e, no segundo, vira Down e o aviso some, com a mesma lista. Decidir se o card Down também mostra o aviso (20, code review).
- **Destaque do topo pode citar outro Incident do Provider:** o topo cita o Incident aberto com a novidade mais recente, porque o monitor não grava qual Incident causou o estado. Exemplo: o CDN da Cloudflare cai, e o topo mostra "Major Outage: Cloudflare", com o título de um Incident menor sobre um data center em Dallas, atualizado depois. O card lista os dois, e só o título do topo engana. Decidir se fica assim, ou se o monitor passa a gravar qual Incident conta para o estado, o que mudaria a decisão da spec de não gravar a gravidade e precisaria de um ticket com migration (24 e 25, code review).

---

# 3 - DEVELOPER DEMANDS

Nenhum pedido aberto.
