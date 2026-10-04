import { createHash } from 'node:crypto';

const syntheticSecret = Buffer.alloc(32, 7);
export const bffServiceCredential = `test.${syntheticSecret.toString('base64url')}`;
export const bffServiceVerifierConfiguration = JSON.stringify([
  {
    version: 'test',
    sha256: createHash('sha256').update(syntheticSecret).digest('hex'),
  },
]);

process.env.BFF_SERVICE_CREDENTIAL_VERIFIERS = bffServiceVerifierConfiguration;
