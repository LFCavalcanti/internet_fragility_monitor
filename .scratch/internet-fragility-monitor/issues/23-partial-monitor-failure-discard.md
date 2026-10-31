# 23: Descarte do Poll por falha parcial do monitor

**Spec:** `spec-monitor-failure-discard.md` · **Trilha:** T10 – Descarte do Poll

**What to build:** Uma falha de rede do próprio monitor deixa de produzir Down falso. Um Poll é descartado quando mais da metade das fontes não dá resposta HTTP nenhuma: timeout, DNS ou conexão. Qualquer código HTTP, inclusive 5xx, conta como resposta, então um evento real com vários Providers devolvendo 500 é gravado e aparece na página. O log diz quantas fontes ficaram sem resposta.

**Blocked by:** 18.

**Status:** ready-for-agent

- [ ] A leitura de Feeds e Probes informa se houve resposta HTTP, de forma obrigatória e sem gravar nada
- [ ] Timeout, erro de DNS e erro de conexão não são resposta HTTP; 404 e 503 são
- [ ] Num Feed em mais de um endereço, basta um dar resposta HTTP
- [ ] Com 38 fontes, 20 sem resposta HTTP descartam o Poll e 19 não; exatamente a metade não descarta
- [ ] Sem nenhuma fonte ativa, o Poll não é descartado
- [ ] Todas as fontes com 5xx: o Poll é gravado, e dois Polls assim levam a Down
- [ ] A regra de Down não muda: 5xx continua sem resposta para Down
- [ ] Um Poll descartado não grava nada, e a sequência de Down continua pelos Polls vizinhos
- [ ] O log do Poll descartado traz quantas fontes ficaram sem resposta e o total
- [ ] A regra de descarte continua num lugar só, sem nada de rede
