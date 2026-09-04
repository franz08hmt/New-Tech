# CourseMate AI Architecture

## Architecture status at the end of Week 3

The project currently uses a modular monolith. The browser communicates with one NestJS API, and PostgreSQL stores the implemented task data. The database is initialized with `pgvector` support so the future retrieval index can be added without changing the deployment shape.

The local Docker Compose stack is verified. The Ubuntu virtual-machine deployment, document ingestion, retrieval pipeline, and model provider are still planned work.

## System context

```mermaid
flowchart LR
    User[Student team member] -->|HTTP or HTTPS| Proxy[Nginx reverse proxy]
    Proxy --> Web[React web application]
    Web -->|REST JSON| API[NestJS API]
    API --> DB[(PostgreSQL and pgvector)]
    API -. planned .-> Model[Hosted model or Ollama]
```

## Implemented request flow: task creation

```mermaid
sequenceDiagram
    participant User
    participant Web as React web
    participant API as NestJS API
    participant DB as PostgreSQL

    User->>Web: Submit task form
    Web->>API: POST /api/tasks
    API->>API: Validate DTO and business input
    API->>DB: INSERT task
    DB-->>API: Stored task
    API-->>Web: 201 task JSON
    Web-->>User: Show task in workspace
```

Implemented backend routes currently include health checks, task listing, task creation, and task status updates. The frontend handles loading, empty, success, and error states for this workflow.

## Planned grounded-answer flow

```mermaid
sequenceDiagram
    participant User
    participant API as NestJS API
    participant DB as PostgreSQL and pgvector
    participant LLM as Model provider

    User->>API: Submit question
    API->>API: Validate and normalize input
    API->>DB: Retrieve relevant document chunks
    DB-->>API: Evidence and source identifiers
    API->>LLM: Question plus bounded evidence
    LLM-->>API: Structured answer and citation ids
    API->>API: Validate schema and citations
    API-->>User: Grounded answer or safe fallback
```

The planned flow must reject unsupported citations and must not present a generic model response as grounded evidence. Document text is untrusted input, so instructions found inside documents are treated as content rather than system commands.

## Deployment boundary

The current local deployment uses Docker Compose with a React/Nginx web container, a NestJS API container, and a PostgreSQL container. The target release will run the same Compose stack on an Ubuntu Server LTS virtual machine. Secrets will be supplied through environment variables and never embedded in the browser bundle.

## Main boundaries to explain in the presentation

- Browser to API: REST JSON and request validation.
- API to database: parameterized persistence and health checks.
- API to AI orchestration: backend-only credentials, bounded evidence, structured output validation, and failure handling.
- AI orchestration to source data: document chunks, vector similarity, and citation identifiers.
- Runtime to deployment: container health, reverse proxy routing, environment variables, and restart recovery.
