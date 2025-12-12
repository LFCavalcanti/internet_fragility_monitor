import { describe, it, expect } from 'vitest';
import {
    idSchema,
    urlSchema,
    providerSchema,
    statusValueSchema,
    newStatusCheckSchema,
    incidentSchema,
    incidentStatusSchema,
    validate,
    safeValidate,
} from '@/lib/validation';

describe('Validation Schemas', () => {
    describe('idSchema', () => {
        it('accepts valid non-empty string IDs', () => {
            expect(() => validate(idSchema, 'abc-123')).not.toThrow();
            expect(() => validate(idSchema, 'cloudflare')).not.toThrow();
            expect(() => validate(idSchema, 'a'.repeat(255))).not.toThrow();
        });

        it('rejects empty strings', () => {
            expect(() => validate(idSchema, '')).toThrow('ID is required');
        });

        it('rejects strings exceeding max length', () => {
            expect(() => validate(idSchema, 'a'.repeat(256))).toThrow('exceeds maximum length');
        });

        it('trims whitespace', () => {
            const result = validate(idSchema, '  test  ');
            expect(result).toBe('test');
        });
    });

    describe('urlSchema', () => {
        it('accepts valid URLs', () => {
            expect(() => validate(urlSchema, 'https://example.com')).not.toThrow();
            expect(() => validate(urlSchema, 'http://localhost:3000')).not.toThrow();
        });

        it('accepts empty string', () => {
            expect(() => validate(urlSchema, '')).not.toThrow();
        });

        it('rejects invalid URLs', () => {
            expect(() => validate(urlSchema, 'not-a-url')).toThrow();
        });
    });

    describe('statusValueSchema', () => {
        it('accepts valid status values', () => {
            expect(() => validate(statusValueSchema, 'operational')).not.toThrow();
            expect(() => validate(statusValueSchema, 'degraded')).not.toThrow();
            expect(() => validate(statusValueSchema, 'outage')).not.toThrow();
            expect(() => validate(statusValueSchema, 'unknown')).not.toThrow();
        });

        it('rejects invalid status values', () => {
            expect(() => validate(statusValueSchema, 'invalid')).toThrow();
            expect(() => validate(statusValueSchema, 'OPERATIONAL')).toThrow();
        });
    });

    describe('incidentStatusSchema', () => {
        it('accepts valid incident statuses', () => {
            expect(() => validate(incidentStatusSchema, 'investigating')).not.toThrow();
            expect(() => validate(incidentStatusSchema, 'identified')).not.toThrow();
            expect(() => validate(incidentStatusSchema, 'monitoring')).not.toThrow();
            expect(() => validate(incidentStatusSchema, 'resolved')).not.toThrow();
            expect(() => validate(incidentStatusSchema, 'maintenance')).not.toThrow();
            expect(() => validate(incidentStatusSchema, 'scheduled')).not.toThrow();
        });
    });

    describe('providerSchema', () => {
        const validProvider = {
            id: 'cloudflare',
            name: 'Cloudflare',
            url: 'https://www.cloudflarestatus.com',
            type: 'cdn',
            logo: '/logos/cloudflare.svg',
        };

        it('accepts valid provider data', () => {
            expect(() => validate(providerSchema, validProvider)).not.toThrow();
        });

        it('rejects missing required fields', () => {
            expect(() => validate(providerSchema, { ...validProvider, id: '' })).toThrow('ID is required');
            expect(() => validate(providerSchema, { ...validProvider, name: '' })).toThrow('Name is required');
            expect(() => validate(providerSchema, { ...validProvider, url: '' })).toThrow('URL is required');
            expect(() => validate(providerSchema, { ...validProvider, type: '' })).toThrow('Type is required');
        });

        it('accepts null/undefined logo', () => {
            expect(() => validate(providerSchema, { ...validProvider, logo: null })).not.toThrow();
            expect(() => validate(providerSchema, { ...validProvider, logo: undefined })).not.toThrow();
        });
    });

    describe('newStatusCheckSchema', () => {
        const validStatusCheck = {
            providerId: 'aws',
            status: 'operational' as const,
            responseTime: 150,
            checkedAt: new Date(),
        };

        it('accepts valid status check data', () => {
            expect(() => validate(newStatusCheckSchema, validStatusCheck)).not.toThrow();
        });

        it('accepts minimal required fields', () => {
            expect(() => validate(newStatusCheckSchema, {
                providerId: 'aws',
                status: 'operational',
            })).not.toThrow();
        });

        it('rejects negative response times', () => {
            expect(() => validate(newStatusCheckSchema, {
                ...validStatusCheck,
                responseTime: -100,
            })).toThrow();
        });
    });

    describe('incidentSchema', () => {
        const validIncident = {
            id: 'inc-001',
            providerId: 'aws',
            title: 'Service Degradation',
            description: 'Some regions experiencing latency',
            status: 'investigating',
            severity: 'minor',
            url: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            resolvedAt: null,
        };

        it('accepts valid incident data', () => {
            expect(() => validate(incidentSchema, validIncident)).not.toThrow();
        });

        it('rejects missing required fields', () => {
            expect(() => validate(incidentSchema, { ...validIncident, id: '' })).toThrow('ID is required');
            expect(() => validate(incidentSchema, { ...validIncident, providerId: '' })).toThrow('ID is required');
            expect(() => validate(incidentSchema, { ...validIncident, title: '' })).toThrow('Title is required');
            expect(() => validate(incidentSchema, { ...validIncident, status: '' })).toThrow('Status is required');
        });

        it('rejects title exceeding max length', () => {
            expect(() => validate(incidentSchema, {
                ...validIncident,
                title: 'a'.repeat(501),
            })).toThrow('exceeds maximum length');
        });

        it('rejects description exceeding max length', () => {
            expect(() => validate(incidentSchema, {
                ...validIncident,
                description: 'a'.repeat(5001),
            })).toThrow('exceeds maximum length');
        });
    });
});

describe('Validation Helper Functions', () => {
    describe('validate', () => {
        it('returns parsed data on success', () => {
            const result = validate(idSchema, '  test-id  ');
            expect(result).toBe('test-id');
        });

        it('throws with context in error message', () => {
            expect(() => validate(idSchema, '', 'getProviderById')).toThrow('[getProviderById]');
        });
    });

    describe('safeValidate', () => {
        it('returns success result with data', () => {
            const result = safeValidate(idSchema, 'test-id');
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toBe('test-id');
            }
        });

        it('returns failure result with errors', () => {
            const result = safeValidate(idSchema, '');
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.errors).toBeDefined();
            }
        });
    });
});
