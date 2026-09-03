# Lab 2 AI Use Record

## 1. AI Tool Used

| Item                   | Details                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Tool                   | OpenAI ChatGPT with Codex                                                                                                |
| Use period             | Lab 2 specification and planning stage                                                                                   |
| Main purpose           | Requirements analysis, engineering-contract drafting, test planning, consistency checking, and step-by-step Git guidance |
| Student responsibility | I reviewed, corrected, and approved the final documents and remain responsible for all decisions and submitted work      |

## 2. Selected Key Prompts

The prompts below summarize the main requests used during the engineering-contract preparation. Repeated short continuation messages are not listed separately.

| No. | Selected Key Prompt                                                                                                                                                                                     | Purpose                                                     | Result and My Review                                                                                                                               |
| --: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Review the Lab 2 handout and explain how many GitHub Issues should be created and in what order.                                                                                                        | Plan the sprint and Git workflow.                           | The AI proposed an Issue decomposition and helped start the engineering-contract Issue. I checked the branch flow against the handout.             |
|   2 | Determine whether the instructor-provided `AGENTS.md` and supporting files must be copied into the repository.                                                                                          | Clarify a repository requirement.                           | The AI initially suggested copying the files, but I questioned the requirement. After checking the handout, the unnecessary files were removed.    |
|   3 | Draft `specification.md` for the TokTickIT Requester Ticketing MVP with numbered Functional Requirements, Business Rules, Given-When-Then Acceptance Criteria, database design, and Definition of Done. | Create the main engineering contract before implementation. | The draft was reviewed section by section. I checked the numbered counts and corrected attachment-storage wording.                                 |
|   4 | Check the approved TokTickIT System-Level SDS and define how Attachment binaries and metadata should be stored.                                                                                         | Resolve an attachment-storage decision.                     | The final decision uses local single-node SeaweedFS for binaries and PostgreSQL for metadata. Original filenames are retained only for display.    |
|   5 | Create `tests.md` with planned unit, API/integration, UI component, UI style, responsive, E2E, and Lab 1 regression tests. Map every Acceptance Criterion to at least one planned test.                 | Prepare Test-Driven Development and traceability.           | The final plan contains 26 planned tests and maps all 42 Acceptance Criteria. I verified the counts using PowerShell.                              |
|   6 | Draft the Zen Green `ui-spec.md` with routes, screen states, validation feedback, responsive behavior, accessibility, and evidence requirements.                                                        | Define the UI contract before implementation.               | I reviewed the draft against the handout and corrected the exact required colors, desktop breakpoint, and Development Requester dropdown behavior. |
|   7 | Draft `api-spec.md` with endpoint paths, request and response examples, query parameters, HTTP statuses, ownership checks, attachment lifecycle rules, and safe errors.                                 | Define the backend contract before coding.                  | The resulting contract contains 11 Lab 2 endpoints. I verified the endpoint summary and retained compatibility with the Lab 1 APIs.                |
|   8 | Initialize `reviewer.md` without inventing reviewer identities, comments, approvals, or Pull Request evidence.                                                                                          | Prepare a truthful peer-review evidence record.             | The document contains pending tables and checklists that will be updated only after real reviews occur.                                            |

## 3. How AI Output Was Checked

I used the following checks before accepting the drafted contract:

* Compared the proposed scope with the Lab 2 handout.
* Compared attachment storage decisions with the approved TokTickIT System-Level SDS.
* Removed repository files that were not explicitly required.
* Checked that Functional Requirements, Business Rules, and Acceptance Criteria use numbered identifiers.
* Verified 30 Functional Requirements, 67 Business Rules, and 42 Acceptance Criteria.
* Verified that all 42 Acceptance Criteria map to planned tests.
* Verified that the test plan contains 26 planned tests.
* Corrected the Zen Green colors to `#006B3C`, `#0B7A46`, and `#EAF6EF`.
* Corrected the desktop breakpoint to `992px` and above.
* Corrected the Development Requester selector to use the required dropdown.
* Verified that the API endpoint summary contains 11 endpoints.
* Kept test results and peer-review evidence marked as pending when they had not yet occurred.

## 4. My Reflection

Using AI helped me turn a long stakeholder handout into structured requirements, business rules, Acceptance Criteria, UI behavior, API contracts, and planned tests. It was especially useful for identifying failure cases, ownership checks, attachment boundaries, and links between Acceptance Criteria and tests.

However, I learned that AI output cannot be accepted without checking it against the original documents. Some early suggestions, such as copying optional files and using different UI values, were not accurate for this assignment. I questioned those suggestions, checked the handout, and corrected the documents. This process showed me that the AI is useful as an engineering assistant, but I am still responsible for the final scope, decisions, implementation, tests, and evidence.

## 5. Future AI Use During Implementation

This file shall be updated during implementation with selected prompts related to:

* Contract and ambiguity review
* Failing-test creation
* Database migration and seed implementation
* Requester context implementation
* Ticket API and UI implementation
* Attachment lifecycle implementation
* Responsive and accessibility review
* Final completion audit

Only prompts that materially influenced the implementation or review shall be retained in the final 6–10 key-prompt table.
