const { createClient } = require("@libsql/client");
const fs = require("fs");
const path = require("path");

async function check() {
    const dbPath = path.resolve(process.cwd(), "sqlite.db");
    console.log("Checking DB at:", dbPath);
    console.log("Exists?", fs.existsSync(dbPath));
    console.log("Size:", fs.existsSync(dbPath) ? fs.statSync(dbPath).size : "N/A");

    const client = createClient({
        url: "file:sqlite.db"
    });

    try {
        const res = await client.execute("SELECT name FROM sqlite_master WHERE type='table'");
        console.log("Tables found:", res.rows);
    } catch (e) {
        console.error("Error listing tables:", e);
    }
}

check();
