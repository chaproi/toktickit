# Lab 3 REST API Specification

## 1. Purpose and Base Conventions

This document defines the 31 approved Lab 3 API operations. All routes use the /api prefix. JSON property names use camelCase. Timestamps are backend-generated ISO 8601 UTC strings. Identifiers are positive decimal integers unless stated otherwise. Unknown JSON fields, unknown query parameters, and repeated query parameters are rejected.

The browser sends credentials with same-origin requests. There is no bearer token in JSON, localStorage, sessionStorage, or a URL.

### 1.1 Content Types

- JSON request: Content-Type: application/json.
- JSON response: Content-Type: application/json.
- Attachment upload: multipart/form-data with one field named file.
- Attachment content: the stored approved MIME type plus X-Content-Type-Options: nosniff.
- A successful 204 response has no body.

### 1.2 Authentication Cookies

| Cookie | Purpose | Attributes |
| --- | --- | --- |
| tocktickit_session | Raw 32-byte opaque session token | HttpOnly; SameSite=Strict; Path=/; Secure outside localhost; Max-Age no later than absolute expiry |
| tocktickit_csrf | Raw random CSRF token | SameSite=Strict; Path=/; Secure outside localhost; same expiry; intentionally readable so the client can echo it |

Only SHA-256 digests of both values are stored. Authenticated unsafe methods require X-CSRF-Token equal to the CSRF cookie and its stored digest. Credentialed CORS allows only the configured same-site client origin. Unsafe requests also require an allowed Origin.

### 1.3 Session and Password-Change Gate

- Absolute session lifetime: 8 hours.
- Idle lifetime: 30 minutes.
- lastSeenAt may be updated at most once every 5 minutes.
- Expired, revoked, unknown, or inactive-user sessions return 401 AUTHENTICATION_REQUIRED.
- A valid session whose User has mustChangePassword=true may call only OP-05 Current User, OP-06 Logout, and OP-07 Change Password. Other protected operations return 403 PASSWORD_CHANGE_REQUIRED.

### 1.4 Safe User Shapes

Authenticated User:

    {
      "id": 21,
      "name": "Alex Morgan",
      "email": "alex.morgan@example.com",
      "role": "REQUESTER",
      "mustChangePassword": false
    }

Public author or owner summary:

    {
      "id": 31,
      "name": "Mina Patel",
      "role": "IT_STAFF"
    }

No response contains passwordHash, a raw password, a session/CSRF token, LoginThrottle data, or internal session identifiers.

## 2. Common Errors and Validation Order

### 2.1 Error Shape

    {
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Please correct the highlighted fields.",
        "fields": {
          "name": "Name must contain 2 to 120 characters."
        },
        "requestId": "optional-safe-correlation-id"
      }
    }

fields and requestId are optional. Internal exceptions, Prisma/SQL text, database URLs, storage keys, paths, hashes, cookies, passwords, CSRF tokens, and protected resource existence are never returned.

### 2.2 Status Semantics

| Status | Use |
| --- | --- |
| 200 OK | Retrieval or successful/idempotent update |
| 201 Created | New Ticket, Attachment, Comment, Note, or User |
| 204 No Content | Successful Logout |
| 400 Bad Request | Invalid body, path, or query |
| 401 Unauthorized | No live authenticated session or invalid login credentials |
| 403 Forbidden | Role denial, inactive valid credentials, forced-password gate, or invalid CSRF |
| 404 Not Found | Missing resource or ownership-safe protected resource |
| 409 Conflict | Stale write, duplicate email, invalid current state, or safety invariant |
| 410 Gone | Removed owned Attachment content |
| 413 Content Too Large | Attachment over 5,000,000 bytes |
| 415 Unsupported Media Type | Attachment type not permitted |
| 429 Too Many Requests | Login throttle active |
| 500 Internal Server Error | Safe unexpected failure |
| 503 Service Unavailable | Required database, hashing, or storage dependency unavailable |

### 2.3 Protected Request Order

For a protected request, the server performs this order:

1. Resolve and validate the session and active User.
2. Enforce the mandatory password-change gate.
3. Validate CSRF and Origin for unsafe methods.
4. Enforce operation-level role permission before resource lookup when the role is never eligible.
5. Validate path, query, and body syntax and reject unknown input.
6. Apply ownership-aware lookup for Requester-owned resources or general lookup for Staff/Admin operations.
7. Validate current state, references, expectedUpdatedAt, and business invariants.
8. Perform the transaction and return an explicit DTO.

## 3. Endpoint Catalog

