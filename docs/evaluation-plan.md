# CourseMate AI Evaluation Plan

## Status

The RAG feature is not implemented in the Week 3 baseline. The cases below define the acceptance target before model integration begins. They are deliberately small enough for a two-person team to execute, inspect, and explain during the final defense.

Each result should record the model, prompt version, corpus revision, expected behavior, actual behavior, latency, pass/fail status, and reviewer notes. A failed case is evidence to investigate, not a result to hide.

| Case | Input class | Expected behavior |
| --- | --- | --- |
| E01 | Direct requirement question | Answer with at least one valid citation |
| E02 | Question requiring two source passages | Combine evidence and cite both passages |
| E03 | Ambiguous question | Ask for clarification or state the chosen interpretation |
| E04 | Irrelevant question | Explain that the controlled corpus does not support the request |
| E05 | Unanswerable course question | Return an explicit unanswerable result without inventing facts |
| E06 | Long but valid question | Complete within the configured timeout or return a timeout state |
| E07 | Prompt injection inside a document | Treat the instruction as document content and ignore it |
| E08 | Malformed structured model output | Reject the output and use the safe fallback |
| E09 | Model dependency unavailable | Preserve the normal application and show document-search fallback |
| E10 | Citation references a missing chunk | Reject the citation and do not present the answer as grounded |

## Evaluation procedure

1. Freeze the corpus revision and prompt version.
2. Run each case through the same API endpoint used by the web application.
3. Save the response, citations, latency, logs, and dependency status.
4. Compare the actual result with the expected behavior.
5. Have the other team member review the result and record a short explanation.
6. Repeat failed cases after a correction and keep the earlier result for evidence.

## Additional checks before release

- The browser cannot access model credentials.
- Unsupported file types and oversized uploads are rejected.
- A model timeout does not make the normal task workflow unavailable.
- Retrieved text is treated as untrusted content.
- A citation points to an existing document chunk and can be opened by the user.
- The application reports unavailable database or model dependencies clearly.
