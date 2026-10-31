# Spec: Faxina depois do ciclo de arquitetura

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-31-pendencias.md`, seções 8 e 10. Quarta das quatro specs dessa árvore.

**Depende de:** nada. Independente das outras specs desta árvore.

## Problem Statement

Sobraram três defeitos pequenos do ciclo de arquitetura.

O link do site do GitHub no catálogo aponta para a status page, `https://githubstatus.com`, e não para `https://github.com`.

Rodar os testes na checkout principal também varre os worktrees dos agentes, e os testes em andamento de um agente aparecem como falhas na `main`. O lint já ignora essa pasta; os testes, não.

A consulta da última leitura depende do plano que o SQLite escolhe. Com um JOIN comum, ela varre a tabela de leituras inteira, e custou 12 segundos em 400 mil linhas. Com 90 dias de retenção a tabela chega a cerca de 337 mil linhas, então a lentidão seria real. Nenhum teste trava esse plano, e uma reescrita pode deixar a consulta lenta em silêncio.

## Solution

Uma migration de dados corrige o link do GitHub. A configuração de testes passa a ignorar os worktrees. Um teste confere o plano da consulta contra um SQLite real.

## User Stories

1. Como visitante, quero que o link do site do GitHub me leve ao GitHub, e não à status page.
2. Como orquestrador, quero rodar a suíte completa na `main` com agentes trabalhando em worktrees, sem ver os testes deles como falhas.
3. Como mantenedor, quero não precisar lembrar de um parâmetro de exclusão ao rodar os testes.
4. Como mantenedor, quero que um teste falhe se a consulta da última leitura voltar a varrer a tabela inteira, para saber disso antes do deploy.
5. Como dono do monitor, quero que a página continue rápida com 90 dias de leituras.

## Implementation Decisions

- **Link do GitHub.** Migration de dados no catálogo, conforme o ADR 0001, troca o site do GitHub para `https://github.com`. A status page do Provider continua a mesma.
- **Testes.** A configuração do Vitest passa a excluir `.claude/**`, somada às exclusões padrão dele. O lint não muda, porque já exclui a pasta.
- **Teste do plano.** O teste pede ao SQLite o plano da consulta da última leitura, numa base real migrada, e confere que ela usa o índice das leituras, sem varredura de `status_checks`. Para isso, a consulta precisa estar acessível ao teste sem duplicar o SQL.

## Testing Decisions

- **Um bom teste aqui** confere o resultado visível: o site gravado depois das migrations e o plano escolhido pelo SQLite. Não confere o texto do SQL.
- **Costuras.** A base real migrada, a mesma usada pelos testes de Poll Recording. Nenhuma costura nova.
- **Casos obrigatórios:**
  - Depois das migrations, o GitHub tem `https://github.com` como site, com a status page intacta.
  - O plano da consulta da última leitura não tem varredura de `status_checks`.
  - Trocar o CROSS JOIN por um JOIN comum faz esse teste falhar, conferido uma vez à mão ao escrever o teste.
- **Prior art:** os testes de Poll Recording contra SQLite real e os testes de migrations do catálogo.

## Out of Scope

- Limitar a leitura de Incidents a cada Poll. Continua como pendência no `ISSUES_ANNOTATION.md`, até pesar de verdade.
- Outras correções no catálogo.

## Further Notes

- A migration do GitHub entra na lista de migrations do `ISSUES_ANNOTATION.md`, seção 2.1, quando for implementada.
