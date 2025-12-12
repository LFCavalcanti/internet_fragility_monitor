import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Environment variable validation
function validateEnv() {
    const dbUrl = process.env.DATABASE_URL;
    const encryptionKey = process.env.DATABASE_ENCRYPTION_KEY;

    if (!dbUrl) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("DATABASE_URL is not set. This is required in production.");
        }
        console.warn("[DB] WARNING: DATABASE_URL not set, using default 'file:sqlite.db'");
    }

    if (!encryptionKey) {
        if (process.env.NODE_ENV === "production") {
            throw new Error("DATABASE_ENCRYPTION_KEY is not set. This is required in production for data security.");
        }
        console.warn("[DB] WARNING: DATABASE_ENCRYPTION_KEY not set, database will NOT be encrypted!");
        console.warn("[DB] Set DATABASE_ENCRYPTION_KEY in .env for production use.");
    }

    return { dbUrl, encryptionKey };
}

// Lazy-loaded database singleton
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

function getDatabase() {
    const { dbUrl, encryptionKey } = validateEnv();
    
    // Only use encryption in production - drizzle-kit creates unencrypted DBs
    const isProduction = process.env.NODE_ENV === "production";
    const shouldEncrypt = isProduction && encryptionKey;

    const client = createClient({
        url: dbUrl || "file:sqlite.db",
        ...(shouldEncrypt ? { encryptionKey } : {}),
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
