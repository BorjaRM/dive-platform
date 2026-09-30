#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const VALID_STATUSES = new Set([
  'Draft',
  'Ready to start',
  'Review',
  'Accepted',
  'Deferred',
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

export function artifactKind(file) {
  const relative = path.relative(root, file).replaceAll(path.sep, '/');
  if (!relative.startsWith('specs/')) return undefined;
  if (/^specs\/.+\/SPEC-[^/]+\.md$/.test(relative)) return 'spec';
  if (/^specs\/architecture\/adrs\/ADR-[^/]+\.md$/.test(relative)) return 'adr';
  if (/^specs\/traceability\/TRACE-[^/]+\.md$/.test(relative)) return 'trace';
  return undefined;
}

export function allArtifacts() {
  return walk(path.join(root, 'specs'))
    .filter((file) => artifactKind(file))
    .map((file) => path.relative(root, file));
}

export function changedArtifacts(base, head) {
  const output = execFileSync(
    'git',
    ['diff', '--name-only', base, head, '--', 'specs/'],
    { encoding: 'utf8' },
  );
  return output
    .split(/\r?\n/)
    .filter((file) => artifactKind(file) && fs.existsSync(file));
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

function expandIds(expression) {
  const clean = expression.replace(/`/g, '').trim();
  if (!clean.includes('..')) return [clean];
  const [first, last] = clean.split('..');
  const a = first.match(/^(.*-REQ-)(\d{3})$/);
  const b = last.match(/^(.*-REQ-)(\d{3})$/);
  if (!a || !b || a[1] !== b[1]) return [];
  const ids = [];
  for (let n = Number(a[2]); n <= Number(b[2]); n += 1) {
    ids.push(`${a[1]}${String(n).padStart(3, '0')}`);
  }
  return ids;
}

function metadata(text, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    text
      .match(new RegExp(`^- \\*\\*${escapedName}:\\*\\*\\s*(.+)$`, 'm'))?.[1]
      ?.trim() ??
    text.match(new RegExp(`^- ${escapedName}:\\s*(.+)$`, 'm'))?.[1]?.trim()
  );
}

function validateHeader(file, text, errors) {
  const id = path.basename(file, '.md');
  if (!new RegExp(`^# ${id}(?:\\s|$)`, 'm').test(text)) {
    errors.push(`${file}: heading does not match ${id}`);
  }
}

function validateStatusAndVersion(file, text, errors) {
  const status = metadata(text, 'Status');
  if (!status) errors.push(`${file}: missing Status`);
  else if (!VALID_STATUSES.has(status))
    errors.push(`${file}: invalid Status '${status}'`);
  if (!metadata(text, 'Version')) errors.push(`${file}: missing Version`);
  return status;
}

function requirementIds(text) {
  const section =
    text.match(/^## Requirements\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ??
    '';
  const declarations = section.replace(
    /^### Derivations\s*\n[\s\S]*?(?=^#{2,3} |$(?![\s\S]))/m,
    '',
  );
  return [...declarations.matchAll(/^- \*\*([A-Z0-9-]+-REQ-\d{3}):\*\*/gm)].map(
    (match) => match[1],
  );
}

export function validateRequirementOwnership(files, errors) {
  const owners = new Map();
  for (const file of files) {
    for (const id of requirementIds(fs.readFileSync(file, 'utf8'))) {
      if (owners.has(id)) {
        errors.push(
          `${file}: ${id} has duplicate owners (${owners.get(id)}, ${file})`,
        );
      } else {
        owners.set(id, file);
      }
    }
  }
}

export function validateSpec(file, errors) {
  const text = fs.readFileSync(file, 'utf8');
  const status = validateStatusAndVersion(file, text, errors);
  validateHeader(file, text, errors);

  const requirements = requirementIds(text);
  if (!requirements.length)
    errors.push(`${file}: no numbered requirements found`);

  const section = text.match(
    /## Requirement provenance\s*\n([\s\S]*?)(?=\n## |$)/,
  )?.[1];
  if (!section) {
    errors.push(`${file}: missing Requirement provenance section`);
    return;
  }

  const rows = section
    .split(/\r?\n/)
    .filter(
      (line) =>
        /^\|\s*`[A-Z0-9-]+-REQ-\d{3}/.test(line.trim()) &&
        /`(?:Documented|Derived|Proposed|Open question)`/.test(line),
    );
  const covered = new Map();

  for (const row of rows) {
    const [idsCell, provenanceCell, source, decision] = splitRow(row);
    const provenance = provenanceCell?.replace(/`/g, '');
    if (
      !['Documented', 'Derived', 'Proposed', 'Open question'].includes(
        provenance,
      )
    ) {
      errors.push(`${file}: invalid provenance '${provenance ?? ''}'`);
      continue;
    }

    const ids = expandIds(idsCell ?? '');
    if (!ids.length) {
      errors.push(`${file}: invalid requirement range '${idsCell ?? ''}'`);
    }
    if (!source || /^(?:-|TBD|Pending|<)/i.test(source)) {
      errors.push(`${file}: ${idsCell} has no exact source`);
    }
    if (!decision || /^(?:-|TBD|<)/i.test(decision)) {
      errors.push(`${file}: ${idsCell} has no decision status`);
    }
    if (provenance === 'Open question') {
      errors.push(
        `${file}: ${idsCell} cannot be both a requirement and an open question`,
      );
    }
    if (
      ['Ready to start', 'Review', 'Accepted'].includes(status) &&
      ['Derived', 'Proposed'].includes(provenance) &&
      !/Approved/i.test(decision ?? '')
    ) {
      errors.push(
        `${file}: ${idsCell} is ${provenance} but is not approved while status is ${status}`,
      );
    }

    for (const id of ids) {
      if (covered.has(id)) {
        errors.push(`${file}: ${id} has duplicate provenance coverage`);
      }
      covered.set(id, provenance);
    }
  }

  for (const id of requirements) {
    if (!covered.has(id)) errors.push(`${file}: ${id} has no provenance entry`);
  }
  for (const id of covered.keys()) {
    if (!requirements.includes(id)) {
      errors.push(`${file}: provenance references unknown ${id}`);
    }
  }
}

export function validateAdr(file, errors) {
  const text = fs.readFileSync(file, 'utf8');
  validateHeader(file, text, errors);
  validateStatusAndVersion(file, text, errors);
  if (!/^## Context\s*$/m.test(text))
    errors.push(`${file}: missing Context section`);
  if (!/^## (?:Decision|Proposed decision)\s*$/m.test(text))
    errors.push(`${file}: missing Decision or Proposed decision section`);
  if (
    !/^## (?:Acceptance criteria|Acceptance criteria \/ evidence|Expected validation|Expected validation after approval|Validation and expected evidence|Implementation authority)\s*$/m.test(
      text,
    )
  ) {
    errors.push(`${file}: missing acceptance or validation section`);
  }
}

export function validateTrace(file, errors, repositoryRoot = root) {
  const text = fs.readFileSync(file, 'utf8');
  validateHeader(file, text, errors);
  validateStatusAndVersion(file, text, errors);
  if (!metadata(text, 'Purpose')) errors.push(`${file}: missing Purpose`);
  for (const section of [
    'Artifact map',
    'Maintenance rule',
    'Current coverage',
  ]) {
    if (!new RegExp(`^## ${section}\\s*$`, 'm').test(text))
      errors.push(`${file}: missing ${section} section`);
  }

  const artifactMap =
    text.match(/^## Artifact map\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m)?.[1] ??
    '';
  let tableStarted = false;
  let tableEnded = false;
  for (const line of artifactMap.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) {
      if (tableStarted) tableEnded = true;
      continue;
    }
    if (tableEnded) {
      errors.push(`${file}: Artifact map table is interrupted`);
      break;
    }
    tableStarted = true;
  }
  for (const line of artifactMap.split(/\r?\n/)) {
    const [, pathCell, expectedStatus, expectedVersion] = splitRow(line);
    const target = pathCell?.match(/^`([^`]+\.md)`$/)?.[1];
    if (!target) continue;
    const absolute = path.resolve(repositoryRoot, target);
    if (!fs.existsSync(absolute)) {
      errors.push(`${file}: artifact map references missing ${target}`);
      continue;
    }
    const artifact = fs.readFileSync(absolute, 'utf8');
    for (const [key, expected] of [
      ['Status', expectedStatus],
      ['Version', expectedVersion],
    ]) {
      const actual = metadata(artifact, key);
      if (expected !== actual) {
        errors.push(
          `${file}: ${target} ${key} is '${actual}', map says '${expected}'`,
        );
      }
    }
  }

  const demonstrated =
    text.match(
      /^### Demonstrated coverage\s*\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/m,
    )?.[1] ?? '';
  for (const line of demonstrated
    .split(/\r?\n/)
    .filter((row) => row.startsWith('|'))) {
    const proof = splitRow(line)[2] ?? '';
    for (const match of proof.matchAll(
      /`((?:apps|packages|tests|docs|specs)\/[^`]+\.(?:ts|tsx|sql|md))`/g,
    )) {
      if (!fs.existsSync(path.resolve(repositoryRoot, match[1]))) {
        errors.push(
          `${file}: demonstrated proof references missing ${match[1]}`,
        );
      }
    }
  }
}

export function validateArtifact(file, errors) {
  const kind = artifactKind(file);
  if (kind === 'spec') validateSpec(file, errors);
  else if (kind === 'adr') validateAdr(file, errors);
  else if (kind === 'trace') validateTrace(file, errors);
  else errors.push(`${file}: unsupported governance artifact`);
}

function validatePullRequestBody(specFiles, errors) {
  if (
    !specFiles.length ||
    !process.env.GITHUB_EVENT_PATH ||
    !fs.existsSync(process.env.GITHUB_EVENT_PATH)
  ) {
    return;
  }
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'),
  );
  const body = event.pull_request?.body ?? '';
  for (const heading of [
    '## Normative changes and provenance',
    '## AI involvement',
    '## Traceability',
    '## Validation',
    '### Known gaps',
  ]) {
    if (!body.includes(heading)) {
      errors.push(`PR body: missing '${heading}'`);
    }
  }
}

export function run(args) {
  const errors = [];
  let files;
  if (args.includes('--all')) {
    files = allArtifacts();
  } else {
    const changedAt = args.indexOf('--changed');
    if (changedAt < 0 || !args[changedAt + 1] || !args[changedAt + 2]) {
      throw new Error(
        'Usage: validate-spec-governance.mjs --all | --changed <base> <head>',
      );
    }
    files = changedArtifacts(args[changedAt + 1], args[changedAt + 2]);
  }

  for (const file of files) validateArtifact(file, errors);
  validateRequirementOwnership(
    allArtifacts().filter((file) => artifactKind(file) === 'spec'),
    errors,
  );
  validatePullRequestBody(files, errors);

  return { errors, files };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { errors, files } = run(process.argv.slice(2));
    if (errors.length) {
      for (const error of errors) console.error(`error: ${error}`);
      console.error(`Spec governance failed with ${errors.length} error(s).`);
      process.exit(1);
    }
    console.log(`Spec governance passed for ${files.length} artifact(s).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}
