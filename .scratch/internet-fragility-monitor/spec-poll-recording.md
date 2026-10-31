# Spec: Poll Recording, gravar uma rodada e ler o Snapshot num módulo só

**Status:** ready-for-agent

**Origem:** árvore `arvore-de-decisoes-2026-10-26-arquitetura.md`, seções 5, 8, 9 e 10. Quarta das cinco specs.

**Depende de:** `spec-provider-status.md`, `spec-provider-catalog.md` e `spec-status-feed.md`, que fornece Incidents com a fonte de origem e o id publicado.

## Problem Statement

Gravar o resultado de um Poll atravessa quatro módulos rasos: a conexão com o banco, uma camada de acesso em que cada função é uma consulta de poucas linhas, uma camada de validação cujo enum de status nunca é aplicado e a reconciliação de Incidents. Os testes mockam cada camada, e por isso a reconciliação real nunca rodou contra um banco.

Essa reconciliação tem defeitos que afetam o que o visitante vê.

- **Identidade pelo título.** Um Incident é reconhecido pelo título em todo o histórico do Provider. A Cloudflare publica manutenções com o mesmo título, e o banco local já tem linhas duplicadas. Um título que se repete meses depois reaproveita a linha antiga, com a data antiga, e o card esconde a ocorrência nova.
- **Escritas soltas.** As escritas de um Poll não ficam numa transação: uma falha no meio deixa o Snapshot pela metade.
- **Leitura pesada.** A leitura do Snapshot faz duas consultas por Provider.
- **Histórico sem fim.** As leituras se acumulam para sempre, cerca de 3.700 por dia.
- **Conexão no import.** O banco conecta assim que o módulo é importado, o que impede testar com outro banco, e o log de inicialização imprime a URL do banco.

## Solution

Um módulo de Poll Recording passa a gravar um Poll inteiro e a ler o Snapshot, testado contra um SQLite real em memória. Incidents são identificados pela Provider Source e pelo id que o Feed publica, e os Incidents antigos sem id são reconciliados uma única vez pelo título. Cada Poll é gravado numa transação, guarda se cada Provider ficou sem resposta para a regra de Down, e apaga as leituras com mais de 90 dias. As camadas rasas de acesso e validação são absorvidas.

## User Stories

1. Como visitante, quero que um Incident novo com o mesmo título de um antigo apareça como novo, com a data dele, para não perder um problema que se repete.
2. Como visitante, quero que manutenções diferentes com o mesmo título apareçam como manutenções diferentes.
3. Como visitante, quero que um Provider seja mostrado em Down só depois de dois Polls seguidos sem resposta de nenhuma fonte.
4. Como visitante, quero que um Incident só seja dado como resolvido quando o Feed dele foi lido e não o trouxe mais, e não quando o Feed falhou.
5. Como visitante, quero que a página nunca mostre um Poll gravado pela metade.
6. Como visitante, logo depois da mudança, quero ver os Incidents em andamento sem duplicatas.
7. Como dono do monitor, quero manter os Incidents para sempre, como registro do que aconteceu.
8. Como dono do monitor, quero que as leituras com mais de 90 dias sejam apagadas, para o banco não crescer sem limite.
9. Como mantenedor, quero um módulo só para gravar um Poll e ler o Snapshot, para entender e corrigir a persistência num lugar.
10. Como mantenedor, quero testar a gravação contra um banco real em memória com as migrations reais, para que os testes confirmem o que foi gravado.
11. Como mantenedor, quero que o banco seja recebido pelo módulo, e não aberto no import, para usar um banco em memória nos testes.
12. Como mantenedor, quero que o log de inicialização não imprima a URL do banco, que pode carregar credencial.
13. Como mantenedor, quero que a leitura do Snapshot use poucas consultas, independentemente do número de Providers.
14. Como mantenedor, quero que o tempo de resposta saia do que é gravado, porque ele mede a nossa leitura e só aparece no log.
15. Como mantenedor, quero que as funções sem uso em produção e os testes que só verificam mocks sejam apagados.
16. Como mantenedor, quero que os status gravados sejam validados contra o vocabulário do domínio, para que um valor inválido não chegue ao banco.

