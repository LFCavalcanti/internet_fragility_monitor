# 13: Módulo de Poll Recording contra SQLite real

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência

**What to build:** A gravação de um Poll e a leitura do Snapshot passam a viver num módulo só, que absorve as camadas de acesso, validação e reconciliação. O banco é recebido pelo módulo em vez de aberto no import, a gravação de um Poll é uma transação e a leitura do Snapshot usa um número fixo de consultas. O comportamento visível não muda; os testes passam a rodar contra um SQLite real em memória.

**Blocked by:** 12.

**Status:** ready-for-agent

- [ ] Um módulo com as operações gravar um Poll e ler o Snapshot; camada de acesso, validação e reconciliação absorvidas
- [ ] O banco é criado uma vez na inicialização e passado ao módulo; o log não imprime a URL do banco
- [ ] A gravação de um Poll é uma transação: falha no meio não deixa nada gravado
- [ ] A leitura do Snapshot usa número fixo de consultas
- [ ] Status gravados validados contra o vocabulário do domínio
- [ ] A diretiva de server action sai dos módulos que só rodam no servidor; funções sem uso em produção são apagadas
- [ ] Testes com SQLite em memória e migrations reais; os testes com mock da camada de acesso, da reconciliação e da conexão, o teste de exemplo do setup e as partes de validação sem uso são apagados
