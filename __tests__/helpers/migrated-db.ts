/**
 * Banco de teste: SQLite em memória com as migrations reais do repositório (decisão Q33).
 * Nada de mock do Drizzle: o esquema e os dados são os que o deploy aplica.
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "@/lib/schema";

const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../drizzle");

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface MigratedDb {
    client: Client;
    db: TestDb;
    /** Aplica as migrations que ainda faltam, como o deploy faria num banco existente. */
    migrateRest(): Promise<void>;
}

/**
 * Cria o banco em memória e aplica as migrations reais.
 * Com `upTo`, para na migration com essa tag (inclusive), para montar um banco no formato antigo.
 */
export async function createMigratedDb(options: { upTo?: string } = {}): Promise<MigratedDb> {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client, { schema });

    const folder = options.upTo ? partialMigrationsFolder(options.upTo) : MIGRATIONS_FOLDER;
    try {
        await migrate(db, { migrationsFolder: folder });
    } finally {
        if (folder !== MIGRATIONS_FOLDER) fs.rmSync(folder, { recursive: true, force: true });
    }

    return {
        client,
        db,
        migrateRest: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    };
}

/** Cópia temporária da pasta de migrations com o journal cortado na tag pedida. */
function partialMigrationsFolder(upTo: string): string {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"));
    const last = journal.entries.findIndex((e: { tag: string }) => e.tag === upTo);
    if (last < 0) throw new Error(`Migration ${upTo} não existe no journal`);
    const entries = journal.entries.slice(0, last + 1);

    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "ifm-migrations-"));
    fs.mkdirSync(path.join(folder, "meta"));
    fs.writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const { tag } of entries) {
        fs.copyFileSync(path.join(MIGRATIONS_FOLDER, `${tag}.sql`), path.join(folder, `${tag}.sql`));
    }
    return folder;
}
