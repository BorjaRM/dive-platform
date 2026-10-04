import { describe, expect, it } from 'vitest';
import { canonicalInvitationAddress } from './iam-membership-commands.js';

describe('canonicalInvitationAddress (DIVE-IAM-REQ-017)', () => {
  it('normalizes Unicode whitespace, compatibility characters, local case and IDNA domains', () => {
    expect(canonicalInvitationAddress('\u2003Ｆoo@Bücher.Example\u00a0')).toBe(
      'foo@xn--bcher-kva.example',
    );
  });

  it('does not apply provider-specific local-part aliases', () => {
    expect(canonicalInvitationAddress('Foo+tag@example.test')).toBe(
      'foo+tag@example.test',
    );
    expect(canonicalInvitationAddress('Foo.Bar@example.test')).toBe(
      'foo.bar@example.test',
    );
  });

  it.each(['', 'missing-at', '@example.test', 'person@', 'a@b@example.test'])(
    'rejects invalid address %j',
    (value) => {
      expect(() => canonicalInvitationAddress(value)).toThrow(
        'Invalid invitation address',
      );
    },
  );
});
