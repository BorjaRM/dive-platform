# SEC-01 CI write access

## Scope

The CI validation and integration jobs use `contents: read` and do not have a
workflow step that runs `pnpm check:fix`, creates a commit, or pushes changes.
The CI/CD agent instructions now describe local formatting as an author task
and explicitly prohibit commit or push from validation jobs.

## Executable evidence

```text
rg -n "contents: write|git push|git commit" .github/workflows .github/agents
rg -n "check:fix" .github/workflows
git diff --check
```

The searches must return no write permission, push, commit, or workflow
autofix. The workflow remains read-only for both pull request and integration
execution; the agent may mention `check:fix` only as a local author command.
