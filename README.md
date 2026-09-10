# ExaMate AI

ExaMate AI is the final-project prototype for a two-person team in **New Technologies in Software Engineering**. It is a web workspace for managing project work and, in the next milestones, asking questions about a controlled collection of course and project documents.

The product goal is not to build a generic chatbot. The planned assistant must answer from retrieved evidence, show citations, and clearly refuse or fall back when the available evidence or an AI dependency is insufficient.

## Current checkpoint — end of Week 3 / 8

The repository currently contains a deliberately small, runnable vertical slice:

- React + TypeScript frontend with a task workspace.
- NestJS REST API with DTO validation and meaningful HTTP status codes.
- PostgreSQL persistence with `pgvector` enabled for the planned retrieval index.
- Docker Compose services for the web app, API, and database.
- API and database health checks.
- Loading, empty, success, and error states in the task workflow.
- An AI status endpoint and UI boundary that explicitly show the assistant is not configured yet.
- Basic automated tests, type checking, production builds, and container verification.

This is a Week 3 foundation, not the finished final product. The AI/RAG workflow, document upload and ingestion, citations, evaluation cases, VM deployment, presentation evidence, and technical-defense preparation remain to be completed by the team.

## Planned product flow

1. A team member opens the project workspace.
2. The team adds approved course or project documents.
3. The backend extracts text, splits it into chunks, creates embeddings, and stores the evidence.
4. A member asks a question through the web app.
5. The backend retrieves relevant chunks and sends only bounded evidence to the model.
6. The response is validated and returned with citations, or a safe unanswerable/fallback result.
7. The team records the result in the evaluation set.

The first successful demonstration should fit into a short, reproducible end-to-end scenario rather than a large feature set.

## Technology baseline

- Frontend: React, TypeScript, and Vite.
- Backend: Node.js, NestJS, and REST APIs.
- Data: PostgreSQL with `pgvector`.
- AI direction: provider-neutral backend adapter, with a hosted model or Ollama to be selected by the team.
- Runtime: Dockerfiles and Docker Compose.
- Deployment target: Ubuntu Server LTS virtual machine with a reverse proxy.

## Prerequisites

- Node.js 24 or a compatible current LTS release.
- npm 11.
- Docker Desktop or Docker Engine with Compose.

## Run locally in development

From the project root:

```bash
npm install
docker compose up -d db
npm run dev:api
npm run dev:web
```

Open the web application at `http://localhost:5173`. The API is available at `http://localhost:3000/api`.

## Run the containerized stack

```bash
docker compose up --build
```

Open `http://localhost:8080`.

The database is mapped to host port `55432` by default because port `5432` may already be occupied by a local PostgreSQL installation.

## Verification commands

```bash
npm run typecheck
npm test
npm run build
docker compose config
```

## Scope and safety boundaries

- The browser never receives model credentials or database secrets.
- Do not commit `.env` files, API keys, or local credentials.
- Uploaded files will be limited by type and size when ingestion is implemented.
- Retrieved document text is treated as untrusted content, including instructions that may appear inside a document.
- Model calls will use timeouts and bounded retries.
- A response without a valid source will not be presented as a grounded answer.
- Task management and document browsing must remain usable when the AI provider is disabled or unavailable.

## What the team owns next

The next milestones are intentionally left for the two team members to implement and explain:

- Take ownership of the current baseline by running it, tracing one request, and making a small cross-layer change.
- Implement document upload, text extraction, chunking, embeddings, retrieval, and citation validation.
- Connect one approved model through the backend with structured output and safe fallback behavior.
- Execute the ten evaluation cases in [`docs/evaluation-plan.md`](docs/evaluation-plan.md).
- Deploy the same Compose stack on the selected VM.
- Prepare the architecture explanation, demo, contribution record, and technical-defense answers.

## Project documentation

- [`docs/project-plan.md`](docs/project-plan.md): scope, current checkpoint, delivery plan, ownership, and risks.
- [`docs/architecture.md`](docs/architecture.md): implemented and planned architecture flows.
- [`docs/ai-usage-log.md`](docs/ai-usage-log.md): substantial AI-assisted work and human review record.
- [`docs/evaluation-plan.md`](docs/evaluation-plan.md): acceptance cases for the future AI/RAG feature.
- [`docs/week-01.md`](docs/week-01.md): cumulative Week 1–3 milestone evidence; the filename is retained for continuity.

## Important note

This repository is an educational project. Exact deadlines, approved technologies, model-access rules, and grading criteria from the course LMS take precedence over this planning document.
