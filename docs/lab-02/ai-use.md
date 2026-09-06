# Lab 2 AI Use Record

## 1. AI Tool and Scope

| Item | Details |
| --- | --- |
| Tool | OpenAI ChatGPT with Codex |
| Use period | Lab 2 specification, implementation, testing, review correction, final verification, and documentation stages |
| Main uses | Contract analysis, implementation assistance, regression-test generation, E2E tooling and test creation, debugging, responsive/accessibility review, and documentation consistency checks |
| Human responsibility | I reviewed the suggestions, checked them against the approved engineering contract, ran the repository commands, inspected browser behavior and evidence, responded to peer review, and remain responsible for the submitted work. |

AI assistance did not independently approve a Pull Request, merge a branch, release the system, or close an Issue. No secret, credential, connection string, or private environment value is recorded in this document.

## 2. Selected Key Prompts and Outcomes

The entries below summarize the material requests used during Lab 2. Repeated continuation and status prompts are omitted.

| No. | Selected Key Prompt | Purpose | Human Review and Outcome |
| ---: | --- | --- | --- |
| 1 | Review the Lab 2 handout and decompose the work into engineering-contract and feature Issues. | Plan scope and Git workflow. | The proposed sequence was checked against the assignment and adjusted before work began. |
| 2 | Draft the numbered Functional Requirements, Business Rules, Given–When–Then Acceptance Criteria, data decisions, and Definition of Done. | Establish the engineering contract before implementation. | Counts, scope boundaries, Attachment storage, Requester ownership, and terminology were manually checked and corrected. |
| 3 | Create a traceable test plan covering unit, API, UI, responsive, E2E, and Lab 1 regression behavior. | Prepare strict TDD coverage. | All 42 AC identifiers were mapped; later documentation was reconciled to the files actually implemented. |
| 4 | Define the Zen Green UI and API contracts, including responsive behavior, accessibility, safe errors, and Attachment lifecycle rules. | Make frontend/backend behavior explicit before coding. | Colors, breakpoints, messages, DTOs, status codes, validation order, and ownership rules were checked against the approved contract. |
| 5 | Add failing tests, then implement Development Requester selection and Requester-owned Ticket creation. | Implement the first Lab 2 increments with RED–GREEN TDD. | Targeted tests, full suites, and builds were executed in the repository before the work advanced. |
| 6 | Clarify and implement My Tickets search, filter, sort, pagination, responsive, and Requester-isolation behavior. | Deliver Issue #17 without expanding into Ticket Detail content. | Human-approved contract clarifications controlled test corrections; deterministic fixture cleanup repaired cross-file test isolation. |
| 7 | Add failing Ticket Detail and Attachment lifecycle tests, then implement the approved backend and frontend behavior. | Deliver Issue #19 with ownership-safe APIs and accessible UI states. | Generated implementation suggestions were constrained by the existing schema, storage adapter, contract messages, and committed RED tests. |
| 8 | Address PR #20 findings with focused regression tests before production fixes. | Repair concurrent Attachment limits, identifier validation, and filename-specific success feedback. | The reviewer findings were reproduced by RED tests and fixed in a separate GREEN commit before re-review and merge. |
| 9 | Create real-browser E2E coverage with isolated data, cleanup, screenshots, responsive widths, and release-smoke checks. | Verify the integrated Requester workflow for Issue #21. | Browser behavior was run against the real application; cleanup was verified to leave zero matching E2E Tickets. |
| 10 | Audit implementation, tests, screenshots, contracts, reviewer history, AI use, and operational documentation for consistency. | Close technical documentation without overstating release status. | Repository paths, AC coverage, Git history, verification totals, limitations, and documentation-only scope were checked with repeatable commands. |

## 3. Human Oversight and Verification

AI-generated analysis and changes were accepted only after human-directed checks:

* Requirements and proposed behavior were compared with `docs/lab-02/specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`.
* Functional Requirement, Business Rule, Acceptance Criterion, endpoint, status-code, and message identifiers were preserved rather than rewritten to fit implementation mistakes.
* Automated tests and production builds were executed in the repository; passing results were not inferred from code inspection.
* Real browser execution was used for the integrated Requester workflow, responsive widths, keyboard-accessible interactions, Attachment preview/download/removal, and retained screenshots.
* Deterministic fixture markers and cleanup were inspected so automated runs did not depend on or erase unrelated Tickets.
* Peer review was used before PR #20 was merged into `lab2-staging`.
* Suggestions were corrected when committed tests, full-suite failures, E2E execution, or reviewer feedback exposed defects.
* Generated documentation was checked for unsupported claims, nonexistent files, absolute local paths, secrets, and release statements that had not occurred.

## 4. Examples of Corrections Made Under Human Direction

The AI did not provide consistently correct output without review. Human direction corrected or rejected suggestions when they conflicted with evidence, including:

* Removing an unrelated `AGENTS.md` instead of treating it as a Lab 2 requirement.
* Correcting test expectations so stable Ticket ordering followed the approved primary sort and same-direction `id` secondary sort.
* Replacing an overly broad date assertion with semantic `<time>` assertions while retaining the Ticket Number and both required dates.
* Repairing parallel API-test fixture isolation after the full suite exposed globally visible records.
* Adding database-boundary concurrency protection after peer review exposed a race in the five-active-Attachment invariant.
* Correcting tablet overflow, invalid-file copy, accessible mobile navigation, and the compiled-server start path after final E2E RED evidence.

## 5. Reflection and Boundaries

AI assistance was useful for turning a large contract into small TDD increments, enumerating boundary cases, diagnosing failures, and keeping frontend, backend, E2E, and documentation evidence aligned. The work also demonstrated why generated suggestions require human scrutiny: plausible output can conflict with exact contract wording, test isolation, concurrency behavior, accessibility semantics, or repository reality.

The temporary `X-Development-Requester-Id` mechanism remains a Lab 2 testing context rather than real authentication. Issue #21 E2E used the existing in-memory Attachment adapter in its scoped test server and did not verify a live SeaweedFS deployment. These limitations are recorded rather than hidden or resolved by changing the contract.
