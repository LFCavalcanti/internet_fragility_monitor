# 20: Card em inglês, com aviso no card Unreachable

**Spec:** `spec-major-outage.md` · **Trilha:** T8 – Card

**What to build:** O card do Provider fica todo em inglês. Quando o Feed não pode ser lido, os Incidents listados deixam de parecer atuais: o card Unreachable avisa que eles vêm da última leitura e podem estar desatualizados. A Upcoming Maintenance continua escondida nesse card, e a data de um Incident continua sendo a de início.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] "Couldn't read the status page" no card Unreachable
- [x] "No response from the status page or the service" no card Down
- [x] "Access check only, no status feed" na marca de "só acesso"
- [x] "1 of 2 feeds unread" na marca de Partial Reading
- [x] O card Unreachable com Incidents mostra "These Incidents come from the last reading and may be out of date."
- [x] O card Unreachable sem Incidents e um card lido normalmente não mostram esse aviso
- [x] Nenhum texto em português continua no card
- [x] Testes do card atualizados

## Comments

- `components/status-card.tsx`: os quatro textos do card em inglês, e o aviso de última leitura dentro do bloco de Recent Incidents, logo abaixo do título. Sem Incidents o bloco nem existe, então o aviso também não aparece.
- Upcoming Maintenance escondida no Unreachable: nada mudou. Ela só conta Feeds lidos, e `decideProviderStatus` já devolve `null` nesse caso.
- Data do Incident: nada mudou, segue a de início (`createdAt`) em todos os Providers.
- O card Down também lista Incidents da última leitura, mas fica sem o aviso: a spec o define só para o card Unreachable.
- Sem migrations.
