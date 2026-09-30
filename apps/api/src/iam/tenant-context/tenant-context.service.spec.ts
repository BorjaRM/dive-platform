import {
  authenticateIdentity,
  type IdentityProviderPort,
} from '@dive-center/identity';
import { describe, expect, it, vi } from 'vitest';
import { TenantContextCrypto } from '../../common/tenant-context/tenant-context.crypto.js';
import { TenantContextService } from './tenant-context.service.js';

const tenantId = '11111111-1111-1111-1111-111111111111';
const centerId = 'aaaaaaaa-0001-0001-0001-000000000001';
const principalProvider: IdentityProviderPort = {
  authenticate: async () => ({
    issuer: 'test',
    subject: 'owner',
    sessionId: 'session',
    verifiedAddresses: [],
    assurance: { level: 'single_factor', verifiedAt: null },
  }),
};
const principal = () => authenticateIdentity(principalProvider, 'token');

function serviceWithAccess(
  roles = ['tenant_owner'],
  centerIds: string[] | null = null,
  baseOrigin = 'https://app.dive-platform.com',
) {
  const query = vi.fn(async (statement: string) => {
    if (statement === 'BEGIN' || statement === 'COMMIT') return { rows: [] };
    if (statement.includes('resolve_center_entry_command')) {
      return { rows: [{ entry: { tenantId, centerId } }] };
    }
    if (statement.includes('resolve_access')) {
      return {
        rows: [
          {
            access: {
              identityId: 'a1111111-1111-1111-1111-111111111111',
              membershipId: 'b1111111-1111-1111-1111-111111111111',
              tenantId,
              roles,
              centerIds,
            },
          },
        ],
      };
    }
    if (statement.includes('issue_tenant_context_command')) {
      return { rows: [{ outcome: { tenantId, issuedAt: '2026-09-29' } }] };
    }
    throw new Error(`Unexpected query: ${statement}`);
  });
  const client = { query, release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client), query };
  const logger = { warn: vi.fn() };
  return {
    client,
    logger,
    service: new TenantContextService(
      pool as never,
      logger,
      new TenantContextCrypto('t'.repeat(32)),
      new URL(baseOrigin).hostname,
      baseOrigin,
    ),
  };
}

describe('TenantContextService center entry (DIVE-IAM-REQ-032)', () => {
  it.each(['test-center', 'ocean-north'])(
    'uses the existing permission boundary for local center %s',
    async (centerKey) => {
      const { client, service } = serviceWithAccess(
        ['tenant_owner'],
        null,
        'http://app.localhost:3000',
      );
      const origin = `http://${centerKey}.app.localhost:3000`;
      await expect(service.isCenterOriginAllowed(origin)).resolves.toBe(true);
      await expect(
        service.issueCenterEntryContext(
          await principal(),
          origin,
          { centerRef: centerKey },
          'correlation',
        ),
      ).resolves.toMatchObject({ center: { centerId } });
      expect(client.query).toHaveBeenCalledWith('COMMIT');
      await expect(
        service.isCenterOriginAllowed(`http://${centerKey}.app.localhost:4000`),
      ).resolves.toBe(false);
    },
  );

  it('denies local entry when membership scope belongs to another center', async () => {
    const { client, service } = serviceWithAccess(
      ['center_manager'],
      ['bbbbbbbb-0002-0002-0002-000000000001'],
      'http://app.localhost:3000',
    );
    await expect(
      service.issueCenterEntryContext(
        await principal(),
        'http://test-center.app.localhost:3000',
        { centerRef: 'test-center' },
        'correlation',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('does not authorize local CORS without an active database mapping', async () => {
    const { client, service } = serviceWithAccess(
      ['tenant_owner'],
      null,
      'http://app.localhost:3000',
    );
    client.query.mockImplementationOnce(async () => ({ rows: [] }));
    await expect(
      service.isCenterOriginAllowed('http://test-center.app.localhost:3000'),
    ).resolves.toBe(false);
  });

  it('issues the tenant handle only after exact origin, mapping, permission, and scope agree', async () => {
    const { client, service } = serviceWithAccess();

    await expect(
      service.issueCenterEntryContext(
        await principal(),
        'https://costa-norte.app.dive-platform.com',
        { centerRef: 'costa-norte' },
        'correlation',
      ),
    ).resolves.toMatchObject({ center: { centerId } });
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    [undefined, { centerRef: 'costa-norte' }],
    ['https://costa-norte.app.dive-platform.com', { centerRef: 'other' }],
    [
      'https://costa-norte.app.dive-platform.com',
      { centerRef: 'costa-norte', tenantId },
    ],
  ])(
    'denies malformed or contradictory selectors without opening a transaction',
    async (origin, input) => {
      const { logger, service } = serviceWithAccess();

      await expect(
        service.issueCenterEntryContext(
          await principal(),
          origin,
          input,
          'correlation',
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'membership_missing_or_inactive' }),
      );
    },
  );

  it('denies a membership outside the mapped center scope and rolls back', async () => {
    const { client, logger, service } = serviceWithAccess(
      ['center_manager'],
      ['bbbbbbbb-0002-0002-0002-000000000001'],
    );

    await expect(
      service.issueCenterEntryContext(
        await principal(),
        'https://costa-norte.app.dive-platform.com',
        { centerRef: 'costa-norte' },
        'correlation',
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'scope_mismatch' }),
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('uses the same trusted mapping resolver for dynamic CORS', async () => {
    const { service } = serviceWithAccess();

    await expect(
      service.isCenterOriginAllowed(
        'https://costa-norte.app.dive-platform.com',
      ),
    ).resolves.toBe(true);
    await expect(
      service.isCenterOriginAllowed(
        'https://costa-norte.app.dive-platform.com.evil.test',
      ),
    ).resolves.toBe(false);
  });
});
