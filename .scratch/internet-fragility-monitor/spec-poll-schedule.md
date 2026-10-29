# Spec: Poll Schedule, cadência e sobreposição numa política só

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-26-arquitetura.md`, seções 3 e 7. Quinta das cinco specs.

**Depende de:** `spec-provider-status.md` (Stale Snapshot em três ciclos), `spec-status-feed.md` (Poll descartado por falha do monitor) e `spec-poll-recording.md` (gravação do Poll e hora do último Poll).

## Problem Statement

O ciclo de Poll de 5 minutos aparece em três lugares independentes: na decisão de rodar um Poll ao iniciar, no agendamento e na atualização automática da página. Com a spec de Provider Status, ele aparece também na regra de Stale Snapshot. Mudar a cadência exige achar e alterar todos esses lugares, e esquecer um deixa a página e o agendamento desencontrados.

Nada impede dois Polls ao mesmo tempo. O agendamento dispara a cada 5 minutos sem saber se o Poll anterior terminou; a marca que existe só evita inicializar o agendamento duas vezes, apesar do nome sugerir outra coisa. Dois Polls simultâneos gravam leituras concorrentes e dobram as requisições às status pages.

Os testes do agendamento mockam todos os módulos ao redor, e um deles não afirma nada.

## Solution

Uma política de Poll Schedule passa a guardar a cadência, a regra de rodar ao iniciar, a exclusão mútua entre Polls e o limite de Stale Snapshot derivado da cadência. A página e o agendador leem a mesma cadência. Um disparo que encontra um Poll em andamento é pulado e registrado no log. O relógio e o disparo são injetados, e o node-cron vira só o adaptador que dispara.

## User Stories

1. Como visitante, quero que a página se atualize no mesmo ritmo em que os Polls acontecem, para ver cada Poll novo sem recarregar à mão.
2. Como visitante, quero que o aviso de Stale Snapshot apareça depois de três ciclos sem Poll, qualquer que seja a cadência configurada.
3. Como dono do monitor, quero mudar a cadência dos Polls num lugar só, para não deixar página e agendamento desencontrados.
4. Como dono do monitor, quero que um disparo seja pulado quando o Poll anterior ainda está rodando, para não sobrecarregar as status pages nem gravar Polls concorrentes.
5. Como dono do monitor, quero ver no log quando um disparo foi pulado, para perceber Polls que estão demorando demais.
6. Como dono do monitor, quero que, ao iniciar, o monitor rode um Poll na hora se o último tiver mais de um ciclo, para não esperar o próximo disparo.
7. Como dono do monitor, quero que, ao iniciar, o monitor não rode um Poll se o último for recente, para não repetir leituras a cada reinício.
8. Como dono do monitor, quero que, se não der para saber a hora do último Poll, o monitor rode um Poll na hora, por segurança.
9. Como dono do monitor, quero que o agendamento seja iniciado uma vez só por processo, mesmo que a inicialização seja chamada de novo.
10. Como mantenedor, quero testar a política com relógio e disparo falsos, sem esperar minutos reais e sem o node-cron.
11. Como mantenedor, quero que um erro dentro de um Poll seja registrado e não impeça os disparos seguintes.
12. Como mantenedor, quero que o teste vazio do agendamento seja substituído por testes que afirmam comportamento.

## Implementation Decisions

- **Política de Poll Schedule.** Concentra a cadência (5 minutos), o limite de Stale Snapshot (três ciclos), a regra de rodar ao iniciar e a exclusão mútua. Recebe o relógio, a forma de disparar e a operação de Poll, que lê o catálogo, lê os Feeds, decide o estado e grava.
- **Exclusão mútua.** A política sabe se há um Poll em andamento. Um disparo nesse momento é pulado e registrado no log; não há fila. A marca atual, que só evita inicializar duas vezes, é separada da marca de Poll em andamento.
- **Ao iniciar.** Roda um Poll na hora se o último tiver mais de um ciclo ou não existir; não roda se for recente; roda se a consulta da hora falhar. Esse comportamento é mantido do código atual.
- **Uma cadência para todos.** O módulo de Internet Health e a atualização automática da página passam a usar o valor da política, em vez de constantes próprias. A página entrega a cadência ao componente de atualização automática, que roda no navegador.
- **node-cron como adaptador.** O node-cron só dispara a política na cadência dela. A inicialização pelo mecanismo de instrumentação do Next continua sendo o ponto de entrada.
- **Erros.** Um erro no Poll é registrado, libera a marca de Poll em andamento e não interrompe o agendamento.
- **Retenção.** Apagar leituras com mais de 90 dias fica no Poll Recording, dentro da gravação do Poll; a política não cuida disso.

## Testing Decisions

- **Um bom teste aqui** usa um relógio e um disparo falsos e uma operação de Poll falsa que só registra quando foi chamada e quanto demorou. Confere quando os Polls rodam, não como a política faz isso.
- **Costura confirmada com o usuário (Q33):** relógio e disparo injetados, com o node-cron fora do teste.
- **Casos obrigatórios:**
  - Ao iniciar, o Poll roda com o último Poll de 6 minutos atrás, não roda com o de 4 minutos e roda quando não há último Poll ou a consulta falha.
  - Um disparo durante um Poll em andamento é pulado e registrado.
  - O disparo seguinte, depois do término, roda normalmente.
  - Um erro no Poll libera o próximo disparo.
  - Uma segunda inicialização não cria um segundo agendamento.
  - O limite de Stale Snapshot acompanha a cadência.
- **Testes que viram descarte:** o teste atual do agendamento, que mocka a camada de acesso, a gravação e os leitores, inclusive o caso de erro que não afirma nada.
- **Prior art:** a estrutura de casos do teste atual do agendamento (ao iniciar, dado recente, sem leitura, erro) é mantida como roteiro, trocando mocks de módulos por relógio e disparo falsos.

## Out of Scope

- Rodar o Poll fora do processo do Next, como um worker separado.
- Cadência diferente por Provider.
- Notificação de Down.

## Further Notes

- A página continua renderizada a cada requisição. A atualização automática só pede uma nova renderização ao servidor no ritmo da cadência.
