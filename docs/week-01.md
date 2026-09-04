# Week 3 Milestone Evidence

This cumulative checkpoint keeps the original `week-01.md` filename for continuity while recording the state reached at the end of Week 3.

## Status

The planning baseline and first runnable technical slice are complete locally. The repository is ready to be published, but the team still needs to confirm member identities, select the model provider and VM, implement the AI/RAG workflow, and prepare the later presentation evidence.

## Weeks 1–2: planning completed

- Project direction approved as CourseMate AI.
- The target users and controlled-document assistant concept were defined.
- React and NestJS were selected for the initial web stack.
- PostgreSQL and pgvector were selected for persistent data and the future retrieval index.
- The architecture, minimum vertical slice, evaluation cases, scope boundaries, and two-person ownership model were documented.

## Week 3: technical baseline completed

- A React task workspace was built with loading, empty, success, and error states.
- NestJS task endpoints were implemented with DTO validation and meaningful status codes.
- PostgreSQL persistence was connected and seeded with development data.
- Database initialization enables pgvector for the future retrieval pipeline.
- Docker Compose was defined for the web app, API, and database services.
- API and database health checks were added.
- The AI endpoint and UI boundary report that the provider is intentionally not configured yet.
- Formatting, TypeScript checks, API and web tests, and production builds passed during baseline verification.
- The web, API, and PostgreSQL containers built and launched successfully during baseline verification.
- The reverse-proxy route returned the application and API successfully.
- A valid task was created and moved to `done` through the containerized API.
- An invalid one-character task title returned HTTP 400.

## Remaining before the next release gate

- Both members independently run and explain the baseline.
- Each member makes and reviews a small cross-layer change.
- Implement document upload, extraction, chunking, embeddings, retrieval, and citations.
- Select and connect one approved model through the backend.
- Execute and record the ten evaluation cases.
- Add timeout, malformed-output, unanswerable, prompt-injection, and unavailable-service handling.
- Deploy the same Compose stack to the selected virtual machine.
- Record the exact Git revision, short demo evidence, individual contributions, and technical-defense preparation.

## Open decisions

- Team member names or identifiers.
- Approved model provider and access method.
- Target virtual-machine platform.
- Official deadline, rubric, and LMS constraints.