| Operation | Method and path | Authentication | Permitted role | Success |
| --- | --- | --- | --- | --- |
| OP-01 | GET /api/health | No | Public | 200 |
| OP-02 | GET /api/categories | No | Public | 200 |
| OP-03 | GET /api/related-systems | No | Public | 200 |
| OP-04 | POST /api/auth/login | No | Public | 200 |
| OP-05 | GET /api/auth/me | Yes | Any active User, including forced-change | 200 |
| OP-06 | POST /api/auth/logout | Session if present; CSRF if live | Any | 204 |
| OP-07 | POST /api/auth/change-password | Yes + CSRF | Any active User, including forced-change | 200 |
| OP-08 | POST /api/tickets | Yes + CSRF | Requester | 201 or replay 200 |
| OP-09 | GET /api/tickets | Yes | Requester | 200 |
| OP-10 | GET /api/tickets/:ticketId | Yes | Requester owner | 200 |
| OP-11 | POST /api/tickets/:ticketId/attachments | Yes + CSRF | Requester owner | 201 |
| OP-12 | GET /api/tickets/:ticketId/attachments | Yes | Requester owner, IT Staff, Administrator | 200 |
| OP-13 | GET /api/tickets/:ticketId/attachments/:attachmentId | Yes | Requester owner, IT Staff, Administrator | 200 |
| OP-14 | GET /api/tickets/:ticketId/attachments/:attachmentId/content | Yes | Requester owner, IT Staff, Administrator | 200 |
| OP-15 | DELETE /api/tickets/:ticketId/attachments/:attachmentId | Yes + CSRF | Requester owner | 200 |
| OP-16 | GET /api/tickets/:ticketId/comments | Yes | Requester owner, IT Staff, Administrator | 200 |
| OP-17 | POST /api/tickets/:ticketId/comments | Yes + CSRF | Requester owner, IT Staff, Administrator | 201 |
| OP-18 | POST /api/tickets/:ticketId/resolution-indication | Yes + CSRF | Requester owner | 200 |
| OP-19 | GET /api/staff/tickets | Yes | IT Staff, Administrator | 200 |
| OP-20 | GET /api/staff/tickets/:ticketId | Yes | IT Staff, Administrator | 200 |
| OP-21 | GET /api/staff/assignees | Yes | IT Staff, Administrator | 200 |
| OP-22 | POST /api/staff/tickets/:ticketId/claim | Yes + CSRF | IT Staff, Administrator | 200 |
| OP-23 | PATCH /api/staff/tickets/:ticketId/owner | Yes + CSRF | IT Staff, Administrator | 200 |
| OP-24 | PATCH /api/staff/tickets/:ticketId/it-priority | Yes + CSRF | IT Staff, Administrator | 200 |
| OP-25 | PATCH /api/staff/tickets/:ticketId/status | Yes + CSRF | IT Staff, Administrator | 200 |
| OP-26 | GET /api/staff/tickets/:ticketId/notes | Yes | IT Staff, Administrator | 200 |
| OP-27 | POST /api/staff/tickets/:ticketId/notes | Yes + CSRF | IT Staff, Administrator | 201 |
| OP-28 | GET /api/admin/users | Yes | Administrator | 200 |
| OP-29 | POST /api/admin/users | Yes + CSRF | Administrator | 201 |
| OP-30 | PATCH /api/admin/users/:userId | Yes + CSRF | Administrator | 200 |
| OP-31 | POST /api/admin/users/:userId/initial-password | Yes + CSRF | Administrator | 200 |

## 4. Public and Authentication Operations

### OP-01 Health

GET /api/health preserves the Lab 1 response and returns 200. It exposes no environment, database, or authentication detail.

### OP-02 Categories and OP-03 Related Systems

GET /api/categories preserves the Lab 1 array shape and ordering. GET /api/related-systems returns active records ordered by name ascending. Both return items shaped as { id, name }, may return an empty array, and use safe 500/503 failures.

### OP-04 Login

Request:

    {
      "email": "alex.morgan@example.com",
      "password": "runtime-supplied-value"
    }

Validation:

- Only email and password are permitted.
- Email is required, trimmed, lowercased, syntactically valid, and at most 254 characters.
- Password is required and accepted as a string up to 128 characters for verification; login does not reveal which rule is wrong.
- Five failures per normalized-email-and-IP key in 15 minutes trigger the documented 15-minute block.

Success 200 sets both cookies and returns:

    {
      "user": {
        "id": 21,
        "name": "Alex Morgan",
        "email": "alex.morgan@example.com",
        "role": "REQUESTER",
        "mustChangePassword": true
      },
      "session": {
        "expiresAt": "2026-09-17T16:00:00.000Z"
      }
    }

