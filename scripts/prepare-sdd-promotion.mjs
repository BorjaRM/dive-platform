#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TARGET_STATUS = 'Ready to start';

function replaceOnce(text, pattern, replacement, label) {
  const matches = [
    ...text.matchAll(
      new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
      ),
    ),
  ];
  if (matches.length !== 1)
    throw new Error(
      `${label}: expected exactly one match, found ${matches.length}`,
    );
  return text.replace(pattern, replacement);
}

function metadata(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .match(new RegExp(`^- \\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'm'))?.[1]
    ?.trim();
}

function setMetadata(text, name, value) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return replaceOnce(
    text,
    new RegExp(`^- \\*\\*${escaped}:\\*\\*\\s*.+$`, 'm'),
    `- **${name}:** ${value}`,
    name,
  );
}

function approveProvenanceSection(text, heading, approvalReference) {
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) throw new Error(`missing ${heading}`);
  const bodyStart = start + heading.length + 1;
  const next = text.indexOf('\n## ', bodyStart);
  const end = next < 0 ? text.length : next;
  const section = text.slice(bodyStart, end);
  let changed = 0;
  const updated = section
    .split('\n')
    .map((line) => {
      if (
        !line.startsWith('|') ||
        (!line.includes('| `Derived` |') && !line.includes('| `Proposed` |'))
      )
        return line;
      const cells = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      if (cells.length !== 4)
        throw new Error(`${heading}: unsupported provenance row: ${line}`);
      cells[3] = `Approved for implementation; ${approvalReference}`;
      changed += 1;
      return `| ${cells.join(' | ')} |`;
    })
    .join('\n');
  if (!changed)
    throw new Error(`${heading}: no Derived or Proposed rows found`);
  return `${text.slice(0, bodyStart)}${updated}${text.slice(end)}`;
}

function openQuestionsAreClosed(text, file) {
  const section =
    text.match(/## Open questions\s*\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
  if (!/No blocking/i.test(section))
    throw new Error(
      `${file}: Open questions must explicitly state that no blocking decision remains`,
    );
}

function assertPath(file, prefix, pattern) {
  const normalized = file.replaceAll(path.sep, '/');
  if (!normalized.startsWith(prefix) || !pattern.test(normalized))
    throw new Error(`unsupported path: ${file}`);
}

function updateTrace(text, artifactPath, status, version) {
  const escaped = artifactPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const row = new RegExp(
    `^(\\| [^|]+ \\| \`${escaped}\` \\| )[^|]+( \\| )[^|]+( \\|)$`,
    'm',
  );
  return replaceOnce(
    text,
    row,
    `$1${status}$2${version}$3`,
    `TRACE row for ${artifactPath}`,
  );
}

export function preparePromotion({
  specPath,
  adrPath,
  tracePath,
  approvalReference,
  specVersion,
  adrVersion,
  traceVersion,
  prBodyPath,
}) {
  assertPath(specPath, 'specs/', /^specs\/.+\/SPEC-[^/]+\.md$/);
  assertPath(
    adrPath,
    'specs/architecture/adrs/',
    /^specs\/architecture\/adrs\/ADR-[^/]+\.md$/,
  );
  assertPath(
    tracePath,
    'specs/traceability/',
    /^specs\/traceability\/TRACE-[^/]+\.md$/,
  );
  if (!approvalReference.trim())
    throw new Error('approval reference is required');

  let spec = fs.readFileSync(specPath, 'utf8');
  let adr = fs.readFileSync(adrPath, 'utf8');
  let trace = fs.readFileSync(tracePath, 'utf8');
  if (
    metadata(spec, 'Status') !== 'Draft' ||
    metadata(adr, 'Status') !== 'Draft'
  )
    throw new Error('SPEC and ADR must both be Draft');
  openQuestionsAreClosed(spec, specPath);
  openQuestionsAreClosed(adr, adrPath);

  spec = setMetadata(spec, 'Status', TARGET_STATUS);
  spec = setMetadata(spec, 'Version', specVersion);
  spec = setMetadata(spec, 'Approved by', 'Product owner for implementation');
  spec = setMetadata(spec, 'Approval reference', approvalReference);
  spec = approveProvenanceSection(
    spec,
    '## Requirement provenance',
    approvalReference,
  );
  spec = spec.replace(
    'This artifact remains Draft and does not authorize implementation.',
    'This artifact is Ready to start for reversible implementation with synthetic data. It does not authorize a real-data pilot.',
  );

  adr = setMetadata(adr, 'Status', TARGET_STATUS);
  adr = setMetadata(adr, 'Version', adrVersion);
  adr = approveProvenanceSection(adr, '## Provenance', approvalReference);
  adr = adr.replace(
    'This Draft PR changes documentation only. It provides no implementation, migration, test, or pilot evidence.',
    'This Ready-to-start decision record authorizes reversible implementation with synthetic data but provides no implementation, migration, test, or pilot evidence.',
  );
  adr = replaceOnce(
    adr,
    /## Implementation authority\n[\s\S]*$/,
    '## Implementation authority\n\nReady to start: reversible implementation with synthetic data is authorized. Review, Accepted, real personal data, and pilot gates still require their own evidence and explicit approval.\n',
    'ADR implementation authority',
  );

  trace = setMetadata(trace, 'Version', traceVersion);
  trace = updateTrace(trace, specPath, TARGET_STATUS, specVersion);
  trace = updateTrace(trace, adrPath, TARGET_STATUS, adrVersion);
  trace = updateTrace(trace, tracePath, TARGET_STATUS, traceVersion);
  trace = trace
    .replace(
      '`SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` remain Draft.',
      '`SPEC-DIVE-ONBOARDING-001` and `ADR-DIVE-013` are Ready to start.',
    )
    .replace(
      'readiness review and explicit status promotion are still required before implementation.',
      'reversible implementation with synthetic data is authorized; implementation evidence and later lifecycle gates remain outstanding.',
    )
    .replace(
      'recorded in the Draft artifacts',
      'recorded in the Ready-to-start artifacts',
    );

  for (const [file, text] of [
    [specPath, spec],
    [adrPath, adr],
  ]) {
    if (
      /remains Draft|no implementation authority|None while Draft|pending review/i.test(
        text,
      )
    )
      throw new Error(`${file}: stale Draft blocker remains after promotion`);
  }

  fs.writeFileSync(specPath, spec);
  fs.writeFileSync(adrPath, adr);
  fs.writeFileSync(tracePath, trace);

  if (prBodyPath) {
    fs.writeFileSync(
      prBodyPath,
      `## Summary\n\nPromotes ${specPath} and ${adrPath} to Ready to start after explicit approval. The promotion authorizes reversible implementation with synthetic data only.\n\n## Change type\n\n- [x] Normative SPEC / ADR / contract change\n\n## Normative changes and provenance\n\n- [x] Derived and Proposed rows carry an explicit implementation approval reference.\n- [x] No blocking open question remains.\n- [x] Status promotion is explicit and human-triggered.\n\nApproval reference: ${approvalReference}\n\n## AI involvement\n\n- [ ] No AI-generated or AI-rewritten content\n- [x] AI only applied the deterministic promotion prepared by the manually triggered workflow\n\n## Traceability\n\n- **SPEC:** ${specPath} ${specVersion}\n- **ADR:** ${adrPath} ${adrVersion}\n- **TRACE:** ${tracePath} ${traceVersion}\n\n## Validation\n\n### Automated checks\n\nThe workflow runs spec governance and promotion-script tests before creating this PR.\n\n### Known gaps\n\n- No implementation or pilot evidence is claimed.\n- An implementation issue with one Development Brief is still required before coding.\n\n## Risk, compatibility, and rollback\n\n- **Security / privacy / data impact:** no runtime change; Ready to start permits synthetic-data implementation only.\n- **Operational impact:** none until an implementation PR is approved and merged.\n- **Compatibility / migration impact:** none in this promotion PR.\n- **Rollback plan:** revert this promotion commit.\n`,
    );
  }
  return { specPath, adrPath, tracePath };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (!key || value === undefined)
      throw new Error('arguments must be --key value pairs');
    args[key] = value;
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const result = preparePromotion({
      specPath: a.spec,
      adrPath: a.adr,
      tracePath: a.trace,
      approvalReference: a['approval-reference'],
      specVersion: a['spec-version'],
      adrVersion: a['adr-version'],
      traceVersion: a['trace-version'],
      prBodyPath: a['pr-body'],
    });
    console.log(
      `Prepared Ready-to-start promotion for ${result.specPath}, ${result.adrPath}, and ${result.tracePath}.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
