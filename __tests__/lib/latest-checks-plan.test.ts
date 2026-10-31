// @vitest-environment node
/**
 * Plano da consulta da última leitura no banco real das migrations (spec-post-cycle-cleanup.md): o SQLite é quem diz
 * como vai executar a consulta. Com 90 dias de leituras, varrer `status_checks` custaria segundos a cada página.
 */
import { describe, it, expect } from "vitest";
import { createMigratedDb } from "../helpers/migrated-db";
import { latestChecks } from "@/lib/poll-recording";

/** Os passos que o SQLite planeja para a consulta, na voz dele: `SCAN ...` percorre a tabela, `SEARCH ...` vai pelo índice. */
async function planOfLatestChecks(): Promise<string[]> {
    const { client, db } = await createMigratedDb();
    const { sql, params } = latestChecks(db).toSQL();
    const { rows } = await client.execute({
        sql: `EXPLAIN QUERY PLAN ${sql}`,
        args: params as (string | number)[],
    });
    return rows.map(row => String(row.detail));
}

describe("plano da consulta da última leitura", () => {
    it("não varre as leituras: nem a tabela de fora, nem a subconsulta das duas mais novas", async () => {
        const plan = await planOfLatestChecks();

        expect(plan.filter(step => /^SCAN (status_checks|recent)\b/.test(step))).toEqual([]);
    });

    it("usa o índice por Provider e hora para achar as duas leituras mais novas", async () => {
        const plan = await planOfLatestChecks();

        expect(plan).toEqual(expect.arrayContaining([
            expect.stringMatching(/^SEARCH recent USING (COVERING )?INDEX status_checks_provider_checked_at\b/),
        ]));
    });
});
