# Lab 2 Peer Review Record

## 1. Purpose

This document records the peer-review evidence for Lab 2, including reviewer identities, Pull Request links, comments given and received, responses to review feedback, requested changes, and approvals.

Only completed review activity shall be reported as evidence. Pending items must remain marked as `Pending`.

## 2. Current Review Status

| Item                        | Value                               |
| --------------------------- | ----------------------------------- |
| Repository owner            | `@chaproi`                          |
| Engineering-contract Issue  | `#11`                               |
| Engineering-contract branch | `docs/11-lab2-engineering-contract` |
| Integration branch          | `lab2-staging`                      |
| Engineering-contract PR       | #12                               |
| Assigned peer reviewer        | @cottonlnwza                       |
| Review status | Changes requested; fixes pushed; awaiting re-review |
| Final release PR            | Pending                             |

## 3. Reviewers

| Reviewer Name | GitHub Username | Role                                | Confirmed |
| ------------- | --------------- | ----------------------------------- | --------- |
| Not recorded  | @cottonlnwza    | Reviews my Lab 2 Pull Requests   | Yes       |
| Pending       | Pending         | Student whose Pull Request I review | No        |

Reviewer information shall be replaced with the real identity after review assignment or participation.

## 4. Pull Requests Received for Review

Use this table for Pull Requests from other students that I review.

| Date    | Student / GitHub User | Repository | Pull Request | Scope Reviewed | Review Result |
| ------- | --------------------- | ---------- | ------------ | -------------- | ------------- |
| Pending | Pending               | Pending    | Pending      | Pending        | Pending       |

## 5. Comments Given to Other Students

| Date    | Pull Request | File or Topic | Review Comment | Resolution |
| ------- | ------------ | ------------- | -------------- | ---------- |
| Pending | Pending      | Pending       | Pending        | Pending    |

Review comments should be specific, actionable, and related to requirements, correctness, tests, security, maintainability, or UI behavior.

## 6. Reviews Received on My Pull Requests

| Date    | Reviewer | Pull Request | Scope   | Result  | Approval Link |
| ------- | -------- | ------------ | ------- | ------- | ------------- |
| 2026-09-04 | @cottonlnwza | #12 | Engineering contract consistency | Changes requested | Not approved |
| 2026-09-04 | @cottonlnwza | #12 | Remaining contract inconsistencies | Changes requested | Not approved |

## 7. Comments Received and My Responses

| Date    | Pull Request | Reviewer Comment | My Response or Change | Commit / Evidence | Resolved |
| ------- | ------------ | ---------------- | --------------------- | ----------------- | -------- |
| 2026-09-04 | #12 | Contract names, response shapes, and Category ordering were inconsistent across documents. | Standardized `name`, `currentStatus`, `originalFilename`, `sortOrder`, `fields`, and `removalReason`; aligned the Create Ticket response and Category ordering. | Commit 256f8bc | Yes |
| 2026-09-04 | #12 | Duplicate heading and remaining response, attachment, removal, query, and ordering inconsistencies. | Removed the duplicate heading; aligned Create, List, Detail, and Attachment response shapes; standardized query and ordering rules; and clarified idempotency, unknown-field rejection, and preview/download behavior. | Commits 3b50309 and e02a757 | No |

A comment shall be marked resolved only after the requested clarification or change has been completed and verified.

## 8. Pull Request Approval Record

| Pull Request         | Source Branch                       | Target Branch  | Reviewer | Approval Status | Merge Status |
| -------------------- | ----------------------------------- | -------------- | -------- | --------------- | ------------ |
| Engineering contract | `docs/11-lab2-engineering-contract` | `lab2-staging` | @cottonlnwza | Changes requested | Not merged |
| Lab 2 release        | `lab2-staging`                      | `main`         | Pending  | Pending         | Not merged   |

Additional feature Pull Requests shall be added during implementation.

## 9. Reviewer Checklist

For each Pull Request, the reviewer should verify the applicable items:

* [ ] The Pull Request is linked to the correct GitHub Issue.
* [ ] The source and target branches follow the required Lab 2 workflow.
* [ ] The change remains within the Issue scope.
* [ ] The implementation follows `specification.md`.
* [ ] API behavior follows `api-spec.md`.
* [ ] UI behavior follows `ui-spec.md`.
* [ ] Tests follow `tests.md`.
* [ ] Acceptance Criteria covered by the Pull Request are identified.
* [ ] Relevant automated tests pass.
* [ ] Existing Lab 1 behavior remains operational.
* [ ] No required test is skipped, disabled, or commented out.
* [ ] Validation and ownership checks are enforced in the backend.
* [ ] Errors do not expose sensitive implementation details.
* [ ] UI changes are responsive and use the Zen Green specification.
* [ ] No unrelated Lab 3 functionality is included.
* [ ] Review comments have been answered or resolved.
* [ ] The reviewer has approved the final revision.

## 10. Final Peer-Review Declaration

Current status: **Pending**

Before Lab 2 submission, this section shall be updated to confirm:

* All required feature Pull Requests entered `lab2-staging` through peer review.
* Review comments were addressed and resolved.
* Required approvals were recorded.
* The release Pull Request from `lab2-staging` to `main` was reviewed.
* The rendered evidence in this document matches the actual GitHub history.

No peer-review completion is claimed at the engineering-contract preparation stage.
