# Lab 2 Peer Review Record

## 1. Purpose

This document records peer-review evidence that is supported by the repository history and confirmed review activity. Pending events remain explicitly marked `Pending`; no Issue #21 approval, release, or closure is claimed.

## 2. Current Review Status

| Item | Value |
| --- | --- |
| Repository owner | `@chaproi` |
| Engineering-contract Issue | `#11` |
| Engineering-contract PR | `#12` |
| Ticket Detail and Attachment Issue | `#19` |
| Ticket Detail and Attachment PR | `#20` |
| Final verification Issue | `#21` |
| Integration branch | `lab2-staging` |
| Confirmed peer reviewer | `@cottonlnwza` |
| PR #20 status | Re-reviewed, approved, and merged into `lab2-staging` |
| Issue #21 peer review | Pending |
| Final release PR and approval | Pending |

The reviewer's real name was not recorded, so this document retains only the confirmed GitHub username.

## 3. Pull Requests Received for Review

No completed evidence of a Pull Request from another student reviewed by this repository owner is recorded here. That required activity remains pending and must not be inferred from reviews received on this repository.

## 4. Reviews Received on This Repository

| Date | Reviewer | Pull Request | Scope | Result | Evidence |
| --- | --- | --- | --- | --- | --- |
| 2026-09-04 | `@cottonlnwza` | #12 | Engineering-contract consistency | Changes requested | Contract response-shape, naming, ordering, and consistency findings were recorded in the existing review history. |
| 2026-09-04 | `@cottonlnwza` | #12 | Remaining engineering-contract inconsistencies | Changes requested | Follow-up corrections were recorded in commits `3b50309` and `e02a757`. |
| 2026-09-06 | `@cottonlnwza` | #20 | Ticket Detail and Attachment lifecycle | Changes requested | Findings covered concurrent active-Attachment enforcement, strict identifier validation, and filename-specific accessible success feedback. |
| 2026-09-06 | `@cottonlnwza` | #20 | Corrected Ticket Detail and Attachment lifecycle | Approved | RED–GREEN corrections were re-reviewed before PR #20 was merged into `lab2-staging`. |

The local Git history confirms merge commit `c60c3dc` for PR #20. It also confirms merge commit `0264d31` for PR #12; the current record does not add an approval claim for PR #12 beyond the review evidence listed above.

## 5. Review Findings and Resolutions

### 5.1 Engineering Contract — PR #12

| Finding | Response | Commit Evidence | Status |
| --- | --- | --- | --- |
| Contract names, response shapes, and Category ordering were inconsistent across documents. | Standardized `name`, `currentStatus`, `originalFilename`, `sortOrder`, `fields`, and `removalReason`; aligned the Create Ticket response and Category ordering. | `256f8bc` | Resolved |
| Duplicate heading and remaining response, Attachment, removal, query, and ordering inconsistencies. | Removed the duplicate heading; aligned Create, List, Detail, and Attachment shapes; standardized query and ordering rules; clarified idempotency, unknown-field rejection, and preview/download behavior. | `3b50309`, `e02a757` | Resolved in the merged contract branch |

### 5.2 Ticket Detail and Attachment Lifecycle — PR #20

| Requested Change | RED Regression Evidence | GREEN Resolution | Status |
| --- | --- | --- | --- |
| Concurrent uploads could exceed the five-active-Attachment maximum. | Commit `9101d26` added a concurrent upload regression that required exactly one success, one contract conflict, five final active metadata rows, and no orphaned stored content. | Commit `53edc40` enforced the invariant at the PostgreSQL transaction boundary and retained storage compensation. | Resolved and approved |
| Attachment upload did not apply the contract's strict Requester and Ticket identifier validation in every case. | Commit `9101d26` added missing, blank, malformed, non-integer, zero, negative, inactive, nonexistent, and ownership-safe regression cases. | Commit `53edc40` aligned upload validation and safe error mapping with the approved API contract. | Resolved and approved |
| Upload and removal feedback did not include the filename-specific accessible information required by the UI contract. | Commit `9101d26` tightened the component assertions for successful feedback. | Commit `53edc40` included the affected filename in the accessible Upload and Remove status messages. | Resolved and approved |

The PR #20 findings were handled as a separate RED commit followed by the minimum GREEN production correction. Existing assertions were not disabled or weakened.

## 6. Final E2E and Release Audit — Issue #21

The final integration audit found four release blockers:

* Tablet-width horizontal overflow.
* Incorrect invalid-file feedback copy.
* Missing accessible mobile navigation.
* A broken compiled production-server start path.

Commit `e750e61` added failing E2E and regression coverage for these findings. Commit `0f4d48d` supplied the GREEN corrections. The subsequent verification passed 6/6 E2E scenarios, 58/58 client tests, 106/106 server tests, both production builds, and the compiled-server start smoke test. Screenshot evidence is indexed in `docs/lab-02/tests.md`.

This technical result is not a peer-review or release decision. Issue #21 has not yet been peer-reviewed, approved, merged, released, or closed.

## 7. Pull Request Approval Record

| Pull Request | Source Branch | Target Branch | Reviewer | Approval Status | Merge Status |
| --- | --- | --- | --- | --- | --- |
| #12 Engineering contract | `docs/11-lab2-engineering-contract` | `lab2-staging` | `@cottonlnwza` | Changes-requested history retained; final approval not added without evidence | Merged (`0264d31`) |
| #20 Ticket Detail and Attachment lifecycle | `feat/19-ticket-detail` | `lab2-staging` | `@cottonlnwza` | Approved after requested changes | Merged (`c60c3dc`) |
| Issue #21 final verification/release | `test/21-lab2-final-integration` | Pending | Pending | Pending | Not merged |
| Lab 2 release | `lab2-staging` | `main` | Pending | Pending | Not merged |

## 8. Remaining Review Checklist

Before Lab 2 release, the Issue #21 reviewer should confirm:

* [ ] The change is linked to Issue #21 and targets the intended integration/release flow.
* [ ] The implementation and evidence still follow `specification.md`, `api-spec.md`, `ui-spec.md`, and `tests.md`.
* [ ] The recorded automated results and tracked screenshots are reproducible.
* [ ] Existing Lab 1 behavior remains operational.
* [ ] No tests are skipped, disabled, or weakened.
* [ ] Ownership checks and safe errors remain enforced.
* [ ] Responsive and Zen Green evidence is acceptable.
* [ ] The remaining live-storage limitation is understood.
* [ ] Final approval is recorded before merge or release.

## 9. Final Peer-Review Declaration

Current status: **Pending for Issue #21 and release**.

PR #20's requested changes were resolved, re-reviewed, approved, and merged. Issue #21 technical verification is complete on its branch, but its peer review, Pull Request, merge, release approval, release, and Issue closure have not occurred.
