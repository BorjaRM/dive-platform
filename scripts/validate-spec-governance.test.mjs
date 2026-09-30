import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  artifactKind,
  validateAdr,
  validateRequirementOwnership,
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
    assert.equal(artifactKind('specs/architecture/adrs/ADR-fixture.md'), 'adr');
    assert.equal(artifactKind('specs/traceability/TRACE-fixture.md'), 'trace');
  });
});

describe('spec governance validators', () => {
  it('rejects duplicate owners but ignores IDs cited outside Requirements', (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dive-owners-'));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const first = path.join(directory, 'SPEC-first.md');
    const second = path.join(directory, 'SPEC-second.md');
    fs.writeFileSync(
      first,
      '## Requirements\n\n- **DIVE-TEST-REQ-001:** First.\n\n### Derivations\n\n- **DIVE-TEST-REQ-001:** Explain the existing declaration.\n',
    );
    fs.writeFileSync(
      second,
      '## Derivations\n\n- **DIVE-TEST-REQ-001:** Reference.\n\n## Requirements\n\n- **DIVE-TEST-REQ-002:** Second.\n',
    );
    const validErrors = [];
    validateRequirementOwnership([first, second], validErrors);
    assert.deepEqual(validErrors, []);
    fs.appendFileSync(second, '\n- **DIVE-TEST-REQ-001:** Duplicate.\n');
    const duplicateErrors = [];
    validateRequirementOwnership([first, second], duplicateErrors);
    assert.ok(
      duplicateErrors.some((error) => error.includes('duplicate owners')),
    );
    fs.appendFileSync(
      second,
      '\n- **DIVE-TEST-REQ-002:** Same-file duplicate.\n',
    );
    const localErrors = [];
    validateRequirementOwnership([second], localErrors);
    assert.ok(localErrors.some((error) => error.includes('duplicate owners')));
  });

  it('checks TRACE metadata and actual proof without requiring future evidence', (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dive-trace-'));
    context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.mkdirSync(path.join(directory, 'specs'));
    fs.mkdirSync(path.join(directory, 'tests'));
    fs.writeFileSync(
      path.join(directory, 'specs', 'SPEC-target.md'),
      '- **Status:** Draft\n- **Version:** 0.2\n',
    );
    fs.writeFileSync(path.join(directory, 'tests', 'actual.ts'), '');
    const file = path.join(directory, 'TRACE-check.md');
    const valid =
      '# TRACE-check - Fixture\n\n- **Status:** Draft\n- **Version:** 0.1\n- **Purpose:** Test.\n\n## Artifact map\n\n| Artifact | Path | Status | Version |\n|---|---|---|---|\n| Target | `specs/SPEC-target.md` | Draft | 0.2 |\n\n## Maintenance rule\n\nKeep accurate.\n\n## Current coverage\n\n### Demonstrated coverage\n\n| Slice | IDs | Proof |\n|---|---|---|\n| Actual | Test | `tests/actual.ts` |\n\n### Partial or not yet demonstrated\n\nFuture: `tests/future.ts`; `evidence/future/`.\n';
    fs.writeFileSync(file, valid);
    const validErrors = [];
    validateTrace(file, validErrors, directory);
    assert.deepEqual(validErrors, []);
    fs.writeFileSync(
      file,
      valid
        .replace('| Draft | 0.2 |', '| Ready to start | 0.1 |')
        .replace('`tests/actual.ts`', '`tests/missing.ts`'),
    );
    const invalidErrors = [];
    validateTrace(file, invalidErrors, directory);
    assert.ok(invalidErrors.some((error) => error.includes('Status is')));
    assert.ok(invalidErrors.some((error) => error.includes('Version is')));
    assert.ok(
      invalidErrors.some((error) =>
        error.includes('demonstrated proof references missing'),
      ),
    );
    fs.writeFileSync(file, valid.replace('| Target |', '\n| Target |'));
    const interruptedErrors = [];
    validateTrace(file, interruptedErrors, directory);
    assert.ok(
      interruptedErrors.some((error) => error.includes('table is interrupted')),
    );
    fs.writeFileSync(
      file,
      valid.replace('specs/SPEC-target.md', 'specs/SPEC-missing.md'),
    );
    const missingErrors = [];
    validateTrace(file, missingErrors, directory);
    assert.ok(
      missingErrors.some((error) =>
        error.includes('artifact map references missing'),
      ),
    );
  });

  it('accepts completed repository SPEC and ADR templates', () => {
    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'dive-spec-templates-'),
    );
    try {
      for (const [kind, validate] of [
        ['spec', validateSpec],
        ['adr', validateAdr],
      ]) {
        const template = fs.readFileSync(
          new URL(`../specs/templates/${kind}-template.md`, import.meta.url),
          'utf8',
        );
        const completed = template
          .replaceAll('<ID>', 'template-check')
          .replaceAll('<Title>', 'Template check')
          .replaceAll('<DOMAIN>', 'DIVE-TEST')
          .replaceAll(
            '<verifiable behavior>',
            'The documented behavior is testable',
          )
          .replaceAll(
            '<exact URL and section>',
            'specs/foundation/sdd-specs-traceability.md',
          )
          .replace(
            'Draft | Ready to start | Review | Accepted | Deferred',
            'Draft',
          )
          .replace(/(^- (?:\*\*)?Version:(?:\*\*)?)[ \t]*$/m, '$1 0.1');
        const artifactPath = path.join(
          temporaryDirectory,
          `${kind.toUpperCase()}-template-check.md`,
        );
        fs.writeFileSync(artifactPath, completed);
        const errors = [];
        validate(artifactPath, errors);
        assert.deepEqual(errors, [], kind);
      }
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

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