Failures:

| Status | Code | Condition |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Missing, non-string, oversized, or unknown field |
| 401 | INVALID_CREDENTIALS | Unknown/malformed email or wrong password; same message |
| 403 | ACCOUNT_INACTIVE | Correct password for inactive User |
| 429 | LOGIN_THROTTLED | Key is blocked; response includes retryAfterSeconds, never account data |
| 500/503 | INTERNAL_ERROR or SERVICE_UNAVAILABLE | Safe dependency failure |

### OP-05 Current User

GET /api/auth/me returns 200 with the same user and session object as Login. It is allowed during forced password change. It returns 401 AUTHENTICATION_REQUIRED for a non-live session.

### OP-06 Logout

POST /api/auth/logout has no body. If a live session cookie exists, CSRF and Origin are required and the session row is deleted. It clears both cookies and returns 204. With no session cookie it remains an idempotent 204 and clears cookies; a malformed or unknown cookie does not reveal whether a session existed.

### OP-07 Change Password

Request:

    {
      "currentPassword": "runtime-current-value",
      "newPassword": "runtime-new-value",
      "confirmPassword": "runtime-new-value"
    }

Only these fields are allowed. The new values must match and meet the 12–128 character, three-category, non-whitespace, different-from-current rule. A wrong current password returns 400 INVALID_CURRENT_PASSWORD without changing data. Field violations return 400 VALIDATION_ERROR.

Success atomically replaces the hash, clears mustChangePassword, records passwordChangedAt, revokes all sessions, issues a new session/cookies, and returns 200 with the Login response shape and mustChangePassword false.

## 5. Requester Ticket Operations

The Requester identity always comes from the session. X-Development-Requester-Id is ignored as identity and must not change the result. requesterId and other system fields in JSON are rejected as unknown fields.

### Shared Requester Ticket DTO

    {
      "id": 101,
      "ticketNumber": "TKT-2026-00001",
      "ticketDate": "2026-09-17T08:00:00.000Z",
      "requester": { "id": 21, "name": "Alex Morgan" },
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "MEDIUM",
      "itPriority": "MEDIUM",
      "currentStatus": "NEW",
      "owner": null,
      "summary": "Laptop battery drains quickly",
      "description": "The battery loses charge within one hour.",
      "requesterResolutionIndicatedAt": null,
      "createdAt": "2026-09-17T08:00:00.000Z",
      "updatedAt": "2026-09-17T08:00:00.000Z"
    }

owner, when present, uses the public owner summary. requesterResolutionIndicatedById is not separately exposed to Requesters because the actor is necessarily the owner Requester.

### OP-08 Create Ticket

Request:

    {
      "clientSubmissionId": "5b7f6b32-e929-4ac8-9c95-079956888f2f",
      "categoryId": 2,
      "relatedSystemId": 7,
      "requestedPriority": "MEDIUM",
      "summary": "Laptop battery drains quickly",
      "description": "The battery loses charge within one hour."
    }

Lab 2 validation remains: UUID; active positive reference ids; LOW/MEDIUM/HIGH/URGENT; trimmed Summary 5–150; trimmed Description 10–5,000. First creation returns 201 { ticket: RequesterTicketDTO, replayed: false }. An identical retry for the same authenticated Requester returns 200 and replayed true. Changed reuse returns 409 IDEMPOTENCY_CONFLICT. The transaction sets requesterId from the session, status NEW, owner null, and itPriority equal to requestedPriority.

### OP-09 My Tickets

GET /api/tickets supports the preserved query:

| Parameter | Default | Allowed |
| --- | --- | --- |
| search | empty | Trimmed max 100; Ticket Number or Summary |
| categoryId | empty | Positive integer |
| relatedSystemId | empty | Positive integer |
| requestedPriority | empty | LOW, MEDIUM, HIGH, URGENT |
| currentStatus | empty | Any Lab 3 TicketStatus |
| sortBy | updatedAt | ticketNumber, ticketDate, updatedAt, summary, requestedPriority |
| sortOrder | desc | asc, desc |
| page | 1 | Positive integer |
| pageSize | 10 | 10, 25, 50 |

Only authenticatedUser.id Tickets contribute to items or counts. Default and stable sorting retain Lab 2 rules. The list item is the shared DTO without description and requesterResolutionIndicatedAt. Response:

    {
      "items": [],
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 0,
        "totalPages": 0,
        "hasPreviousPage": false,
        "hasNextPage": false
      }
    }

