# 16: Retenção e limpeza do esquema

**Spec:** `spec-poll-recording.md` · **Trilha:** T4 – Persistência, (esquema)

**What to build:** Ao gravar um Poll, as leituras com mais de 90 dias são apagadas; Incidents nunca são apagados. As colunas de tempo de resposta e de severidade, que não são mais usadas, saem do esquema.

**Blocked by:** 15 (por recurso: esquema e módulo de Poll Recording).

**Status:** done

- [x] A gravação do Poll apaga leituras com mais de 90 dias
- [x] Incidents não são apagados
- [x] Colunas de tempo de resposta e de severidade removidas
- [x] Teste: leitura de 91 dias apagada e de 89 mantida
- [x] Migration gerada no worktree (em dois passos se o drizzle-kit pedir renomeação) e listada nos Comments

## Comments

**O que mudou.** `recordPoll` apaga as leituras vencidas no fim da mesma transação do Poll (`deleteExpiredReadings`, em `lib/poll-recording.ts`). O limite é `READING_RETENTION_MS`, em um lugar só, medido de `at`, nunca do relógio do sistema. Um erro ao apagar desfaz o Poll inteiro, e um Poll que falha ou é descartado não apaga nada. Incidents não são tocados. `response_time` e `severity` saíram de `lib/schema.ts`; o `severity` de `lib/status-feed/readers/salesforce.ts` é campo do Feed e fica.

**Limite.** "Mais de 90 dias" é estrito: a leitura de exatamente 90 dias fica, e a de 90 dias e um segundo sai. A coluna guarda segundos, e os dois lados da comparação são arredondados do mesmo jeito.

**As duas leituras mais novas de cada Provider ficam, com qualquer idade.** É a única exceção à spec, e existe para a regra de Down não mudar. O Poll anterior é a leitura gravada antes da última, sem olhar a hora (Comments do 15). Sem a exceção, um monitor parado por mais de 90 dias perderia o Poll anterior no primeiro Poll de volta: calado, intervalo, calado daria Unreachable em vez de Down só por causa da retenção. No Poll seguinte, a leitura antiga deixa de ser o Poll anterior e sai. O volume continua limitado: 90 dias mais uma leitura por Provider ativo, e duas por Provider inativo. A spec não prevê a exceção; a decisão de mantê-la é do usuário (`ISSUES_ANNOTATION.md`, 1.1).

**Provider inativo.** Segue a mesma regra, sem filtro de ativo: as leituras antigas saem e ficam as duas mais novas. A spec não abre exceção, e o histórico que o glossário e o ADR 0001 mandam manter é lido aqui como o registro em Incidents, que nunca saem, mais as leituras dentro da retenção; nenhum dos dois define o termo. As duas que ficam fazem um Provider reativado meses depois decidir Down como antes (Comments do 15, "Provider reativado").

**Índice.** Não há índice novo. `status_checks_provider_checked_at` não serve para `checked_at` sozinho, porque `provider_id` vem primeiro, mas o `DELETE` passa a lista de Providers (`provider_id IN (SELECT id FROM providers)`) e o SQLite busca um intervalo por Provider: `SEARCH status_checks USING COVERING INDEX status_checks_provider_checked_at (provider_id=? AND checked_at<?)`. As chaves estrangeiras garantem que toda leitura tem Provider na lista. Um índice só de `checked_at` custaria escrita e espaço a cada Poll para ganhar nada: nas 337 mil linhas do regime normal, o `recordPoll` inteiro levou 34 ms, enquanto só a varredura por `checked_at` leva 126 ms.

**Primeiro Poll depois do deploy (medido).** Banco em arquivo, com um ano de leituras (1.366.560 linhas, 86 MB), a mesma versão do `libsql` e o `readSnapshot` em laço no mesmo processo, como a produção:

| Passo | Resultado |
| --- | --- |
| Migration `0008` | 3,1 s |
| Primeiro Poll (apaga 1.029.600 linhas) | 8,3 s |
| Poll seguinte | 34 ms |
| Erros de leitura | nenhum |

O cliente `libsql` é síncrono: enquanto o `DELETE` roda, o processo inteiro fica parado, e a página espera, sem erro e sem ver Poll pela metade. Esses 8 s valem uma vez, proporcionais ao que há para apagar. Foi aceito: dividir o `DELETE` em vários Polls complicaria a retenção para evitar uma pausa única, e nada se perde se ela cair numa visita. O `DELETE` não encolhe o arquivo: as páginas livres são reaproveitadas, e o arquivo para de crescer nos mesmos 86 MB. Só um `VACUUM` manual o reduziria, e isso fica a critério do dono do monitor.

**Migration.** `drizzle/0008_remove_response_time_severity.sql`, gerada pelo `drizzle-kit`, sem pergunta de renomeação. São dois `ALTER TABLE ... DROP COLUMN`: a tabela não é recriada. `__tests__/lib/schema-cleanup-migration.test.ts` parte de um banco na `0007` com linhas de verdade e confere valores, ids, os dois índices, a unicidade, as chaves estrangeiras e os padrões.

**Para o operador.** É a primeira migration que tira colunas. O Drizzle cita todas as colunas nas consultas, então o processo antigo quebra assim que ela é aplicada: a leitura de `incidents` pede `severity`, e a gravação de `status_checks` pede `response_time`. Como `build:prod` roda a migration antes do `next build`, o servidor antigo precisa ser parado antes do build, ou a página e os Polls falham até o novo subir (`ISSUES_ANNOTATION.md`, 2.1).

**Testes.** Novos: bloco "retenção" em `poll-recording.test.ts`, "um Poll descartado não apaga leituras" em `poll-catalog.test.ts` e `schema-cleanup-migration.test.ts`. Os dois testes que liam `response_time` como nulo passaram a conferir a lista exata de colunas de `status_checks`, o que é mais forte: `SELECT` da coluna removida falharia, e uma coluna nova também apareceria.

**Mudanças visíveis.** Nenhuma na página, além da pausa única do primeiro Poll.
