# AI Assistance Log

This log records substantial AI-assisted work. The team remains responsible for understanding, testing, correcting, and presenting every accepted change. The Week 3 baseline is a scaffold and learning reference; it is not evidence that the future AI/RAG feature has already been completed.

| Date | Task | Tool or model | Files generated or modified | Human review | Corrections |
| --- | --- | --- | --- | --- | --- |
| 2026-09-04 | Define project scope and initial architecture | Codex | `docs/project-plan.md`, `docs/architecture.md` | Team confirmation required before the scope freeze | Reframed a generic chatbot as a document-grounded project assistant |
| 2026-09-04 | Scaffold the first frontend-backend-data slice | Codex | Initial application, infrastructure, tests, and documentation | Type checking, automated tests, production builds, container health checks, valid CRUD, and invalid-input behavior were verified | Replaced pnpm with npm workspaces after Windows linking failed; changed the host database port to 55432 because port 5432 was already used locally; updated NestJS 12 to an ESM-compatible build and test configuration |
| 2026-09-05 | Reconcile documentation with the Week 3 checkpoint | Codex | `README.md`, `docs/*.md` | Team must verify the progress description, ownership, and open decisions before the next feature milestone | Clarified that AI/RAG, VM deployment, evaluation execution, and presentation evidence remain pending; kept the application structure unchanged |

## Review rule for the team

Before merging any AI-assisted change, a team member should be able to:

- describe why the change is needed;
- explain the important code path and data flow;
- run the relevant test or verification command;
- identify one possible failure mode; and
- state what was changed after review.

Add one row for every later substantial AI-assisted task. Record the task, generated or changed files, how a team member reviewed the work, and the corrections made after that review.
