import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Environment variable validation
function validateEnv() {
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error("DATABASE_URL is not set");
        }
        console.warn("[DB] WARNING: DATABASE_URL is not set. Using default 'file:sqlite.db'");
    }

    return { dbUrl };
}

// Lazy-loaded database singleton
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDatabase() {
    const { dbUrl } = validateEnv();
    
    // Only use encryption in production - drizzle-kit creates unencrypted DBs
    const isProduction = process.env.NODE_ENV === "production";

    console.log("[DB] Initializing database...");
    console.log("[DB] CWD:", process.cwd());
    console.log("[DB] URL:", dbUrl || "file:sqlite.db");
    console.log("[DB] Production Mode:", isProduction);

    const client = createClient({
        url: dbUrl || "file:sqlite.db",
    });

    return drizzle(client, { schema });
}

/**
 * Get the database instance (lazy initialization)
 * Use this function when you need explicit control over initialization
 */
export function getDb() {
    if (!_db) {
        _db = getDatabase();
    }
    return _db;
}

/**
 * Backward compatible export for existing code
 * Will be deprecated in favor of DAO layer
 * @deprecated Use dao functions from './dao' instead
 */
export const db = getDb();
