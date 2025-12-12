/**
 * Standalone script to update provider logos
 * Run with: node update-logos.mjs
 * 
 * Note: This script uses direct database access since it runs outside Next.js
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { providers } from './lib/schema.js';
import { eq } from 'drizzle-orm';

// Create database connection for standalone script
const client = createClient({
    url: process.env.DATABASE_URL || 'file:sqlite.db',
    encryptionKey: process.env.DATABASE_ENCRYPTION_KEY,
});
const db = drizzle(client);

const updates = [
    { id: 'aws', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg' },
    { id: 'azure', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg' }
];

async function updateLogos() {
    for (const update of updates) {
        await db.update(providers)
            .set({ logo: update.logo })
            .where(eq(providers.id, update.id));
        console.log(`Updated ${update.id} logo`);
    }
    console.log('Done!');
    process.exit(0);
}

updateLogos().catch(console.error);
