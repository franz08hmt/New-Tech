> Historical planning/checkpoint record. Current deployment and acceptance status is in docs/PROJECT-CONTEXT.md and docs/RUBRIC-READINESS-HANDOFF.md. The user subsequently authorized committing and pushing the reviewed integration work; earlier no-push/blocked notes below describe their original checkpoint.

# Supported managed-PostgreSQL completion route

Implement a separately versioned `supabase-managed` migration profile. Historical
001–025 remain byte-identical. Replace only 017 and 025 with explicitly named SQL
files and store their actual checksums. Keep application grants and tenant policies
identical. Never alter managed Auth ownership, RLS or ACLs.

Acceptance: strict complete-ledger validation before writes; atomic remaining
migrations; existing conflict locks apply to managed017; restricted installer with
PG17 bootstrap ADMIN/noINHERIT/noSET memberships succeeds on a disposable fixture;
Auth catalog and pre-existing rows unchanged; runtime credentials stay non-owner,
non-superuser, non-BYPASSRLS. An independent managed catalog pin and explicit exact
membership-option checks reject drift. No target-derived expected hash or bypass flag.

Recovery: failed install rolls back the entire pending profile. Rehearse restore
before cloud; fresh private backup and maintenance confirmation required. Existing
canonical rollback CLIs must reject managed histories rather than misapply them.
Support ticket SU-521037 was submitted; it is not a prerequisite for this route.

Then start real services, verify Google and browser flows, complete the bounded
before/after evaluation and update report artifacts. Do not claim final until those
checks actually pass. User confirmed writers stopped for this rollout window.

Completed: cloud managed026, separate TLS runtime LOGINs, real-service Docker
healthy, Google callback/manager Dashboard,45 HTTP checks. Window released.
Managed restricted fixture026 passed including platform CONNECT/anon denial.
Campaign01 executing21 identical questions per phase under a durable
pre-dispatch envelope; no retries.

Delivery: baseline20 reviewed15 strictPASS/3FAIL/2 injection INCONCLUSIVE;
improved3(1 success,2HTTP503),17 not dispatched. Separate Lite probe502 stopped
after1 case; no model mixing. All51 AI provider calls/reservations carried over,
upperUSD0.618895, no billing/budget increase. Runtime normal config restored,
ledger26 and both capabilities reverified; demo email browser login/Dashboard
freshly passed. App2318, canonicalDB521/51files, managed fixture1, typecheck,
build, format and PDF regression pass. Report DRAFT reflects incomplete AI
comparison. No commit/push; preserve prior docs WIP and private backups.
