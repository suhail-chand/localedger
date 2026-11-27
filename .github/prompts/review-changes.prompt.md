---
description: Review current changes against Localedger rules
agent: ask
---

Review the current uncommitted changes (or the files I name: ${input:scope:optional files or "all changes"}) against `.github/copilot-instructions.md`, `docs/requirements.md` and `docs/data-model.md`.

Report findings grouped by severity: **Blocker** (data loss or corruption risk, float money, rule violations, security), **Major** (spec deviations, missing validation, missing tests, layering violations), **Minor** (style, naming, small simplifications). For each: file and line, the problem, and a concrete fix. Explicitly check: integer paise everywhere, UTC storage, soft deletes and `updatedAt` bumps, Zod validation at boundaries, local-first behaviour, no new dependencies without reason, accessibility, code optimization and reusability, and test coverage. Say clearly if you find nothing in a category. Do not edit files.
