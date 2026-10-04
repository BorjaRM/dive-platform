import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { BffServiceCredentialVerifier } from './bff-service-credential.js';

const currentSecret = Buffer.from(
  'eb91cb685794381219936dabb43126f74a68579ecdd2493f067ea5e65d4732b7',
  'hex',
);
const replacementSecret = Buffer.from(
  '8376a4d38f54c1a785347290fe196db3e8ac4602be4f379bbc102dac67145099',
  'hex',
);

function verifierConfiguration(version: string, secret: Buffer) {
  return {
    version,
    sha256: createHash('sha256').update(secret).digest('hex'),
  };
}

function createVerifier(
  verifiers = [verifierConfiguration('current', currentSecret)],
) {
  return new BffServiceCredentialVerifier({
    BFF_SERVICE_CREDENTIAL_VERIFIERS: JSON.stringify(verifiers),
  });
}

const currentCredential = `current.${currentSecret.toString('base64url')}`;
const replacementCredential = `replacement.${replacementSecret.toString('base64url')}`;

describe('DIVE-IAM-REQ-032 BFF service credential verification', () => {
  it('authenticates an explicitly configured version and secret', () => {
    expect(createVerifier().authenticate(currentCredential)).toBe(true);
  });

  it.each([
    undefined,
    '',
    'current',
    currentSecret.toString('base64url'),
    `current.${replacementSecret.toString('base64url')}`,
    `unknown.${currentSecret.toString('base64url')}`,
    `${currentCredential}=`,
    ` ${currentCredential}`,
    `${currentCredential}\n`,
    `${currentCredential},${currentCredential}`,
    [currentCredential],
    [currentCredential, currentCredential],
    `current.${Buffer.alloc(31).toString('base64url')}`,
    `current.${Buffer.alloc(33).toString('base64url')}`,
  ])('rejects missing, invalid or ambiguous credential %#', (header) => {
    expect(createVerifier().authenticate(header)).toBe(false);
  });

  it('rejects a noncanonical base64url encoding of the same bytes', () => {
    const secret = Buffer.alloc(32);
    const canonical = secret.toString('base64url');
    const noncanonical = `${canonical.slice(0, -1)}B`;
    expect(Buffer.from(noncanonical, 'base64url')).toEqual(secret);
    const verifier = createVerifier([verifierConfiguration('current', secret)]);
    expect(verifier.authenticate(`current.${noncanonical}`)).toBe(false);
  });

  it('accepts both versions during a configured planned rotation', () => {
    const verifier = createVerifier([
      verifierConfiguration('current', currentSecret),
      verifierConfiguration('replacement', replacementSecret),
    ]);
    expect(verifier.authenticate(currentCredential)).toBe(true);
    expect(verifier.authenticate(replacementCredential)).toBe(true);
  });

  it('rejects a retired version after removal, including a stale BFF', () => {
    const verifier = createVerifier([
      verifierConfiguration('replacement', replacementSecret),
    ]);
    expect(verifier.authenticate(currentCredential)).toBe(false);
    expect(verifier.authenticate(replacementCredential)).toBe(true);
  });

  it('rejects another environment secret even when its version is identical', () => {
    const verifier = createVerifier([
      verifierConfiguration('current', replacementSecret),
    ]);
    expect(verifier.authenticate(currentCredential)).toBe(false);
  });

  it.each([undefined, '', '  '])(
    'requires explicit configuration %#',
    (value) => {
      expect(
        () =>
          new BffServiceCredentialVerifier({
            BFF_SERVICE_CREDENTIAL_VERIFIERS: value,
          }),
      ).toThrow('Missing BFF_SERVICE_CREDENTIAL_VERIFIERS');
    },
  );

  it.each([
    'not-json',
    'null',
    '{}',
    '[]',
    '[null]',
    '[[]]',
    JSON.stringify([{ version: 'current' }]),
    JSON.stringify([
      {
        ...verifierConfiguration('current', currentSecret),
        secret: currentCredential,
      },
    ]),
    JSON.stringify([verifierConfiguration('', currentSecret)]),
    JSON.stringify([verifierConfiguration('current\n', currentSecret)]),
    JSON.stringify([verifierConfiguration('current.other', currentSecret)]),
    JSON.stringify([{ version: 'current', sha256: 'ff' }]),
    JSON.stringify([{ version: 'current', sha256: 'G'.repeat(64) }]),
    JSON.stringify([
      verifierConfiguration('current', currentSecret),
      verifierConfiguration('current', replacementSecret),
    ]),
  ])(
    'rejects malformed configuration without exposing it %#',
    (configuration) => {
      expect(
        () =>
          new BffServiceCredentialVerifier({
            BFF_SERVICE_CREDENTIAL_VERIFIERS: configuration,
          }),
      ).toThrow(/^Invalid BFF_SERVICE_CREDENTIAL_VERIFIERS$/);
    },
  );
});
