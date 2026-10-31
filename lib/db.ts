import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type Database = LibSQLDatabase<typeof schema>;

function openDatabase(): Database {
    const url = process.env.DATABASE_URL;

    if (!url) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("DATABASE_URL is not set");
        }
        console.warn("[DB] WARNING: DATABASE_URL is not set. Using default 'file:sqlite.db'");
    }

    // A URL não vai para o log: pode carregar credencial.
    console.log("[DB] Initializing database...");

    return drizzle(createClient({ url: url || "file:sqlite.db" }), { schema });
}

/** A instrumentação e as páginas podem carregar cópias separadas deste módulo; o processo guarda uma conexão só. */
const processWide = globalThis as typeof globalThis & { ifmDatabase?: Database };

/** A conexão única da aplicação, aberta no primeiro uso. Só a borda (inicialização e páginas) chama esta função. */
export function getDb(): Database {
    return (processWide.ifmDatabase ??= openDatabase());
}
