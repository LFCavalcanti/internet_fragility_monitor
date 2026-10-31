# 23: Descarte do Poll por falha parcial do monitor

**Spec:** `spec-monitor-failure-discard.md` · **Trilha:** T10 – Descarte do Poll

**What to build:** Uma falha de rede do próprio monitor deixa de produzir Down falso. Um Poll é descartado quando mais da metade das fontes não dá resposta HTTP nenhuma: timeout, DNS ou conexão. Qualquer código HTTP, inclusive 5xx, conta como resposta, então um evento real com vários Providers devolvendo 500 é gravado e aparece na página. O log diz quantas fontes ficaram sem resposta.

**Blocked by:** 18.

**Status:** done

- [x] A leitura de Feeds e Probes informa se houve resposta HTTP, de forma obrigatória e sem gravar nada
- [x] Timeout, erro de DNS e erro de conexão não são resposta HTTP; 404 e 503 são
- [x] Num Feed em mais de um endereço, basta um dar resposta HTTP
- [x] Com 38 fontes, 20 sem resposta HTTP descartam o Poll e 19 não; exatamente a metade não descarta
- [x] Sem nenhuma fonte ativa, o Poll não é descartado
- [x] Todas as fontes com 5xx: o Poll é gravado, e dois Polls assim levam a Down
- [x] A regra de Down não muda: 5xx continua sem resposta para Down
- [x] Um Poll descartado não grava nada, e a sequência de Down continua pelos Polls vizinhos
- [x] O log do Poll descartado traz quantas fontes ficaram sem resposta e o total
- [x] A regra de descarte continua num lugar só, sem nada de rede

## Comments

- `gotHttpResponse` é obrigatório nas leituras de um Poll (`ProbeReading`, `PolledFeedReading` e `SourcedFeedReading`, em `lib/status-feed/provider-reading.ts`), e `readProbe` passa a devolver `{ answered, gotHttpResponse }`. `FeedReading` e `ProviderStatusInput` não mudam: o Snapshot e a regra de Down seguem sem conhecer a resposta HTTP, e `recordPoll` grava só `answered` e o que já gravava.
- `noSourceAnswered` saiu de `provider-reading.ts`. A regra agora é `monitorFailure`, que devolve as contagens do log, ou null quando o Poll deve ser gravado. `sourcesUnanswered` segue sendo a base de Down.
- Com 38 fontes, 19 é exatamente a metade: os casos "19 grava" e "metade grava" da spec coincidem nesse catálogo. A regra também é testada com 4 fontes.
- Feed de família sem leitor não vai à rede e conta como fonte sem resposta HTTP, pela letra da regra (fonte ativa sem resposta). Em `poll-catalog.test.ts`, os casos em que uma fonte só salvava o Poll mudaram: agora ele é descartado, ou o caso passou a ter a maioria das fontes respondendo.
- Sem migration.
- Code review da onda 16: `readFeed` segue redirects, então um 3xx cujo destino falha conta como sem resposta HTTP, ao contrário do Probe, que lê o 3xx. O efeito é uma fonte a mais na conta do descarte, que só pesa com mais da metade delas sem resposta. Fica assim: ler o 3xx exigiria seguir os redirects à mão só para este caso.

