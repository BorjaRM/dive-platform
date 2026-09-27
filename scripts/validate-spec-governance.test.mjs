import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  artifactKind,
  validateAdr,
  validateSpec,
  validateTrace,
} from './validate-spec-governance.mjs';

const fixtureRoot = fileURLToPath(
  new URL('./fixtures/spec-governance/', import.meta.url),
);

function errorsFor(validate, fixture) {
  const errors = [];
  validate(`${fixtureRoot}${fixture}`, errors);
  return errors;
}

describe('spec governance artifact discovery', () => {
  it('classifies SPEC, ADR, and TRACE paths independently', () => {
    assert.equal(artifactKind('specs/booking/SPEC-fixture.md'), 'spec');
    assert.equal(
      artifactKind('specs/architecture/adrs/ADR-fixture.md'),
      'adr',
    );
    assert.equal(
      artifactKind('specs/traceability/TRACE-fixture.md'),
      'trace',
    );
  });
});

describe('spec governance validators', () => {
  it('accepts valid SPEC, ADR, and TRACE fixtures', () => {
    assert.deepEqual(errorsFor(validateSpec, 'valid/SPEC-fixture.md'), []);
    assert.deepEqual(errorsFor(validateAdr, 'valid/ADR-fixture.md'), []);
    assert.deepEqual(errorsFor(validateTrace, 'valid/TRACE-fixture.md'), []);
  });

  it('rejects invalid SPEC, ADR, and TRACE fixtures', () => {
    assert.ok(
      errorsFor(validateSpec, 'invalid/SPEC-fixture.md').some((error) =>
        error.includes('missing Requirement provenance'),
      ),
    );
    assert.ok(
      errorsFor(validateAdr, 'invalid/ADR-fixture.md').some((error) =>
        error.includes('missing Decision or Proposed decision'),
      ),
    );
    assert.ok(
      errorsFor(validateTrace, 'invalid/TRACE-fixture.md').some((error) =>
        error.includes('missing Current coverage'),
      ),
    );
  });
});