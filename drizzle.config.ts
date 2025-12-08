import type { Config } from "drizzle-kit";

export default {
    schema: "./lib/schema.ts",
    out: "./drizzle",
    dialect: "sqlite",
    dbCredentials: {
        url: "sqlite.db",
    },
} satisfies Config;
