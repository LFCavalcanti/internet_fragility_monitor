/**
 * Tests for lib/db.ts - Database initialization and environment validation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Save original env
const originalEnv = { ...process.env };

describe('db.ts', () => {
    beforeEach(() => {
        // Reset env before each test
        vi.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('Environment Validation', () => {
        it('should warn when DATABASE_URL is not set in development', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.NODE_ENV = 'development';
            delete process.env.DATABASE_URL;
            delete process.env.DATABASE_ENCRYPTION_KEY;

            // Dynamic import to get fresh module
            await import('@/lib/db');

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('DATABASE_URL not set')
            );
            warnSpy.mockRestore();
        });

        it('should warn when DATABASE_ENCRYPTION_KEY is not set in development', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.NODE_ENV = 'development';
            process.env.DATABASE_URL = 'file:test.db';
            delete process.env.DATABASE_ENCRYPTION_KEY;

            await import('@/lib/db');

            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('DATABASE_ENCRYPTION_KEY not set')
            );
            warnSpy.mockRestore();
        });

        it('should throw error when DATABASE_URL is not set in production', async () => {
            process.env.NODE_ENV = 'production';
            delete process.env.DATABASE_URL;

            await expect(async () => {
                await import('@/lib/db');
            }).rejects.toThrow('DATABASE_URL is not set');
        });

        it('should throw error when DATABASE_ENCRYPTION_KEY is not set in production', async () => {
            process.env.NODE_ENV = 'production';
            process.env.DATABASE_URL = 'file:test.db';
            delete process.env.DATABASE_ENCRYPTION_KEY;

            await expect(async () => {
                await import('@/lib/db');
            }).rejects.toThrow('DATABASE_ENCRYPTION_KEY is not set');
        });
    });

    describe('getDb', () => {
        it('should return a database instance', async () => {
            process.env.NODE_ENV = 'test';
            process.env.DATABASE_URL = 'file:test.db';
            
            // Suppress warnings for test
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const { getDb } = await import('@/lib/db');
            const db = getDb();
            
            expect(db).toBeDefined();
            expect(db).toHaveProperty('select');
            expect(db).toHaveProperty('insert');
            expect(db).toHaveProperty('update');
            expect(db).toHaveProperty('delete');
        });

        it('should return the same instance on multiple calls (singleton)', async () => {
            process.env.NODE_ENV = 'test';
            process.env.DATABASE_URL = 'file:test.db';
            
            vi.spyOn(console, 'warn').mockImplementation(() => {});
            
            const { getDb } = await import('@/lib/db');
            const db1 = getDb();
            const db2 = getDb();
            
            expect(db1).toBe(db2);
        });
    });
});
