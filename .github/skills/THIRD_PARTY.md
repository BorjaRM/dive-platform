# Third-party Copilot skills

The directories below are vendored from [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills) at commit [`063bee94c3f4df8453406c830b0a7df0f2860278`](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278):

- `vercel-react-best-practices`
- `vercel-composition-patterns`
- `web-design-guidelines`

The React skills' `SKILL.md` files declare the MIT license and Vercel authorship. `web-design-guidelines` records Vercel as author but does not declare a license in its `SKILL.md`; keep this explicit during review. The vendored files are kept unchanged; only the React skill directories are renamed after each skill's frontmatter `name` so GitHub Copilot can discover them under this repository's naming convention.

## Precedence and scope

These are advisory engineering guides for `apps/web/**`. They do not create product requirements, acceptance criteria, performance budgets, dependencies, deployment decisions, or architecture decisions.

When guidance conflicts, use this order:

1. Approved `specs/**` requirements and ADRs.
2. `.github/copilot-instructions.md` and the applicable project agent.
3. Version-matched Next.js documentation installed under `apps/web/node_modules/next/dist/docs/`.
4. These third-party skills.

Apply only rules relevant to the change. Do not add SWR, caching, new dependencies, public contracts, or abstractions merely because a skill mentions them. Missing product or architecture decisions remain open questions.

## Mutable review source

`web-design-guidelines` is pinned here, but its procedure fetches `vercel-labs/web-interface-guidelines` from `main` at review time. UI review output must record the fetched source URL and retrieval date. Those remote guidelines remain advisory and cannot override approved requirements, repository instructions, or version-matched framework documentation.

## Updating

Review upstream changes before replacing the vendored directories. Update the pinned commit in this file and record any intentional local differences. Keep directory names aligned with the `name` field in each `SKILL.md`.
