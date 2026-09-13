# Responsive AI Copilot Layout

## Problem Statement

How might we make the document-grounded Assistant the most memorable part of ExaMate without removing or obscuring the dashboard, tasks, courses and document workflow that already work?

## Recommended Direction

Add a contextual ExaMate AI panel that can be opened from every page. The current page remains mounted and visible, so the Assistant feels like a layer across the workspace rather than a separate chatbot product.

The panel docks beside the workspace on wide desktop screens, overlays from the right on laptop screens and opens as a bottom sheet on mobile. A compact header trigger restores the panel after it is closed. The Documents page receives document-oriented suggested questions and an illustrative citation preview, making it the strongest presentation screen.

This milestone is a frontend layout preview. It must label sample answers clearly and must not imply that upload, retrieval or an AI provider is connected.

## Key Assumptions to Validate

- [ ] A 360–400 px panel leaves enough room for the existing dashboard at 1440 px; verify visually at 1440 px.
- [ ] Overlay behavior is easier to use than compressing content at 1024 px; verify that the current page remains readable and closable by mouse and keyboard.
- [ ] A bottom sheet preserves the current mobile workflow at 320 px; verify there is no horizontal overflow.
- [ ] Contextual prompts communicate product value even before the RAG API exists; ask Tài to explain the Documents demo without claiming it is real AI output.

## Objective and Success Criteria

The user can open ExaMate AI from Dashboard, Tasks, Courses, Documents and the remaining existing pages without losing page state or navigation. The panel explains the current context, shows relevant starter questions, displays a clearly labelled sample grounded answer and can be dismissed with its close button or `Escape`.

The implementation is successful when:

- the page heading and existing content remain present while the Assistant is open;
- the Assistant context follows the active page;
- opening moves focus to the panel close button and closing returns focus to the trigger;
- desktop, laptop and mobile layouts follow the dock, overlay and bottom-sheet model;
- the interface states that AI and retrieval are not connected;
- no new API request, package or backend change is introduced;
- frontend tests, typecheck, formatting and production build pass.

## Tech Stack and Commands

- React 19, TypeScript, Vite, Heroicons, Tailwind 4 and the existing CSS design tokens.
- Development: `npm run dev:web`
- Focused test: `npm run test --workspace @examate/web -- --run -t "ExaMate AI panel"`
- Full test: `npm run test --workspace @examate/web`
- Typecheck: `npm run typecheck --workspace @examate/web`
- Format: `npm run format:check --workspace @examate/web`
- Build: `npm run build --workspace @examate/web`

## Project Structure

- `apps/web/src/App.tsx`: owns the active page and whether the Assistant is open.
- `apps/web/src/AssistantPanel.tsx`: renders contextual prompts, preview answer, sources and close behavior.
- `apps/web/src/App.test.tsx`: verifies open, close, focus and page context behavior.
- `apps/web/src/styles.css`: implements docked, overlay and bottom-sheet layouts.
- `docs/ideas/responsive-ai-copilot.md`: records scope and design decisions.

## Code Style

Keep the state at the closest shared owner and pass small callbacks into a focused component:

```tsx
<AssistantPanel
  pageId={page.id}
  pageName={page.name}
  onClose={closeAssistant}
/>
```

Use semantic `aside`, `header`, `section`, `form` and `button` elements. Use existing color tokens, Poppins and Heroicons. Do not add a state library for one Boolean UI state.

## Testing Strategy

Use React Testing Library and Vitest. Write the panel behavior test before implementation and confirm that it fails for the missing trigger. Test user-visible outcomes rather than CSS class implementation. Run the full frontend suite after each completed slice and perform a browser viewport check when the local browser tool permits localhost access.

## Boundaries

### Always

- Preserve every existing route and existing page component.
- Keep the preview honest with visible sample/not-connected labels.
- Support keyboard operation, visible focus and reduced motion.
- Verify at 320, 768, 1024 and 1440 px.

### Ask first

- Adding a frontend dependency or global state library.
- Replacing the current navigation or removing a page.
- Connecting the panel to a future Assistant endpoint.

### Never in this milestone

- Modify `apps/api`, `infra` or `compose.yaml`.
- Send document content to an external model.
- Present illustrative answers or citations as live AI output.
- Persist chat history or selected document contents.

## MVP Scope

- Global open/close trigger.
- Context label and relevant suggested questions for each current page.
- Clearly labelled illustrative answer and source treatment.
- Docked desktop, laptop overlay and mobile bottom-sheet layout.
- Automated interaction and accessibility-oriented tests.

## Not Doing (and Why)

- Real chat submission — the RAG endpoint does not exist yet.
- Streaming tokens — this depends on the future API contract.
- Document-aware retrieval — the backend ingestion pipeline belongs to a later team task.
- Chat history — unnecessary for validating this layout.
- Replacing the existing Assistant page — preserving current routes is an explicit requirement.

## Open Questions for the Integration Milestone

- What request and response schema will CM-302 expose?
- Will citations identify a page, chunk, heading or all three?
- Should panel history be scoped to the current document or the whole workspace?
