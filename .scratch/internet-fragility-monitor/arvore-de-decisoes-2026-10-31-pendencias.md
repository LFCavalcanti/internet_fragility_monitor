# Árvore de decisões: pendências do ciclo de arquitetura (grilling de 31/10/2026)

**Status:** árvore **fechada** em 31/10/2026 (`/grill-with-docs` sobre o `ISSUES_ANNOTATION.md`, com fronteira vazia). Specs escritas em 31/10/2026 (`/to-spec`): `spec-declared-severity.md`, `spec-major-outage.md`, `spec-monitor-failure-discard.md` e `spec-post-cycle-cleanup.md`. Ajustes em `spec-poll-recording.md` e `spec-status-feed.md`. Nenhuma decisão foi implementada ainda.

Convenção: **Decidido** = muda o comportamento ou o texto; **Mantido** = fica como está. Termos do domínio conforme o `GLOSSARY.md`, atualizado nesta sessão com Major Outage, Dormant Incident e Core Service.

## 1. Diagnóstico (lido no código e nos Feeds reais, 31/10/2026)

- **AWS, Azure e Google Cloud nunca chegam a Outage.** Os leitores deles só respondem Operational ou Degraded (`declaredByOpenProblems`). Uma queda grande da AWS mostraria Degraded e Unstable. Dos quatro Major Providers, só a Cloudflare declarava Outage.
- **Cloudflare em Critical sem problema real.** Em 31/10/2026 o Feed trazia indicador `major` com 0 Incidents abertos, 0 de 131 serviços com problema e 21 de 342 data centers em `major_outage`. A regra do Statuspage leva o estado geral a "Partial System Outage" com um único componente em falha total. O Poll local de 26/10 também gravou Outage. GitHub, Vercel, DigitalOcean e Jira estavam com indicador `none`.
- **Evento longo da AWS.** Os eventos do Oriente Médio seguem abertos, com última atualização em 15/09/2026 e título "Service disruption".
- **Azure.** A documentação da Microsoft diz que a página pública só comunica problemas de impacto amplo ou quando o portal fica inacessível.

## 2. Leitura do Poll

- **Descarte do Poll (Decidido).** Descartado quando mais da metade dos Provider Sources não dá nenhuma resposta HTTP (timeout, DNS, conexão): hoje 20 das 38. Um 5xx é resposta, prova que a rede do monitor funciona, e segue contando como Provider com problema. (Descartados: mais da metade contando 5xx, porque esconderia um evento real; tempo mínimo entre Polls, que só resolve a coincidência do boot.)
- **Retenção (Mantido).** A exceção das duas leituras mais novas de cada Provider fica. Caso raro, sem efeito prático; o item sai das pendências.

## 3. Provider Status

- **Quem julga a relevância (Decidido).** O monitor aceita o que o Provider declara, sem regra de gravidade por Provider. Heroku vermelha só em Tools e Salesforce com `major` em uma instância continuam Outage. A exceção é a Cloudflare (seção 4).
- **Google Cloud chega a Outage (Decidido).** `status_impact` `SERVICE_OUTAGE` vira Outage.
- **AWS chega a Outage (Decidido).** Título "Service disruption" vira Outage; "Service degradation" e "Service impact" seguem Degraded. Vale a última atualização do evento.
- **Azure chega a Outage (Decidido).** Problema aberto vira Outage, porque a página pública só publica problemas amplos.
- **IBM (Mantido).** Continua só com Degraded: o Feed não publica gravidade e ela não é Major Provider.
- **Dormant Incident (Decidido).** Um Incident ativo sem atualização do Provider há mais de 30 dias continua listado no card, mas não conta para o Provider Status; volta a contar se o Provider atualizar. Vale para AWS, Azure, Google Cloud, Cloudflare, IBM e Salesforce, em que o estado é deduzido dos Incidents. O estado geral declarado por Providers Statuspage e pela Heroku prevalece. Na Azure, sem data de atualização, vale a data publicada no item.

## 4. Cloudflare

- **Data centers (Decidido).** Data center sozinho nunca muda o estado da Cloudflare, e o estado geral publicado por ela deixa de ser usado.
- **Core Services (Decidido).** CDN/Cache, Firewall (o componente mais próximo do WAF), Bot Management, Authoritative DNS, Recursive DNS, Network e Workers.
- **Classificação (Decidido, a acompanhar depois do deploy).**

