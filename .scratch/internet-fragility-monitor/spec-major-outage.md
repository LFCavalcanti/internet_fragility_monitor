# Spec: Major Outage no topo da página e textos em inglês

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-31-pendencias.md`, seções 5, 6 e 7. Segunda das quatro specs dessa árvore.

**Depende de:** `spec-declared-severity.md`. Sem ela, só a Cloudflare chega a Outage entre os Major Providers, e o Critical dela vem do indicador geral.

## Problem Statement

A página não distingue um problema de um Provider sem muito efeito na internet de um problema que atinge a internet de forma ampla. A palavra "major" aparece no lugar errado: quando a Heroku sozinha entra em Outage sem título de Incident, o destaque diz "Major outage reported.", justamente no caso de pouco efeito.

Dois Providers pequenos em Outage ao mesmo tempo deixam a página Critical. Como o monitor aceita o que o Provider declara, basta a Salesforce declarar `major` em uma instância entre centenas e a Heroku ficar vermelha só no painel para o site anunciar que a estabilidade da internet está em risco.

A página é em inglês, mas tem textos em português, e o card Unreachable lista Incidents com a última fase lida como se fossem atuais.

## Solution

"Major Outage" vira o termo reservado para o que deixa a página Critical: um Major Provider em Outage ou Down, ou três ou mais Providers quaisquer em Outage ou Down. O card continua dizendo só Outage, e o "Major" aparece no topo da página, que fala da internet como um todo.

A página fica toda em inglês, com títulos pelo glossário, e o card Unreachable avisa que os Incidents vêm da última leitura.

## User Stories

1. Como visitante, quero entender pelo topo da página se o problema atinge a internet de forma ampla ou só um Provider, porque esse é o objetivo do site.
2. Como visitante, quero ver "Major Outage" quando a AWS, o Google Cloud, a Azure ou a Cloudflare estiverem em Outage ou Down.
3. Como visitante, quero ver "Major Outage" quando três ou mais Providers estiverem em Outage ou Down ao mesmo tempo.
4. Como visitante, quero que um Provider comum em Outage deixe a página Unstable, e não Critical.
5. Como visitante, quero que dois Providers comuns em Outage deixem a página Unstable, para dois problemas pequenos não anunciarem risco para a internet.
6. Como visitante, quero que o destaque diga "Multiple Outages" nesse caso, para eu ver os dois Providers.
7. Como visitante, quero que o destaque diga "Widespread Outage" quando vários Providers formarem uma Major Outage.
8. Como visitante, quero que o destaque de um Major Provider diga "Major Outage", com o título do Incident.
9. Como visitante, quero que o card continue mostrando só o Provider Status, sem "Major".
10. Como visitante, quero que a palavra "major" nunca apareça para um Provider comum sozinho.
11. Como visitante, quero ler toda a página em inglês, sem trechos em português.
12. Como visitante, quero que títulos e textos usem os termos do glossário, para o mesmo nome significar a mesma coisa em toda a página.
13. Como visitante, quero ver um aviso no card Unreachable de que os Incidents vêm da última leitura, para não tomá-los por atuais.
14. Como visitante, quero que um card lido normalmente não mostre esse aviso.
15. Como mantenedor, quero que a regra de Major Outage exista num lugar só, para não haver duas contas de Critical.
16. Como mantenedor, quero testar cada situação do topo da página com o módulo de Internet Health, sem renderizar a página inteira.

## Implementation Decisions

- **Major Outage no módulo de Internet Health.** Há Major Outage quando um Major Provider está em Outage ou Down, ou quando três ou mais Providers quaisquer estão em Outage ou Down. Critical é exatamente isso. O limiar sobe de dois para três. Um Stale Snapshot continua vencendo qualquer faixa.
- **Unstable com dois Providers.** A regra atual assume no máximo um Provider em Outage ou Down fora de Critical. Agora pode haver dois, e o destaque precisa cobrir esse caso.
- **Topo da página por situação.**

| Situação | Estado e texto | Destaque |
|---|---|---|
| Um Provider comum em Outage | Unstable: "1 provider is experiencing problems." | "Provider Outage", Provider, título do Incident ou "Outage reported." |
| Um Provider comum em Down | Unstable: "1 provider is experiencing problems." | "Provider Down", Provider, "Status page and service not responding" |
| Dois Providers comuns em Outage ou Down | Unstable: "2 providers are experiencing problems." | "Multiple Outages": "Outages detected in Heroku, Salesforce." |
| Um Major Provider em Outage ou Down, sozinho | Critical: "Major outage at AWS. Internet stability is at risk." | "Major Outage", Provider, título do Incident, ou "Status page and service not responding" em Down |
| Dois ou mais Providers formando uma Major Outage | Critical: "Major outage across 3 providers. Internet stability is at risk." | "Widespread Outage": "Outages detected in AWS, Heroku, Vercel." |

- **Contagem em Unstable.** O texto segue contando Providers em Outage, Down ou Degraded. O destaque continua priorizando Outage e Down sobre Degraded.
- **Título de Degraded.** "Service Degraded" vira "Provider Degraded". "Widespread Instability" fica, porque não usa nenhum termo evitado.
- **Traduções.**

| Hoje | Novo |
|---|---|
| "Não foi possível ler a status page" | "Couldn't read the status page" |
| "Sem resposta da status page nem do serviço" | "No response from the status page or the service" |
| "Status page e serviço sem resposta" | "Status page and service not responding" |
| "Sem leitura recente" | "No recent reading" |
| "Sem leitura recente. The provider cards may be out of date." | "No recent reading. The provider cards may be out of date." |
| "verificação de acesso, sem feed de status" | "Access check only, no status feed" |
| "1 de 2 feeds sem leitura" | "1 of 2 feeds unread" |

- **Provider em Down dentro de uma lista.** O nome vem seguido do texto de Down em minúsculas, como hoje, agora em inglês.
- **Aviso no card Unreachable.** Com Incidents na lista, o card mostra "These Incidents come from the last reading and may be out of date." Sem Incidents, não mostra. A Upcoming Maintenance continua escondida nesse card.
- **Data do Incident.** Continua a data de início em todos os Providers. A decisão de 28/10/2026 de mostrar a última atualização na AWS está revogada, e nada muda no código.
- **Glossário.** Major Outage e Critical já estão no `GLOSSARY.md`.

## Testing Decisions

- **Um bom teste aqui** entrega ao módulo de Internet Health os Providers com seus estados e confere o estado, o texto e o destaque devolvidos. Os testes de componente conferem só o que aparece na tela.
- **Costuras.** As que já existem: a decisão de Internet Health, o componente do topo da página, o card e o aviso de Stale. Nenhuma costura nova.
- **Casos obrigatórios:**
  - Cada linha da tabela de situações.
  - Dois Providers comuns em Outage são Unstable; três são Critical; um Major Provider e um comum são Critical com "Widespread Outage".
  - Um Major Provider em Degraded continua Unstable.
  - Um Provider comum em Outage nunca mostra a palavra "major".
  - Um Major Provider em Down sozinho mostra "Major Outage" e o texto de Down.
  - Stale Snapshot continua vencendo Critical.
  - Card Unreachable com Incidents mostra o aviso; sem Incidents, não; card lido normalmente, não.
  - Cada texto novo aparece, e nenhum dos textos em português continua na tela.
- **Testes que mudam.** Os casos atuais com dois Providers em Critical e os que citam os textos antigos.
- **Prior art:** os testes do módulo de Internet Health, do topo da página, do card e do aviso de Stale.

## Out of Scope

- Como cada Provider chega a Outage: `spec-declared-severity.md`.
- Mostrar "Major" no card.
- Rebaixar um Major Provider em Outage por ter sido atingido só em parte.
- Revisar "Degraded service detected in", "Service issues reported." e "All monitored services are operating normally.": neles, "service" é o que o Provider oferece, não o Provider.

## Further Notes

- Três Providers é um número de bom senso, sem histórico para calibrar: o banco local tem um Poll só.
- O texto de um Major Provider sozinho cita o nome dele. Com dois ou mais, cita a quantidade, e o destaque traz os nomes.
