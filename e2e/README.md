# End-to-end tests

Playwright specs run against a local, disposable stack (local Supabase +
`next dev` + demo seed). Full workflow, including how Claude drives the
browser: [.claude/skills/verify-ui/SKILL.md](../.claude/skills/verify-ui/SKILL.md).

```bash
npm run e2e:up   # needs Docker
npm run e2e
```

On a developer machine run `npx playwright install chromium` once.
