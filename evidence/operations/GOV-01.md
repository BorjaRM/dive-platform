# GOV-01 SDD governance validation

## Scope

The governance validator now discovers SPEC, ADR, and TRACE artifacts
independently and applies an artifact-specific structural check. Changed-artifact
validation covers all three types and validates the pull-request sections when
any one of them changes.

## Executable evidence

```text
node --test scripts/validate-spec-governance.test.mjs
node scripts/validate-spec-governance.mjs --all
```

The repository currently validates 19 SDD artifacts. The fixtures include valid
and invalid examples for SPEC, ADR, and TRACE.