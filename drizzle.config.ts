import type { Config } from "drizzle-kit";

export default {
    schema: "./lib/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: process.env.DATABASE_URL || "file:sqlite.db",
    },
} satisfies Config;
