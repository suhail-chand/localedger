---
description: Implement one approved slice end to end with tests
agent: agent
---

Implement this slice of Localedger: ${input:slice:Describe the slice or paste it from the approved plan}

Process:

1. Read `.github/copilot-instructions.md`, the relevant `docs/*.md`, and the existing code you will touch. Follow the applicable `.github/instructions/*` rules and any relevant skill.
2. State a short plan listing the files you will create or change. Do not touch unrelated files.
3. Implement domain logic first, with unit tests written alongside it. Then data layer, then UI.
4. Respect the non-negotiable rules (integer paise, UTC time, soft delete, Zod validation, local-first, layering).
5. Run `npm run typecheck && npm run lint && npm run test` and fix every failure. Do not weaken or delete tests to pass.
6. Append any new assumption or decision to `docs/decisions.md`. Tick the matching item in `docs/milestones.md`.
7. Finish with a short summary: what changed, how to try it manually, what is not done, and anything I should verify.
