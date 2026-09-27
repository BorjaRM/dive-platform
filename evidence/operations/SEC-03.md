# SEC-03 Supply-chain and code security gates

## Implemented controls

`.github/workflows/security.yml` adds these read-only security jobs:

- Dependency review on pull requests.
- `pnpm audit --prod` as an auxiliary production-dependency signal.
- Gitleaks secret scanning on pull requests and `main`.
- CycloneDX SBOM generation as an uploaded artifact for `v*` release tags.

CodeQL is intentionally disabled because code scanning is not available for
this private repository under the current GitHub plan. The `security-events`
permission was already present and was not the cause of the warning. No job
commits or pushes repository changes.

For a private repository, the Gitleaks action requires the repository or
organization secret `GITLEAKS_LICENSE` to be configured before the workflow can
run successfully. That secret is intentionally not stored in the repository.

## Executable evidence

```text
pnpm audit --prod
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/security.yml')"
git diff --check
```

`pnpm audit --prod` completed with no known vulnerabilities in the current
lockfile. The local YAML parser passed; `actionlint` was not installed in this
environment, so GitHub Actions schema validation remains a CI responsibility.

## Ownership and patching

The CI/CD Quality & Automation owner maintains the workflow and its action
versions. Repository maintainers triage secret, dependency-review, and audit
findings before merging or tagging a release. `pnpm audit --prod` separates the
production dependency signal from development-only dependencies. CodeQL/SAST
coverage remains an explicit gap until code scanning is enabled for the
repository. No unapproved numeric patching SLA is introduced by this
remediation.
