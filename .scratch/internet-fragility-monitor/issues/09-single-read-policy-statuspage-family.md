# 09: Política de leitura única com a família Statuspage.io

**Spec:** `spec-status-feed.md` · **Trilha:** T3 – Catálogo e Status Feed

**What to build:** Nasce o módulo de Status Feed com a política de leitura: timeout de 10 segundos por Provider Source, resultado independente por fonte, duração registrada no log e validação do conteúdo com Zod. A família Statuspage.io passa a ser um leitor pequeno sobre essa política e atende os seis Providers dela; cada Incident lido traz a fonte de origem e o id publicado. Uma status page lenta não atrasa mais os outros cards.

**Blocked by:** 08.

**Status:** ready-for-agent

- [ ] A política de leitura existe uma vez e é usada pela família Statuspage.io
- [ ] Uma fonte em timeout vira Feed não lido sem atrasar as outras
- [ ] O conteúdo da Statuspage.io é validado com Zod; conteúdo fora do formato vira Feed não lido com registro no log; os `any` dessa família somem
- [ ] Cada Incident traz a Provider Source e o id do Feed
- [ ] Os leitores copiados de Cloudflare, GitHub e Vercel e o leitor genérico antigo são apagados
- [ ] O tempo de resposta deixa de fazer parte do resultado e vai só para o log
- [ ] Fixtures reais da Statuspage.io (Cloudflare com indicador major e manutenções agendadas; uma com manutenção em andamento) e rede simulada com timeout e 5xx
