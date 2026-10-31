# 20: Card em inglês, com aviso no card Unreachable

**Spec:** `spec-major-outage.md` · **Trilha:** T8 – Card

**What to build:** O card do Provider fica todo em inglês. Quando o Feed não pode ser lido, os Incidents listados deixam de parecer atuais: o card Unreachable avisa que eles vêm da última leitura e podem estar desatualizados. A Upcoming Maintenance continua escondida nesse card, e a data de um Incident continua sendo a de início.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] "Couldn't read the status page" no card Unreachable
- [ ] "No response from the status page or the service" no card Down
- [ ] "Access check only, no status feed" na marca de "só acesso"
- [ ] "1 of 2 feeds unread" na marca de Partial Reading
- [ ] O card Unreachable com Incidents mostra "These Incidents come from the last reading and may be out of date."
- [ ] O card Unreachable sem Incidents e um card lido normalmente não mostram esse aviso
- [ ] Nenhum texto em português continua no card
- [ ] Testes do card atualizados
