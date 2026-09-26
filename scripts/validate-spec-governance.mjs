#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const root = process.cwd();
const errors = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function allSpecs() {
  return walk(path.join(root, "specs"))
    .filter((file) => /SPEC-[^/]+\.md$/.test(file))
    .map((file) => path.relative(root, file));
}

function changedSpecs(base, head) {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", base, head, "--", "specs"],
    { encoding: "utf8" },
  );
  return output
    .split(/\r?\n/)
    .filter((file) => /SPEC-[^/]+\.md$/.test(file) && fs.existsSync(file));
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function expandIds(expression) {
  const clean = expression.replace(/`/g, "").trim();
  if (!clean.includes("..")) return [clean];
  const [first, last] = clean.split("..");
  const a = first.match(/^(.*-REQ-)(\d{3})$/);
  const b = last.match(/^(.*-REQ-)(\d{3})$/);
  if (!a || !b || a[1] !== b[1]) return [];
  const ids = [];
  for (let n = Number(a[2]); n <= Number(b[2]); n += 1) {
    ids.push(`${a[1]}${String(n).padStart(3, "0")}`);
  }
  return ids;
}

function validateSpec(file) {
  const text = fs.readFileSync(file, "utf8");
  const status = text.match(/^- \*\*Status:\*\*\s*(.+)$/m)?.[1]?.trim();
  if (!status) errors.push(`${file}: missing Status`);

  const requirements = [
    ...text.matchAll(/^- \*\*([A-Z0-9-]+-REQ-\d{3}):\*\*/gm),
  ].map((match) => match[1]);
  if (!requirements.length) errors.push(`${file}: no numbered requirements found`);

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
    const provenance = provenanceCell?.replace(/`/g, "");
    if (
      !["Documented", "Derived", "Proposed", "Open question"].includes(
        provenance,
      )
    ) {
      errors.push(`${file}: invalid provenance '${provenance ?? ""}'`);
      continue;
    }

    const ids = expandIds(idsCell ?? "");
    if (!ids.length) {
      errors.push(`${file}: invalid requirement range '${idsCell ?? ""}'`);
    }
    if (!source || /^(?:-|TBD|Pending|<)/i.test(source)) {
      errors.push(`${file}: ${idsCell} has no exact source`);
    }
    if (!decision || /^(?:-|TBD|<)/i.test(decision)) {
      errors.push(`${file}: ${idsCell} has no decision status`);
    }
    if (provenance === "Open question") {
      errors.push(
        `${file}: ${idsCell} cannot be both a requirement and an open question`,
      );
    }
    if (
      ["Ready to start", "Review", "Accepted"].includes(status) &&
      ["Derived", "Proposed"].includes(provenance) &&
      !/Approved/i.test(decision ?? "")
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

function validatePullRequestBody(specFiles) {
  if (
    !specFiles.length ||
    !process.env.GITHUB_EVENT_PATH ||
    !fs.existsSync(process.env.GITHUB_EVENT_PATH)
  ) {
    return;
  }
  const event = JSON.parse(
    fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const body = event.pull_request?.body ?? "";
  for (const heading of [
    "## Normative changes and provenance",
    "## AI involvement",
    "## Traceability",
    "## Validation",
    "### Known gaps",
  ]) {
    if (!body.includes(heading)) {
      errors.push(`PR body: missing '${heading}'`);
    }
  }
}

let files;
if (args.includes("--all")) {
  files = allSpecs();
} else {
  const changedAt = args.indexOf("--changed");
  if (changedAt < 0 || !args[changedAt + 1] || !args[changedAt + 2]) {
    console.error(
      "Usage: validate-spec-governance.mjs --all | --changed <base> <head>",
    );
    process.exit(2);
  }
  files = changedSpecs(args[changedAt + 1], args[changedAt + 2]);
}

for (const file of files) validateSpec(file);
validatePullRequestBody(files);

if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`Spec governance failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(`Spec governance passed for ${files.length} SPEC file(s).`);