---
description: Reproduce, fix and prevent a bug
agent: agent
---

Bug: ${input:bug:Describe the bug, steps to reproduce, expected vs actual}

1. Find the root cause (do not patch symptoms). Explain it briefly.
2. Write a failing test that reproduces it.
3. Make the smallest correct fix, respecting `.github/copilot-instructions.md`.
4. Check whether the same flaw exists elsewhere and tell me.
5. If the bug could have corrupted stored data, say so and propose a safe migration or repair (do not apply destructive changes without asking).
6. Run typecheck, lint and tests, then summarize.