| Impacto declarado | Atinge um Core Service | Só fora dos Core Services |
|---|---|---|
| `major` ou `critical` | Outage | Degraded |
| `minor` | Degraded | Não muda o estado; fica listado no card |

Um Incident sem serviço indicado conta como Core Service. Um Core Service marcado em falha também conta, mesmo sem Incident. Definido na escrita da spec, pela decisão de data centers: Incident ou manutenção em andamento que só atinge data centers não muda o estado. Na janela de 16 a 31/10/2026 (sem dois Incidents longos): Outage duas vezes, 5,7 h no total; Degraded por `minor` em Core Service, cerca de 13 h; mais 5 Incidents `major` ou `critical` fora dos Core Services como Degraded.

## 5. Internet Health

- **Major Outage (Decidido).** Um Major Provider em Outage ou Down, ou três ou mais Providers quaisquer em Outage ou Down. É o que define Critical. O card continua dizendo só Outage.
- **Limiar de Critical (Decidido).** Sobe de dois para três Providers quaisquer. Um número de bom senso, sem histórico para calibrar.

## 6. Textos da página

- **Idioma (Decidido).** Toda a página em inglês.
- **Hero por situação (Decidido).**

| Situação | Estado e texto | Destaque |
|---|---|---|
| Um Provider comum em Outage | Unstable: "1 provider is experiencing problems." | "Provider Outage", Provider, título do Incident ou "Outage reported." |
| Dois Providers comuns em Outage | Unstable: "2 providers are experiencing problems." | "Multiple Outages": "Outages detected in Heroku, Salesforce." |
| Major Provider em Outage ou Down | Critical: "Major outage at AWS. Internet stability is at risk." | "Major Outage", Provider, título do Incident |
| Vários Providers, em Major Outage | Critical: "Major outage across 3 providers. Internet stability is at risk." | "Widespread Outage": "Outages detected in AWS, Heroku, Vercel." |

- **Títulos de um Provider (Decidido).** "Provider Down", "Provider Outage" e "Provider Degraded", no lugar de "Service ...".
- **Traduções (Decidido).**

| Hoje | Novo |
|---|---|
| "Não foi possível ler a status page" | "Couldn't read the status page" |
| "Sem resposta da status page nem do serviço" | "No response from the status page or the service" |
| "Status page e serviço sem resposta" | "Status page and service not responding" |
| "Sem leitura recente" | "No recent reading" |
| "verificação de acesso, sem feed de status" | "Access check only, no status feed" |

## 7. Card

- **Incidents no card Unreachable (Decidido).** A lista fica, com o aviso "These Incidents come from the last reading and may be out of date."
- **Upcoming Maintenance no card Unreachable (Mantido).** Continua escondida.
- **Data do Incident (Decidido).** Data de início em todos os Providers; a decisão de 28/10/2026 de mostrar a última atualização na AWS fica revogada.

## 8. Registro e catálogo

- **Recorrência na AWS e na Azure (Mantido).** Uma nova ocorrência no mesmo serviço e região reaproveita o registro anterior. Revisitar se surgir tela de histórico ou contagem.
- **Azure edita o título (Mantido).** Só observação, sem ação.
- **"Histórico" de um Provider inativo (Decidido).** São os Incidents; as leituras antigas saem pela retenção.
- **Site do GitHub (Decidido).** Corrigir para `https://github.com` por migration de dados.
- **`status_checks` (Mantido).** A gravação guarda a leitura; ajustar a spec de Poll Recording para bater com o código.

## 9. Escolhas dos agentes aceitas

Todas da seção 1.2 do `ISSUES_ANNOTATION.md`, mais "Banco sem nenhum Poll": título "Recent Incidents"; linha de Upcoming Maintenance em inglês e UTC; manutenção sem data; "No Poll recorded yet."; Providers só com Probes sem Recent Incidents; janela de 48 h; fim de evento nos RSS da AWS, da Azure e da IBM; limite de manutenções da Salesforce.

## 10. Faxina técnica

- **Exclusão de `.claude/**` no vitest (Decidido).** O `eslint.config.mjs` já ignora a pasta.
- **Teste que trava o plano de `latestChecks` (Decidido).**
- **Histórico inteiro lido a cada Poll (Mantido).** Fica registrado até pesar.

## 11. O que continua com o usuário

As ações e avisos de deploy da seção 2.1 do `ISSUES_ANNOTATION.md` seguem valendo.
