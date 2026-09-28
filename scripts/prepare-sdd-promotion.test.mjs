import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { preparePromotion } from './prepare-sdd-promotion.mjs';

function fixture(openQuestions = 'No blocking product decision remains.') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-promotion-'));
  const previous = process.cwd();
  process.chdir(root);
  for (const dir of [
    'specs/example',
    'specs/architecture/adrs',
    'specs/traceability',
  ])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    'specs/example/SPEC-EXAMPLE-001.md',
    `# SPEC-EXAMPLE-001\n\n- **Status:** Draft\n- **Version:** 0.1\n- **Approved by:** Product owner for Draft review\n- **Approval reference:** draft approval\n\n## Requirement provenance\n\n| Requirement IDs | Provenance | Exact source | Decision status |\n|---|---|---|---|\n| \`EX-REQ-001\` | \`Proposed\` | product decision | Approved for Draft review; no implementation authority |\n\n## Open questions\n\n${openQuestions}\n\nThis artifact remains Draft and does not authorize implementation.\n`,
  );
  fs.writeFileSync(
    'specs/architecture/adrs/ADR-EXAMPLE-001.md',
    `# ADR-EXAMPLE-001\n\n- **Status:** Draft\n- **Version:** 0.1\n\n## Provenance\n\n| Decision | Provenance | Exact source | Approval / status |\n|---|---|---|---|\n| Example | \`Derived\` | SPEC example | Approved derivation for Draft review; no implementation authority |\n\n## Open questions\n\n${openQuestions}\n\nThis Draft PR changes documentation only. It provides no implementation, migration, test, or pilot evidence.\n\n## Implementation authority\n\nNone while Draft.\n`,
  );
  fs.writeFileSync(
    'specs/traceability/TRACE-EXAMPLE-001.md',
    `# TRACE-EXAMPLE-001\n\n- **Status:** Ready to start\n- **Version:** 0.1\n\n| SPEC | \`specs/example/SPEC-EXAMPLE-001.md\` | Draft | 0.1 |\n| ADR | \`specs/architecture/adrs/ADR-EXAMPLE-001.md\` | Draft | 0.1 |\n| This map | \`specs/traceability/TRACE-EXAMPLE-001.md\` | Ready to start | 0.1 |\n\n\`SPEC-DIVE-ONBOARDING-001\` and \`ADR-DIVE-013\` remain Draft. readiness review and explicit status promotion are still required before implementation.\n`,
  );
  return { root, previous };
}

function runPromotion() {
  return preparePromotion({
    specPath: 'specs/example/SPEC-EXAMPLE-001.md',
    adrPath: 'specs/architecture/adrs/ADR-EXAMPLE-001.md',
    tracePath: 'specs/traceability/TRACE-EXAMPLE-001.md',
    approvalReference: 'Product approval 2026-09-28',
    specVersion: '0.2',
    adrVersion: '0.2',
    traceVersion: '0.2',
  });
}

describe('prepare SDD promotion', () => {
  it('promotes Draft artifacts and trace pointers with explicit approval', () => {
    const { root, previous } = fixture();
    try {
      runPromotion();
      const spec = fs.readFileSync('specs/example/SPEC-EXAMPLE-001.md', 'utf8');
      const adr = fs.readFileSync(
        'specs/architecture/adrs/ADR-EXAMPLE-001.md',
        'utf8',
      );
      const trace = fs.readFileSync(
        'specs/traceability/TRACE-EXAMPLE-001.md',
        'utf8',
      );
      assert.match(spec, /\*\*Status:\*\* Ready to start/);
      assert.match(
        spec,
        /Approved for implementation; Product approval 2026-09-28/,
      );
      assert.match(
        adr,
        /reversible implementation with synthetic data is authorized/,
      );
      assert.match(trace, /SPEC-EXAMPLE-001\.md` \| Ready to start \| 0\.2/);
    } finally {
      process.chdir(previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses promotion while blocking questions remain', () => {
    const { root, previous } = fixture('The operational owner is still open.');
    try {
      assert.throws(
        () => runPromotion(),
        /Open questions must explicitly state/,
      );
    } finally {
      process.chdir(previous);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
