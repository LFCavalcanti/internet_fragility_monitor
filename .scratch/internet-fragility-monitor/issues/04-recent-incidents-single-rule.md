# 04: Recent Incidents com uma regra só

**Spec:** `spec-provider-status.md` · **Trilha:** T1 – Card e leitores

**What to build:** Um Incident ativo aparece sempre no card, de qualquer idade, e um resolvido aparece por 48 horas. Os cortes de 24 horas nos leitores, de 5 na leitura do Snapshot e de 3 no card deixam de esconder Incidents ativos: os ativos vêm primeiro e os resolvidos completam a lista até 3 itens. O card deixa de chamar o relógio durante a renderização; a página passa a hora do servidor ao módulo.

**Blocked by:** 02 e 03 (03 por recurso: mesmos leitores, card e módulo).

**Status:** ready-for-agent

- [ ] Os leitores do Google Cloud, da AWS e da Azure não cortam mais Incidents em 24 horas
- [ ] A leitura do Snapshot traz os Incidents ativos, os resolvidos dentro de 48 horas e as manutenções agendadas, sem corte por quantidade
- [ ] O módulo decide os Recent Incidents e a ordem; o card só exibe
- [ ] O erro de lint react-hooks/purity do card some
- [ ] Testes do módulo: Incident ativo do Google Cloud com mais de 24 horas aparece; resolvido com 47 horas aparece e com 49 horas não; um sexto Incident ativo não é cortado
- [ ] Os testes de 48 horas e de limite de 3 do card passam para o módulo
