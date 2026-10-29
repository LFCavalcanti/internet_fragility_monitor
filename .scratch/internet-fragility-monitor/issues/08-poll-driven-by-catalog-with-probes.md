# 08: Poll guiado pelo catálogo, com Probes para quem não tem Feed

**Spec:** `spec-provider-catalog.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Cada Poll lê os Providers ativos e suas fontes ativas no banco e monta o leitor de cada Feed pela família, com a URL do catálogo. Um Feed de família desconhecida vira Feed não lido, com registro no log. Oracle, Salesforce e IBM, que ainda não têm Feed ativo, passam a rodar Probes (status page e login): aparecem Operational com a marca "verificação de acesso, sem feed de status" quando algum Probe responde. O leitor de ping é apagado.

**Blocked by:** 03 e 07.

**Status:** ready-for-agent

- [ ] O Poll monta os leitores a partir do catálogo; nenhuma URL de Feed fica fixa no código
- [ ] Família desconhecida resulta em Feed não lido e registro no log, sem derrubar o Poll
- [ ] Probes contam qualquer resposta abaixo de 500 como de pé (inclusive 302 e 403); timeout, erro de rede e 5xx como falha
- [ ] O módulo de Provider Status aplica a regra de Provider só com Probes, e o card mostra a marca de "só acesso"
- [ ] Um Provider só com Probes nunca aparece em Degraded, Outage ou Maintenance
- [ ] O leitor de ping é apagado
- [ ] Testes: Provider inativo não é lido; família desconhecida; regra de Provider só com Probes no módulo
