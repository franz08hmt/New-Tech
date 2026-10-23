> Historical planning/checkpoint record. Current deployment and acceptance status is in docs/PROJECT-CONTEXT.md and docs/RUBRIC-READINESS-HANDOFF.md. The user subsequently authorized committing and pushing the reviewed integration work; earlier no-push/blocked notes below describe their original checkpoint.

# Resume completion checklist

- [x] Read repository instructions, current source and existing handoff.
- [x] Identify existing commits and preserve documentation WIP.
- [x] Fresh read-only Google/DB/Storage/config inspection: Google enabled, TLS
  authorized, private Storage, ledger 001–016 checksums intact; Auth DB URL absent.
- [x] Verify hosted migration prerequisite: five PG17 reproduction assertions
  passed on an owned disposable database, all changes rolled back.
- [x] Record precise external dependency and prepare an unsent Support request.
  User confirmed Support has not been contacted and requested a draft.
- [ ] Real runtime startup and Google end-to-end acceptance (depends on DB).
- [ ] Bound audit/target proof and pre-dispatch provider budget (depends on runtime).
- [ ] >=20-case fair baseline/improved evaluation (depends on all gates above).
- [ ] Update final handoff and report with fresh evidence, not assumed PASS.

## Local verification and discovered test defect

- [x] Build/typecheck/format pass; API Vitest457, API Node1313, Web544 pass.
  The initial overlapping-build orchestration error is recorded, not hidden.
- [x] Reproduce a separate genuine clean-DB test failure: the new managed Auth
  test assumed Supabase's optional `anon` role existed (42704).
- [x] Fix only that test's ACL inspection: resolve optional roles via catalog,
  retain effective-privilege assertions, always reject PUBLIC EXECUTE.
  Focused RED→GREEN recorded; no production/migration changes.
- [x] Final full database gate: 521/521 in51 files, exit0; owned container
  removed after checking its exact ID and ownership label. Other containers
  and cloud resources untouched. Remaining deployment tasks depend on Support
  or an explicit supported alternative deployment design.
