---
description: Produce an implementation plan for a feature or milestone before writing code
agent: ask
---

Plan the following work for Localedger: ${input:feature:Feature or milestone to plan (e.g. "Milestone 3: add/edit transaction")}

Read `docs/requirements.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/milestones.md`, `docs/decisions.md` and the existing code that this work touches. Do not write implementation code.

Produce:

1. **Scope:** what is included and what is explicitly excluded (reference the spec sections).
2. **Ambiguities and assumptions:** anything the spec leaves open, with the simplest safe default for each. Ask me only about decisions that are expensive to reverse.
3. **Data and domain impact:** schema changes, new domain functions, invariants that must hold.
4. **Slices:** an ordered list of small vertical slices, each independently shippable with its files, tests, and "done when" criteria.
5. **Risks:** data-integrity, sync, timezone, rounding and accessibility risks, and how each is mitigated or tested.
6. **Test plan:** the specific unit, integration and component tests to write.

Keep it concise and concrete. Wait for my approval before implementing.
