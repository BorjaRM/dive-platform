import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { PublicBookingCapabilityCrypto } from './public-booking.crypto.js';
import { PublicBookingService } from './public-booking.service.js';

describe('PublicBookingService transaction lifecycle', () => {
  it('discards the client and preserves the original error when rollback fails', async () => {
    const originalError = new Error('channel resolution failed');
    const query = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'ROLLBACK') throw new Error('rollback failed');
      throw originalError;
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const capabilities = {} as PublicBookingCapabilityCrypto;
    const service = new PublicBookingService(pool, capabilities);

    await expect(
      service.create('hosted-a', 'https://a.example.test', 'request-1', {
        slotId: 'aaaaaaaa-1001-4001-8001-000000000011',
        seats: 1,
        locale: 'es',
        booker: {
          firstName: 'Ana',
          lastName: 'Buceadora',
          email: 'ana@example.test',
        },
      }),
    ).rejects.toBe(originalError);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(true);
  });

  it('commits a successful origin lookup before releasing the client', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('resolve_public_channel')) {
        return {
          rows: [
            {
              resolved: {
                tenantId: '11111111-1111-1111-1111-111111111111',
                channelId: 'aaaaaaaa-1001-4001-8001-000000000041',
                centerId: 'aaaaaaaa-0001-4001-8001-000000000001',
                activityId: 'aaaaaaaa-1001-4001-8001-000000000001',
                allowedOrigins: ['https://a.example.test'],
                confirmationMode: 'immediate',
              },
            },
          ],
        };
      }
      return { rows: [] };
    });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    const pool = {
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool;
    const service = new PublicBookingService(
      pool,
      {} as PublicBookingCapabilityCrypto,
    );

    await expect(
      service.isOriginAllowed('hosted-a', 'https://a.example.test'),
    ).resolves.toBe(true);
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith();
  });
});
