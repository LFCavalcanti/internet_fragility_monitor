# 15: Down de ponta a ponta

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Cada Poll grava, por Provider, se nenhuma fonte respondeu. A leitura do Snapshot informa se o Poll anterior também ficou sem resposta, e o módulo de Provider Status declara Down no segundo Poll seguido. O card mostra Down com a cor mais forte da página e "Sem resposta da status page nem do serviço", e o hero destaca "status page e serviço sem resposta".

**Blocked by:** 14 (por recurso: esquema e módulo de Poll Recording).

**Status:** ready-for-agent

- [ ] A leitura gravada guarda a indicação de que nenhuma fonte respondeu
- [ ] A leitura do Snapshot informa a indicação do Poll anterior
- [ ] Primeiro Poll sem resposta: Unreachable; segundo seguido: Down
- [ ] Card e hero exibem Down com o destaque combinado; Down de Major Provider deixa o hero Critical
- [ ] Testes: dois Polls seguidos sem resposta num SQLite em memória; Poll com resposta entre os dois zera a contagem
- [ ] Migration gerada no worktree e listada nos Comments