Invalid query returns 400 INVALID_QUERY. A valid unmatched id/filter or page beyond the end returns 200 with an empty items array and accurate metadata.

### OP-10 Requester Ticket Detail

GET /api/tickets/:ticketId returns the shared Requester Ticket DTO for an owned Ticket. Malformed id returns 400 INVALID_TICKET_ID. Missing and non-owned Tickets both return 404 TICKET_NOT_FOUND with “Ticket not found.”

## 6. Attachment Operations

The metadata response preserves the Lab 2 public property names even though database columns use User terminology:

    {
      "id": 501,
      "ticketId": 101,
      "originalFilename": "battery-report.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 245760,
      "uploadedByRequesterId": 21,
      "isRemoved": false,
      "createdAt": "2026-09-17T08:05:00.000Z",
      "removedAt": null,
      "removedByRequesterId": null,
      "removalReason": null
    }

Storage keys and internal URLs are never returned. For a Requester, parent Ticket ownership is required. IT Staff and Administrators may read all Ticket Attachments. Role denial for mutation is 403 before Ticket lookup; protected read mismatches use 404 ATTACHMENT_NOT_FOUND.

### OP-11 Upload Attachment

POST /api/tickets/:ticketId/attachments accepts exactly one multipart file field. Requester owner only. Lab 2 rules remain: JPG/JPEG, PNG, WEBP, or PDF; extension plus detected content; 1–5,000,000 bytes; at most five active Attachments; atomic storage/metadata with compensation. Success 201 returns metadata.

Failures include 400 FILE_REQUIRED/INVALID_TICKET_ID, 404 TICKET_NOT_FOUND, 409 ATTACHMENT_LIMIT_REACHED, 413 ATTACHMENT_TOO_LARGE, 415 UNSUPPORTED_ATTACHMENT_TYPE, and safe 500/503.

### OP-12 List Attachment Metadata

GET /api/tickets/:ticketId/attachments returns 200 { items: AttachmentMetadata[] }. Active entries precede removed entries; within each group order is createdAt ascending then id ascending. An eligible Ticket with none returns an empty array.

### OP-13 Get Attachment Metadata

GET /api/tickets/:ticketId/attachments/:attachmentId returns one metadata object. The Attachment must belong to the path Ticket. Malformed ids return 400; protected mismatch returns 404 ATTACHMENT_NOT_FOUND.

### OP-14 Attachment Content

GET /api/tickets/:ticketId/attachments/:attachmentId/content accepts disposition=inline or attachment, default attachment. It returns the binary with safe Content-Type, Content-Length, Content-Disposition, and nosniff. Invalid disposition returns 400 INVALID_DISPOSITION. Removed eligible content returns 410 ATTACHMENT_REMOVED. Missing, mismatched, or unauthorized content returns 404 without storage access.

### OP-15 Soft-Remove Attachment

DELETE /api/tickets/:ticketId/attachments/:attachmentId accepts only:

    { "removalReason": "Uploaded the wrong document." }

Requester owner only. The trimmed reason is 5–200 characters. Success 200 returns retained metadata. Repeated removal returns 409 ATTACHMENT_ALREADY_REMOVED. Database removal blocks access before best-effort binary cleanup, preserving Lab 2 behavior.

## 7. Public Comments and Requester Resolution

### Shared paginated communication query

OP-16 and OP-26 accept page (default 1) and pageSize (default 20; allowed 20, 50, 100), no other or repeated query parameters. Entries sort createdAt ascending then id ascending. totalPages is zero when totalItems is zero.

### OP-16 List Public Comments

