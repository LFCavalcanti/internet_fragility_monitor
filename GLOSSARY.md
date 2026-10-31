# Internet Fragility Monitor

Acompanha as status pages públicas de provedores de infraestrutura e mostra, numa página só, o estado de cada um e o quanto a internet como um todo está frágil.

## Provedores e leituras

**Provider**:
Uma empresa de infraestrutura cuja status page é acompanhada, como AWS, Cloudflare ou Heroku.
_Avoid_: service, vendor, serviço

**Provider Catalog**:
O conjunto de Providers que o monitor conhece, com os dados de cada um. Um Provider do catálogo pode estar ativo, e então é acompanhado, ou inativo, e então sai dos Polls e da página mas mantém seus Incidents.
_Avoid_: provider list, registry, config

**Provider Source**:
Um endereço de onde o monitor lê algo sobre um Provider. É um Feed ou um Probe, e um Provider pode ter vários de cada.
_Avoid_: endpoint, origin, fonte de dados

**Core Service**:
Um serviço de um Provider do qual sites de terceiros dependem para continuar no ar, como o CDN da Cloudflare. Num Provider com Core Services, o estado geral que ele publica não vale: o Provider Status vem dos Incidents, conforme atinjam ou não esses serviços. Hoje só a Cloudflare tem Core Services.
_Avoid_: critical service, main service

**Feed**:
Um Provider Source em que o próprio Provider declara seu estado e seus Incidents, como uma status page Statuspage.io ou um RSS.
_Avoid_: API, status API

**Probe**:
Um Provider Source que só verifica se um endereço do Provider responde, como a status page ou a página de login do serviço. Não declara estado nem Incidents.
_Avoid_: ping, health check

**Major Provider**:
Um Provider marcado no Provider Catalog como aquele cuja falha, sozinha, afeta uma parte grande da internet. Hoje são AWS, Google Cloud, Azure e Cloudflare.
_Avoid_: big provider, provedor principal

**Poll**:
Uma rodada de leitura dos Provider Sources de todos os Providers ativos. Um Poll em que mais da metade dos Provider Sources não dá resposta nenhuma é descartado como falha do próprio monitor. Uma resposta de erro é resposta: prova que a rede do monitor funciona.
_Avoid_: job, check run, sync

**Snapshot**:
O resultado do Poll mais recente: o Provider Status e os Incidents de cada Provider naquele momento.
_Avoid_: latest status, cache

**Partial Reading**:
Um Snapshot de um Provider em que só parte dos Feeds pôde ser lida. O Provider Status vem dos Feeds lidos, e a lacuna fica visível.
_Avoid_: partial status, degraded reading

**Stale Snapshot**:
Um Snapshot feito há mais de três ciclos de Poll, que já não pode ser apresentado como o estado atual.
_Avoid_: old data, dados velhos

## Estado de um Provider

**Provider Status**:
O estado de um Provider num Snapshot. É sempre um destes seis: Down, Outage, Degraded, Maintenance, Operational ou Unreachable. Os cinco primeiros seguem essa ordem de precedência.
_Avoid_: health, state, unknown

**Operational**:
O Provider declara que está tudo funcionando.

**Degraded**:
O Provider declara um problema parcial: parte dos serviços está lenta ou falhando.
_Avoid_: unstable, minor

**Outage**:
O Provider declara uma falha grave em parte relevante dos serviços. Quem julga a relevância é o Provider: o monitor não reinterpreta a declaração. A exceção é o Provider com Core Services, em que a Outage precisa atingir um deles.
_Avoid_: critical

**Down**:
Nenhum Provider Source responde por dois Polls seguidos: nem os Feeds, nem os Probes. Não é declarado pelo Provider, é observado pelo monitor, e é o pior caso possível.
_Avoid_: offline, SEV0, total outage

**Maintenance**:
O Provider está com uma manutenção em andamento agora. Nunca prevalece sobre Down, Outage ou Degraded.
_Avoid_: scheduled

**Unreachable**:
Nenhum Feed do Provider pôde ser lido, mas algum Probe ainda responde, ou a falha ainda não se repetiu por dois Polls. Descreve a leitura, não o Provider: não é evidência de Outage.
_Avoid_: unknown, offline

## Incidentes

**Incident**:
Um problema ou manutenção que o Provider publica num Feed. É identificado pelo Feed em que foi publicado junto com o identificador que esse Feed dá a ele, nunca pelo título.
_Avoid_: event, issue, alert

**Recent Incident**:
Um Incident ainda ativo, de qualquer idade, ou um Incident resolvido há menos de 48 horas.
_Avoid_: latest incidents

**Dormant Incident**:
Um Incident ainda ativo sobre o qual o Provider não publica nada há mais de 30 dias. Continua nos Recent Incidents, mas não conta para o Provider Status. Quando o Provider publica um estado geral próprio, vale esse estado.
_Avoid_: stale incident, old incident

**Upcoming Maintenance**:
Uma manutenção que o Provider agendou para o futuro e que ainda não começou. Não afeta o Provider Status.
_Avoid_: scheduled maintenance, maintenance

## Visão geral

**Internet Health**:
O estado da internet como um todo, derivado do Provider Status de todos os Providers. É sempre um destes três: Healthy, Unstable ou Critical.
_Avoid_: global status, overall status

**Critical**:
Internet Health em que há uma Major Outage.

**Major Outage**:
Um Major Provider em Outage ou Down, ou três ou mais Providers quaisquer em Outage ou Down ao mesmo tempo. Fala do efeito na internet, não é um Provider Status: um Provider sozinho, fora dos Major Providers, em Outage, não é uma Major Outage.
_Avoid_: global outage

**Unstable**:
Internet Health em que algum Provider está em Degraded, Outage ou Down, sem chegar a Critical.

**Healthy**:
Internet Health em que nenhum Provider está em Degraded, Outage ou Down. Maintenance e Unreachable não contam.
