# Spec: Descarte do Poll por falha parcial do monitor

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-31-pendencias.md`, seção 2. Terceira das quatro specs dessa árvore.

**Depende de:** nada novo. Substitui a regra de falha do próprio monitor de `spec-status-feed.md`. Independente das outras specs desta árvore.

## Problem Statement

Hoje um Poll só é descartado quando nenhuma das 38 fontes responde. Se a rede ou o DNS do monitor falhar em parte e uma fonte qualquer responder, mesmo com 404, o Poll é gravado e os Providers afetados ficam sem resposta. Dois Polls assim seguidos e o card mostra Down. Se for um Major Provider, a página fica Critical sem nenhum problema real nos Providers.

## Solution

Um Poll passa a ser descartado quando mais da metade das fontes não dá resposta HTTP nenhuma: timeout, erro de DNS ou de conexão. Hoje isso significa 20 das 38.

Qualquer código HTTP, inclusive 5xx, prova que a rede do monitor funciona. Um evento real em que vários Providers devolvem 500 é gravado e aparece na página, em vez de ser descartado.

## User Stories

1. Como visitante, quero que uma falha de rede do próprio monitor não mostre Providers em Down, para não ver uma Major Outage falsa.
2. Como visitante, quero que um evento real com vários Providers devolvendo 5xx apareça na página, para o alarme existir quando ele importa.
3. Como visitante, quero ver o aviso de Stale Snapshot se os Polls continuarem descartados, para saber que a leitura parou.
4. Como dono do monitor, quero ver no log quantas fontes não deram resposta num Poll descartado, para diagnosticar a falha.
5. Como dono do monitor, quero que um Poll com até metade das fontes sem resposta continue gravado, para um problema real de alguns Providers aparecer.
6. Como dono do monitor, quero que um Poll descartado não conte nem zere a sequência de Down, como já acontece hoje.
7. Como mantenedor, quero que a regra de descarte continue num lugar só e sem nada de rede, para testá-la com leituras prontas.
8. Como mantenedor, quero testar timeout, erro de DNS e 5xx com a rede simulada.

## Implementation Decisions

- **Regra.** O Poll é descartado quando o número de fontes ativas sem nenhuma resposta HTTP é maior que a metade do total de fontes ativas do Poll. Com exatamente a metade, o Poll é gravado. Sem nenhuma fonte ativa, o Poll não é descartado, como hoje.
- **O que é resposta HTTP.** Qualquer código de status, inclusive 5xx. Timeout, erro de DNS e erro de conexão não são resposta. Num Feed em mais de um endereço, basta um endereço dar resposta HTTP.
- **Dois conceitos separados.** "Responder" continua significando código abaixo de 500, e é a base de Down. "Dar resposta HTTP" é o conceito novo, usado só no descarte. Um Provider que só devolve 5xx continua sem resposta para a regra de Down.
- **Leitura de cada fonte.** A leitura de Feeds e de Probes passa a informar se houve resposta HTTP. A informação é obrigatória, para um campo esquecido não mudar o descarte em silêncio, e não é gravada, porque o descarte acontece antes da gravação.
- **Consequência.** Um Poll em que todas as fontes devolvem 5xx passa a ser gravado, porque houve resposta HTTP. Hoje ele é descartado. Esse caso leva a Down depois de dois Polls, inclusive se um proxy na saída do monitor estiver devolvendo os erros.
- **Log.** O Poll descartado registra quantas fontes ficaram sem resposta e o total.
- **Sem tempo mínimo entre Polls.** Um Poll da inicialização seguido de perto pelo disparo agendado continua podendo declarar Down numa falha curta que atinja menos da metade das fontes. O caso é raro e fica como está.
- **Glossário.** A definição de Poll já foi atualizada no `GLOSSARY.md`.

## Testing Decisions

- **Um bom teste aqui** entrega leituras prontas à regra de descarte e confere só se o Poll é descartado, e usa a rede simulada para conferir o que cada leitura informa.
- **Costuras.** As que já existem: a regra de descarte, sem rede; a leitura com rede simulada; e a operação de Poll contra um SQLite real, para conferir que nada foi gravado. Nenhuma costura nova.
- **Casos obrigatórios:**
  - Com 38 fontes, 20 sem resposta HTTP descarta; 19 grava.
  - Exatamente metade grava.
  - Todas as fontes com 5xx grava, e dois Polls assim levam a Down.
  - Timeout, erro de DNS e erro de conexão contam como sem resposta HTTP; 404 e 503 contam como resposta.
  - Feed em dois endereços, um com timeout e outro com 503, conta como resposta HTTP.
  - Poll descartado não grava nada, e a sequência de Down continua pelos Polls vizinhos.
  - Sem nenhuma fonte ativa, o Poll não é descartado.
- **Testes que mudam.** O caso "Poll sem nenhuma resposta é descartado" passa a valer só para fontes sem resposta HTTP.
- **Prior art:** os testes da política de leitura com rede simulada e os da operação de Poll contra SQLite real.

## Out of Scope

- Tempo mínimo entre Polls.
- Fonte de referência fora do catálogo para testar a rede do monitor.
- Mudar a regra de Down.
- Notificação de Poll descartado.

## Further Notes

- Um evento real que só dê timeout em mais da metade das fontes vira Stale Snapshot depois de três ciclos, e não Critical. Foi a troca aceita: a página fica sem afirmar nada, em vez de afirmar algo errado.
- Um Provider que usa 5xx para indicar falha real continua contando como sem resposta para Down, e isso é o que se espera.
