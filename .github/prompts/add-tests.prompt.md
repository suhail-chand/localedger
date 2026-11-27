---
description: Add or strengthen tests for a module
agent: agent
---
Add thorough tests for: ${input:target:File, module or feature to test}

Read the code and the matching spec in `docs/requirements.md` first. Apply `.github/instructions/tests.instructions.md`. Cover the happy path, boundaries, rounding, negatives and zero, timezone/DST and month-end cases where relevant, invalid input, and tombstones/idempotency for data and sync code. If you find a bug, add a failing test that proves it, fix the code, and tell me. Run the test suite and report the results.