GET /api/tickets/:ticketId/comments returns:

    {
      "items": [
        {
          "id": 801,
          "ticketId": 101,
          "author": { "id": 21, "name": "Alex Morgan", "role": "REQUESTER" },
          "content": "The issue occurs after sleep mode.",
          "createdAt": "2026-09-17T09:00:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 20,
        "totalItems": 1,
        "totalPages": 1,
        "hasPreviousPage": false,
        "hasNextPage": false
      }
    }

Requester requires owned Ticket; IT Staff/Admin may read any Ticket. Missing or protected mismatch returns 404 TICKET_NOT_FOUND.

### OP-17 Add Public Comment

POST /api/tickets/:ticketId/comments accepts only:

    { "content": "The issue occurs after sleep mode." }

Trimmed content is 1–2,000 characters. Success 201 returns the new Comment DTO. Author and time come from the backend. Empty/oversized/unknown fields return 400 VALIDATION_ERROR. Content is stored and returned as plain data; HTML/Markdown execution is not supported.

### OP-18 Problem Appears Resolved

POST /api/tickets/:ticketId/resolution-indication accepts only:

    { "confirm": true }

Requester owner only. confirm must be true. Eligible statuses are OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, and REOPENED. Success and same-cycle replay return 200:

    {
      "ticketId": 101,
      "currentStatus": "IN_PROGRESS",
      "requesterResolutionIndicatedAt": "2026-09-17T10:00:00.000Z"
    }

The operation never changes status. Invalid state returns 409 RESOLUTION_INDICATION_NOT_ALLOWED; missing/non-owned Ticket returns 404.

## 8. Staff Queue and Operational Ticket Operations

IT Staff and Administrators are explicitly permitted. Requesters receive 403 ROLE_FORBIDDEN before Ticket lookup.

### OP-19 Ticket Queue

GET /api/staff/tickets query:

| Parameter | Default | Allowed |
| --- | --- | --- |
| search | empty | Trimmed max 100; Ticket Number, Summary, Requester name, Requester email |
| categoryId | empty | Positive integer |
| relatedSystemId | empty | Positive integer |
| requestedPriority | empty | LOW, MEDIUM, HIGH, URGENT |
| itPriority | empty | LOW, MEDIUM, HIGH, URGENT |
| currentStatus | empty | Any Lab 3 TicketStatus |
| owner | empty | unassigned, me, or positive eligible User id |
| sortBy | updatedAt | ticketNumber, ticketDate, updatedAt, requestedPriority, itPriority, currentStatus |
| sortOrder | desc | asc, desc |
| page | 1 | Positive integer |
| pageSize | 10 | 10, 25, 50 |

Default order is updatedAt descending then id descending. Every sort uses id in the same direction. Priority order is LOW, MEDIUM, HIGH, URGENT. Status order is NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, REOPENED, RESOLVED, CLOSED, CANCELLED.

Queue item:

    {
      "id": 101,
      "ticketNumber": "TKT-2026-00001",
      "ticketDate": "2026-09-17T08:00:00.000Z",
      "summary": "Laptop battery drains quickly",
      "requester": { "id": 21, "name": "Alex Morgan", "email": "alex.morgan@example.com" },
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "MEDIUM",
      "itPriority": "HIGH",
      "currentStatus": "IN_PROGRESS",
      "owner": { "id": 31, "name": "Mina Patel", "role": "IT_STAFF" },
      "requesterResolutionIndicatedAt": null,
      "updatedAt": "2026-09-17T10:00:00.000Z"
    }

Response:

    {
      "items": [],
      "counts": { "matching": 0, "unassigned": 0, "mine": 0 },
      "pagination": {
        "page": 1,
        "pageSize": 10,
        "totalItems": 0,
        "totalPages": 0,
        "hasPreviousPage": false,
        "hasNextPage": false
      }
    }

matching is totalItems after all filters. unassigned and mine apply the same search/category/system/priority/status filters but replace the owner filter, so the simple counts remain meaningful. Invalid query returns 400 INVALID_QUERY. Valid unmatched references return 200 empty.

### OP-20 Operational Ticket Detail

GET /api/staff/tickets/:ticketId returns:

    {
      "id": 101,
      "ticketNumber": "TKT-2026-00001",
      "ticketDate": "2026-09-17T08:00:00.000Z",
      "requester": { "id": 21, "name": "Alex Morgan", "email": "alex.morgan@example.com" },
      "category": { "id": 2, "name": "Hardware" },
      "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
      "requestedPriority": "MEDIUM",
      "itPriority": "HIGH",
      "currentStatus": "IN_PROGRESS",
      "owner": { "id": 31, "name": "Mina Patel", "role": "IT_STAFF" },
      "summary": "Laptop battery drains quickly",
      "description": "The battery loses charge within one hour.",
      "requesterResolutionIndicatedAt": null,
      "createdAt": "2026-09-17T08:00:00.000Z",
      "updatedAt": "2026-09-17T10:00:00.000Z",
      "allowedStatusTransitions": ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
      "statusHistory": [
        {
          "id": 901,
          "fromStatus": "OPEN",
          "toStatus": "IN_PROGRESS",
          "reason": null,
          "actor": { "id": 31, "name": "Mina Patel", "role": "IT_STAFF" },
          "createdAt": "2026-09-17T09:30:00.000Z"
        }
      ]
    }

History sorts oldest first. Attachment, Comment, and Note collections use their separate endpoints. Missing Ticket returns 404 TICKET_NOT_FOUND.

### OP-21 Eligible Assignees

GET /api/staff/assignees returns active IT Staff and Administrators ordered by name ascending then id ascending:

    { "items": [{ "id": 31, "name": "Mina Patel", "role": "IT_STAFF" }] }

No email or credential field is needed. Empty items is valid.

### Shared Mutation Summary

OP-22 through OP-25 return:

    {
      "ticket": {
        "id": 101,
        "owner": { "id": 31, "name": "Mina Patel", "role": "IT_STAFF" },
        "requestedPriority": "MEDIUM",
        "itPriority": "HIGH",
        "currentStatus": "IN_PROGRESS",
        "requesterResolutionIndicatedAt": null,
        "updatedAt": "2026-09-17T10:05:00.000Z"
      }
    }

### OP-22 Claim Ticket

POST /api/staff/tickets/:ticketId/claim accepts only:

    { "expectedUpdatedAt": "2026-09-17T10:00:00.000Z" }

Ticket must not be CLOSED or CANCELLED. Unassigned becomes owned by authenticated User. Already owned by caller is idempotent 200 even if expectedUpdatedAt is unchanged from the caller’s current representation. Another owner returns 409 OWNER_CONFLICT; stale unassigned state returns 409 STALE_WRITE.

### OP-23 Assign, Reassign, or Unassign

PATCH /api/staff/tickets/:ticketId/owner accepts:

    {
      "ownerId": 32,
      "expectedUpdatedAt": "2026-09-17T10:00:00.000Z"
    }

ownerId may be null only for NEW, OPEN, or REOPENED. A non-null target must be active IT Staff or Administrator. CLOSED/CANCELLED cannot change owner. Failures: 400 VALIDATION_ERROR, 404 TICKET_NOT_FOUND or OWNER_NOT_FOUND, 409 OWNER_CHANGE_NOT_ALLOWED or STALE_WRITE.

### OP-24 Update IT Priority

PATCH /api/staff/tickets/:ticketId/it-priority accepts:

    {
      "itPriority": "HIGH",
      "expectedUpdatedAt": "2026-09-17T10:00:00.000Z"
    }

Allowed priority values are LOW, MEDIUM, HIGH, URGENT. CLOSED and CANCELLED reject with 409 TERMINAL_TICKET. Requested Priority never changes. Repeating the existing value returns idempotent 200 if expectedUpdatedAt matches.

### OP-25 Update Status

PATCH /api/staff/tickets/:ticketId/status accepts exactly:

    {
      "targetStatus": "RESOLVED",
      "confirm": true,
      "reason": null,
      "expectedUpdatedAt": "2026-09-17T10:00:00.000Z"
    }

targetStatus and expectedUpdatedAt are required. confirm defaults false when omitted. reason may be omitted/null except CANCELLED, where trimmed 5–500 is required. Unknown fields fail.

Allowed transitions:

| Current | Target |
| --- | --- |
| NEW | OPEN, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | IN_PROGRESS, RESOLVED, CANCELLED |
| RESOLVED | CLOSED, REOPENED |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| CLOSED | none |
| CANCELLED | none |

OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, and REOPENED require an active owner. RESOLVED, CLOSED, and CANCELLED require confirm=true. Success updates Ticket and creates exactly one status-history row in one transaction. REOPENED clears the resolution indication. Failures include 409 STATUS_TRANSITION_NOT_ALLOWED, STATUS_OWNER_REQUIRED, STATUS_CONFIRMATION_REQUIRED, STATUS_UNCHANGED, TERMINAL_TICKET, or STALE_WRITE.

## 9. Internal Notes

### OP-26 List Internal Notes

GET /api/staff/tickets/:ticketId/notes uses the shared communication query and returns:

    {
      "items": [
        {
          "id": 1001,
          "ticketId": 101,
          "author": { "id": 31, "name": "Mina Patel", "role": "IT_STAFF" },
          "content": "Battery health report requested from inventory team.",
          "createdAt": "2026-09-17T09:45:00.000Z"
        }
      ],
      "pagination": {
        "page": 1,
        "pageSize": 20,
        "totalItems": 1,
        "totalPages": 1,
        "hasPreviousPage": false,
        "hasNextPage": false
      }
    }

Requester role receives 403 ROLE_FORBIDDEN before Ticket lookup. Missing Ticket for eligible roles returns 404 TICKET_NOT_FOUND.

### OP-27 Add Internal Note

POST /api/staff/tickets/:ticketId/notes accepts only { "content": "..." }. Trimmed length is 1–5,000. Success 201 returns one Note DTO. Content is inert text. Notes cannot be edited or deleted.

## 10. Administrator User Management

Only Administrators may use OP-28 through OP-31. Other authenticated roles receive 403 ROLE_FORBIDDEN before User lookup. User responses never contain password/session fields.

### User Management DTO

    {
      "id": 21,
      "name": "Alex Morgan",
      "email": "alex.morgan@example.com",
      "role": "REQUESTER",
      "isActive": true,
      "mustChangePassword": false,
      "createdAt": "2026-09-04T08:00:00.000Z",
      "updatedAt": "2026-09-17T08:00:00.000Z"
    }

### OP-28 List Users

GET /api/admin/users accepts:

| Parameter | Default | Rules |
| --- | --- | --- |
| search | empty | Trimmed max 100; case-insensitive name or normalized email |
| role | empty | REQUESTER, IT_STAFF, or ADMINISTRATOR |

No pagination or sort query is accepted. Results order by normalized name ascending then id ascending and return { items: UserManagementDTO[] }. Empty results are valid. Unknown, repeated, or invalid parameters return 400 INVALID_QUERY.

### OP-29 Create User

POST /api/admin/users request:

    {
      "name": "Mina Patel",
      "email": "mina.patel@example.com",
      "role": "IT_STAFF",
      "isActive": true,
      "initialPassword": "runtime-supplied-value",
      "confirmPassword": "runtime-supplied-value"
    }

Name is trimmed 2–120. Email is normalized, valid, and at most 254. Role is exactly one permitted enum. isActive is required boolean. Password values must match and satisfy the common password rules. Success atomically stores only the Argon2id hash, sets mustChangePassword true, and returns 201 { user: UserManagementDTO }.

Duplicate normalized email returns 409 EMAIL_ALREADY_EXISTS. Invalid fields or unknown fields return 400 VALIDATION_ERROR.

### OP-30 Edit User

PATCH /api/admin/users/:userId requires the complete editable state to avoid ambiguous partial safety checks:

    {
      "name": "Mina Patel",
      "email": "mina.patel@example.com",
      "role": "IT_STAFF",
      "isActive": true,
      "expectedUpdatedAt": "2026-09-17T08:00:00.000Z"
    }

Only these fields are accepted. Password and mustChangePassword are not editable here.

The service locks the target User and evaluates the complete replacement state in one transaction. After syntax and normalized-email validation, checks run in this deterministic order: expectedUpdatedAt, self-change protection, last-active-Administrator protection, non-terminal owner eligibility, and normalized-email uniqueness. Every check is repeated against transaction-visible state before commit. A successful role change or deactivation deletes every session for the affected User in that transaction so later access cannot continue with stale permissions.

Exact role, history, and owner behavior:

- Changing an active REQUESTER to IT_STAFF or ADMINISTRATOR returns 200 and the updated { user: UserManagementDTO }. Existing Ticket.requesterId values remain unchanged as historical submitter references. The User immediately loses Requester operations and, after re-authentication, receives only the new role's permissions.
- Deactivating a historical Requester or changing that User to another role never rewrites or removes requesterId. An inactive User cannot authenticate, and a User whose current role is not REQUESTER cannot use Requester endpoints; the retained foreign key grants no current permission.
- Deactivating an IT Staff/Administrator or changing that User to REQUESTER returns 409 USER_HAS_NON_TERMINAL_TICKETS if the User owns one or more Tickets outside CLOSED and CANCELLED. The response uses the common safe error shape and contains no Ticket id, number, Summary, Requester, status list, or other Ticket content.
- If the User owns only CLOSED or CANCELLED Tickets, deactivation or a change to REQUESTER returns 200 and preserves every historical ownerId. No reassignment is performed implicitly.
- IT_STAFF-to-ADMINISTRATOR and ADMINISTRATOR-to-IT_STAFF changes with proposed isActive=true return 200 while non-terminal ownership is retained because both roles remain owner-eligible, unless self-change or last-active-Administrator protection applies. A simultaneous deactivation still applies the non-terminal-owner conflict.
- An edit that would leave no active Administrator returns 409 LAST_ACTIVE_ADMIN_REQUIRED, including an otherwise owner-eligible ADMINISTRATOR-to-IT_STAFF change. Self-deactivation or self-role-change returns 409 SELF_ADMIN_CHANGE_FORBIDDEN.
- Concurrent requests serialize on the locked target and Administrator-safety state. Exactly one request may commit against a given expectedUpdatedAt; a later request returns 409 STALE_WRITE, or the more specific safety conflict if a separately committed ownership/Administrator change invalidated its proposed state. No partial User, session, requesterId, or ownerId change occurs.

Success is exactly 200 with { user: UserManagementDTO }. Unchanged submitted role/activation values do not rewrite historical references. Role changes and deactivation revoke the target sessions; an email/name-only edit does not.

Conflicts:

| Status and code | Safe condition and response meaning |
| --- | --- |
| 409 EMAIL_ALREADY_EXISTS | Another User owns the normalized email; no identity details are returned |
| 409 SELF_ADMIN_CHANGE_FORBIDDEN | Current Administrator would deactivate self or change own role |
| 409 LAST_ACTIVE_ADMIN_REQUIRED | Edit would leave zero active Administrators |
| 409 USER_HAS_NON_TERMINAL_TICKETS | Deactivation or change to REQUESTER would invalidate one or more non-terminal owner assignments; reassign or unassign them first, with no Ticket contents returned |
| 409 STALE_WRITE | expectedUpdatedAt no longer matches transaction-visible state |

Invalid path/body values return 400 INVALID_USER_ID or VALIDATION_ERROR. Missing User returns 404 USER_NOT_FOUND. Every conflict leaves the User, sessions, requesterId references, and ownerId references unchanged. There is no DELETE User endpoint.

### OP-31 Set New Initial Password

POST /api/admin/users/:userId/initial-password accepts:

    {
      "initialPassword": "runtime-supplied-value",
      "confirmPassword": "runtime-supplied-value"
    }

The values must match and satisfy the common rule. The current Administrator cannot target themselves and receives 409 SELF_INITIAL_PASSWORD_RESET_FORBIDDEN. Missing User returns 404 USER_NOT_FOUND.

Success atomically replaces the hash, sets mustChangePassword true, records passwordChangedAt, revokes every target session, and returns 200 { user: UserManagementDTO }. It never returns or logs the supplied value. The UI may show a generic success message but cannot retrieve the initial password later.

## 11. Error-Code Catalog

| Area | Stable codes |
| --- | --- |
| Authentication | VALIDATION_ERROR, INVALID_CREDENTIALS, ACCOUNT_INACTIVE, LOGIN_THROTTLED, AUTHENTICATION_REQUIRED, PASSWORD_CHANGE_REQUIRED, INVALID_CURRENT_PASSWORD, CSRF_INVALID, ORIGIN_FORBIDDEN |
| Authorization | ROLE_FORBIDDEN |
| Ticket/query | INVALID_QUERY, INVALID_TICKET_ID, TICKET_NOT_FOUND, IDEMPOTENCY_CONFLICT, STALE_WRITE, TERMINAL_TICKET |
| Attachment | INVALID_ATTACHMENT_ID, ATTACHMENT_NOT_FOUND, FILE_REQUIRED, ATTACHMENT_TOO_LARGE, UNSUPPORTED_ATTACHMENT_TYPE, ATTACHMENT_LIMIT_REACHED, INVALID_DISPOSITION, ATTACHMENT_REMOVED, ATTACHMENT_ALREADY_REMOVED |
| Ownership/workflow | OWNER_NOT_FOUND, OWNER_CONFLICT, OWNER_CHANGE_NOT_ALLOWED, STATUS_TRANSITION_NOT_ALLOWED, STATUS_OWNER_REQUIRED, STATUS_CONFIRMATION_REQUIRED, STATUS_UNCHANGED, RESOLUTION_INDICATION_NOT_ALLOWED |
| User Admin | INVALID_USER_ID, USER_NOT_FOUND, EMAIL_ALREADY_EXISTS, SELF_ADMIN_CHANGE_FORBIDDEN, LAST_ACTIVE_ADMIN_REQUIRED, USER_HAS_NON_TERMINAL_TICKETS, SELF_INITIAL_PASSWORD_RESET_FORBIDDEN |
| Dependencies | INTERNAL_ERROR, SERVICE_UNAVAILABLE, STORAGE_UNAVAILABLE |

## 12. Removed and Preserved Contract

- GET /api/development-requesters is removed from the Lab 3 application contract and returns 404 if no compatibility route exists.
- X-Development-Requester-Id never authorizes or changes a Lab 3 request.
- Health, Category, Related System, Requester Ticket, and Attachment paths remain stable where listed.
- Lab 2 Ticket numbering, idempotency, query stability, Attachment validation/storage compensation, safe content headers, and soft-removal semantics remain in force.
- No endpoint supports self-registration, user deletion, multiple roles, Actions Taken, account history, email delivery, bulk operations, or password-reset links.
