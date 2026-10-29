# 07: Catálogo no banco

**Spec:** `spec-provider-catalog.md` · **Trilha:** T3 – Catálogo e Status Feed, (esquema)

**What to build:** O Provider Catalog passa a morar no banco (ADR 0001). As tabelas de Providers e de Provider Sources são criadas, e uma migration de dados carrega os 13 Providers com seus Feeds e Probes, conforme a tabela da spec, preservando os ids atuais. A página lista os Providers ativos do catálogo, na ordem de exibição, e os Major Providers vêm do banco. O Poll para de sobrescrever o catálogo. O deploy só aplica migrations, e o script quebrado de logos é apagado.

**Blocked by:** 04 e 06 (por recurso: leitura do Snapshot, página e módulo de Internet Health).

**Status:** ready-for-agent

- [ ] Migration de esquema das tabelas de Providers e Provider Sources e migration de dados com a carga da spec
- [ ] Num banco com os 13 Providers no formato antigo e um Incident ligado, a migration preserva ids e Incident
- [ ] A página lê o catálogo; a lista de metadados no código e a função que sobrescrevia o banco a cada Poll são removidas
- [ ] A constante de Major Providers do módulo de Internet Health é trocada pela marcação do catálogo
- [ ] Um Provider inativo some da página
- [ ] O build de produção roda só a aplicação de migrations; o script de logos é apagado
- [ ] Teste: migration de carga aplicada num SQLite em memória confere os 13 Providers, as fontes, os quatro Major Providers, a ordem e os Feeds inativos de Salesforce e IBM
- [ ] Migrations geradas no worktree e listadas nos Comments
