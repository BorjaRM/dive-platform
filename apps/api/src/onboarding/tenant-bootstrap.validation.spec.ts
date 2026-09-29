import { describe, expect, it } from 'vitest';
import { ApiProblemException } from '../common/http/problem-details.js';
import { TenantBootstrapInputPipe } from './tenant-bootstrap.validation.pipe.js';

describe('tenant bootstrap request validation', () => {
  const pipe = new TenantBootstrapInputPipe();

  it('normalizes the approved setup fields (DIVE-ONB-REQ-020..026, DIVE-ONB-REQ-041)', () => {
    expect(
      pipe.transform({
        operatorDisplayName: '  Oce\u0301ano Azul  ',
        centerDisplayName: '  Costa Norte  ',
        timeZone: ' Europe/Madrid ',
        locale: 'es',
      }),
    ).toEqual({
      operatorDisplayName: 'Océano Azul',
      centerDisplayName: 'Costa Norte',
      timeZone: 'Europe/Madrid',
      locale: 'es',
    });
  });

  it('rejects browser authority and unsupported setup data (DIVE-ONB-REQ-004, DIVE-ONB-REQ-024..026)', () => {
    expect(() =>
      pipe.transform({
        operatorDisplayName: 'Ocean',
        centerDisplayName: 'North',
        timeZone: 'Europe/Madrid',
        locale: 'en',
        tenantId: 'aaaaaaaa-1111-4111-8111-111111111111',
      }),
    ).toThrow(ApiProblemException);
  });

  it('rejects invalid locale, time zone, and display-name bounds', () => {
    expect(() =>
      pipe.transform({
        operatorDisplayName: '',
        centerDisplayName: 'North',
        timeZone: 'Europe/Madrid',
        locale: 'en',
      }),
    ).toThrow(ApiProblemException);
    expect(() =>
      pipe.transform({
        operatorDisplayName: 'Ocean',
        centerDisplayName: 'North',
        timeZone: 'Not/AZone',
        locale: 'en',
      }),
    ).toThrow(ApiProblemException);
    expect(() =>
      pipe.transform({
        operatorDisplayName: 'Ocean',
        centerDisplayName: 'North',
        timeZone: 'Europe/Madrid',
        locale: 'fr',
      }),
    ).toThrow(ApiProblemException);
  });
});