## Implementation Decisions

- **Módulo de Poll Recording.** Tem duas operações no domínio: gravar um Poll e ler o Snapshot. Absorve a camada de acesso, a camada de validação e a reconciliação atuais. O banco é recebido pelo módulo; a aplicação cria a conexão uma vez na inicialização.
- **Gravar um Poll.** Recebe, para cada Provider, a leitura vinda do Status Feed. Grava tudo numa transação: uma leitura por Provider, com o pior estado lido e a indicação de que nenhuma fonte respondeu, e a reconciliação dos Incidents. O Provider Status é decidido na leitura do Snapshot, porque depende dos Incidents e do Poll anterior.
- **Identidade do Incident.** Provider Source mais o id publicado pelo Feed. A tabela de Incidents ganha a fonte e o id externo, com unicidade para o par.
- **Reconciliação.** Incident novo é inserido; Incident conhecido tem status, descrição e datas atualizados. Incidents ativos de um Feed lido que não os trouxe mais são resolvidos. Incidents de um Feed não lido neste Poll ficam como estão.
- **Passagem única para os Incidents antigos.** Quando um Incident com id chega e não existe linha com esse id, ele procura uma linha antiga, sem fonte e sem id, ainda aberta, do mesmo Provider e com o mesmo título, e a assume. As linhas antigas abertas que nenhum Incident assumir são resolvidas no fim desse Poll. Depois dessa passagem, o título não é mais chave.
- **Regra de Down.** A leitura do Snapshot informa, por Provider, se o Poll anterior também ficou sem resposta de nenhuma fonte. O módulo de Provider Status aplica a regra com essa informação.
- **Ler o Snapshot.** Devolve, para os Providers ativos, a leitura mais recente, a indicação do Poll anterior, os Incidents ativos, os resolvidos dentro da janela de Recent Incident, as manutenções agendadas e a hora do último Poll. Usa um número fixo de consultas.
- **Retenção.** Ao gravar um Poll, as leituras com mais de 90 dias são apagadas, menos as duas mais novas de cada Provider. Incidents nunca são apagados.
- **Schema.** Incidents ganham fonte e id externo. A coluna de tempo de resposta e a coluna de severidade, que nunca é gravada, são removidas.
- **Limpeza.** Saem as funções sem uso em produção, a diretiva de server action aplicada a módulos que só rodam no servidor e o log da URL do banco.

## Testing Decisions

- **Um bom teste aqui** grava Polls pelo módulo num banco real em memória e confere o Snapshot lido de volta, ou o que ficou nas tabelas. Nunca verifica se uma consulta foi chamada.
- **Costura confirmada com o usuário (Q33):** SQLite em memória com as migrations reais.
- **Casos obrigatórios:**
  - Duas manutenções com o mesmo título e ids diferentes viram dois Incidents.
  - Um título repetido com id novo vira Incident novo.
  - Incident de Feed não lido não é resolvido.
  - Incident ausente de Feed lido é resolvido.
  - A passagem única assume a linha antiga e resolve as não assumidas.
  - O segundo Poll seguido sem resposta é informado.
  - A retenção apaga a leitura de 91 dias e mantém a de 89.
  - Uma falha no meio da gravação não deixa nada gravado.
- **Testes que viram descarte:** os da camada de acesso, que mockam a cadeia do Drizzle; os da reconciliação com a camada de acesso mockada; os da conexão, que travam o comportamento de conectar no import; o teste de exemplo do setup; e as partes dos testes de validação que cobrem funções sem uso em produção.
- **Prior art:** o teste de migration de carga da spec de Provider Catalog, que já aplica as migrations reais num banco em memória.

## Out of Scope

- Juntar o mesmo incidente publicado em Feeds diferentes: a revisitar.
- Histórico consultável na página, como gráficos ou percentual de disponibilidade.
- Cadência e agendamento do Poll: spec de Poll Schedule.

## Further Notes

- A passagem única depende de os Feeds atuais publicarem ids estáveis, o que foi verificado em 26/10/2026 para Statuspage.io, Google Cloud e RSS da AWS.
