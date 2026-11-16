# Notes for AI agents

Read HANDOFF.md first: layout, commands, release and beta, renaming, rules, open work.
Then README.md and docs/. The full build conversation is in docs/history/CHAT.md.

Before committing app changes: `cd web && npm test && npm run build:beta && E2E_BETA=1 npm run e2e`.
Do not run `npm run build` unless the team asked to release (it overwrites the released index.html).
