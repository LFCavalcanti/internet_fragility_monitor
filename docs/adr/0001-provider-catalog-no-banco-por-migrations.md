# Provider Catalog no banco, alterado só por migrations de dados

**Status:** accepted (26/10/2026)

O Provider Catalog, com os Providers, seus dados e seus Provider Sources, mora no banco, que é a única fonte dele. A carga inicial e toda mudança posterior entram como migrations de dados versionadas no repositório e aplicadas pelo `db:migrate` no deploy. O código guarda só os leitores de cada família de Feed. Escolhemos assim porque o catálogo é dado, não comportamento, e porque a migration deixa cada mudança revisada e igual em todos os ambientes sem exigir uma tela de administração.

## Considered Options

- **Catálogo no código, com a tabela só como âncora das chaves estrangeiras.** Rejeitado: amarra dado de configuração ao código e era a origem das três cópias divergentes (lista de fetchers, lista de metadados e tabela sobrescrita a cada Poll).
- **Script de seed que reaplica uma lista do repositório a cada deploy.** Rejeitado: devolve ao código o papel de fonte e desfaz mudanças feitas direto no banco.
- **Tela de administração.** Adiada: é a opção mais flexível, mas é uma feature inteira. Quando existir, ela passa a ser o caminho das mudanças e este ADR deve ser revisto.

## Consequences

- Adicionar, desativar ou corrigir um Provider exige uma migration nova, mesmo para trocar um logo.
- Providers nunca são apagados: saem do monitoramento pela marcação de inativo e mantêm o histórico.
- O deploy roda só `migrate`; migrations são geradas no desenvolvimento e commitadas.
