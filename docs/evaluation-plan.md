# ExaMate AI Evaluation Plan

## Status

The Week 3 baseline had no RAG. The current application has document ingestion, retrieval, cited answers, and a separate workspace-metadata answer for a document's assigned course. This checklist remains an acceptance plan, not a claim that every case has passed. It is deliberately small enough for a two-person team to execute, inspect, and explain during the final defense.

The course assignment comes from the `documents.course_id` relationship, not from PDF text. Its response has a workspace metadata source and no PDF citation. A document summary, by contrast, must be supported by indexed PDF passages. Keep these two kinds of evidence separate when evaluating answers.

Each result should record the model, prompt version, corpus revision, expected behavior, actual behavior, latency, pass/fail status, and reviewer notes. A failed case is evidence to investigate, not a result to hide.

| Case | Input class                                             | Expected behavior                                                                                                                |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| E01  | Direct requirement question                             | Answer with at least one valid citation                                                                                          |
| E02  | Question requiring two source passages                  | Combine evidence and cite both passages                                                                                          |
| E03  | Ambiguous question                                      | Ask for clarification or state the chosen interpretation                                                                         |
| E04  | Irrelevant question                                     | Explain that the controlled corpus does not support the request                                                                  |
| E05  | Unanswerable course question                            | Return an explicit unanswerable result without inventing facts                                                                   |
| E06  | Long but valid question                                 | Complete within the configured timeout or return a timeout state                                                                 |
| E07  | Prompt injection inside a document                      | Treat the instruction as document content and ignore it                                                                          |
| E08  | Malformed structured model output                       | Reject the output and use the safe fallback                                                                                      |
| E09  | Model dependency unavailable                            | Preserve the normal application and show document-search fallback                                                                |
| E10  | Citation references a missing chunk                     | Reject the citation and do not present the answer as grounded                                                                    |
| E11  | Old index with low-information nearest chunks           | Search a bounded wider candidate set; either cite useful passages or explicitly report no evidence                               |
| E12  | Ask which course a named document belongs to            | Resolve the document, report its workspace course association, and label the source as metadata rather than PDF evidence         |
| E13  | Named document is not ready, missing, or ambiguous      | Do not silently answer from a different document; request a clear selection or show the relevant state                           |
| E14  | Ask for the content or summary of one selected document | Restrict retrieval to that document and provide verifiable citations; do not substitute its course metadata for a content answer |

## Evaluation procedure

1. Freeze the corpus revision and prompt version.
2. Run each case through the same API endpoint used by the web application.
3. Save the response, citations, latency, logs, and dependency status.
4. Compare the actual result with the expected behavior.
5. Have the other team member review the result and record a short explanation.
6. Repeat failed cases after a correction and keep the earlier result for evidence.

For E11–E14, also record the selected document ID, its course assignment, processing state, indexed chunk count, and page-coverage fields when present. Older indexes can have no quality statistics; that is an unknown status, not proof that every page was indexed well. Re-indexing changes stored data and should be done only on an agreed test document after preserving the prior result.

## Additional checks before release

- The browser cannot access model credentials.
- Unsupported file types and oversized uploads are rejected.
- A model timeout does not make the normal task workflow unavailable.
- Retrieved text is treated as untrusted content.
- A citation points to an existing document chunk and can be opened by the user.
- The application reports unavailable database or model dependencies clearly.
