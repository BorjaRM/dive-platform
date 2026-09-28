## Summary

<!-- What changes and why? Link the owning SPEC, ADR, issue, proposal, or incident. Prefer links over copied context. -->

## Change type

- [ ] Documentation or navigation only; no normative change
- [ ] Normative SPEC / ADR / contract change
- [ ] Implementation of already approved requirements
- [ ] Spike or evidence
- [ ] Refactor / maintenance with no intended behavior change

## Normative changes and provenance

<!-- Complete only when adding or changing a requirement, default, state, transition, invariant, permission, limit, interface, or acceptance criterion. Otherwise write "Not applicable" and delete the checklist/table. -->

- [ ] Every new or changed normative statement declares `Documented`, `Derived`, or `Proposed` provenance.
- [ ] Every `Documented` statement links the exact source and does not change its meaning.
- [ ] Every `Derived` statement links its sources, explains the derivation, and has explicit human approval.
- [ ] Every `Proposed` decision remains non-normative and the affected SPEC remains `Draft` until approval.
- [ ] Missing or contradictory information is recorded as an open question rather than silently resolved.
- [ ] No unapproved default, TTL, state, transition, permission, invariant, limit, or acceptance criterion was introduced.
- [ ] Any status promotion (`Draft`, `Ready to start`, `Review`, `Accepted`) is justified and approved.

### Requirement provenance

| Requirement / decision | Change | Provenance | Exact source | Approval / status |
|---|---|---|---|---|
|  |  | `Documented` / `Derived` / `Proposed` |  |  |

## AI involvement

- [ ] No AI-generated or AI-rewritten content
- [ ] AI only reformatted or moved existing content without semantic changes
- [ ] AI synthesized or rewrote content; all affected items are listed in the provenance table
- [ ] AI proposed new decisions; they remain explicitly marked `Proposed` and non-normative

<!-- Name the agent/tool and semantic scope in one concise paragraph. -->

## Traceability

<!-- List stable pointers only. Do not copy requirement text or create TRACE churn when relationships did not change. -->

- **Affected IDs:**
- **Decisions:**
- **Tests:**
- **TRACE:** updated | unchanged (why)

## Validation

<!-- Keep this reproducible and short. Delete non-applicable boilerplate. Tests are the default evidence. -->

### Automated checks

<!-- `command` — PASS/FAIL/not run; include only observed results. -->

### Focused tests

<!-- Stable test path or focused command. "Covered by automated checks above" is valid. -->

### Manual validation

<!-- Only for behavior not covered by automation. Otherwise: Not applicable. -->

### Evidence

<!-- Link `evidence/` only for spikes, measurements, external-provider behavior, security/manual/regulatory review, or other time-bound proof. Otherwise: Not applicable — tests are the proof. Do not attach duplicate logs or generated reports. -->

### Known gaps

## Risk, compatibility, and rollback

- **Security / privacy / data impact:**
- **Operational impact:**
- **Compatibility / migration impact:**
- **Rollback plan:**

## Reviewer confirmation

- [ ] I verified that the listed tests/evidence support the affected requirements.
- [ ] I verified that `Derived` and `Proposed` content was not silently treated as previously documented.
- [ ] I verified that the resulting document status is appropriate.
