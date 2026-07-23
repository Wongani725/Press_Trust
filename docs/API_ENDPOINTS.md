# Press Trust SMS — API Endpoint Reference

Derived from the domain model in `web/src/types/index.ts`, the seed/demo data in `web/src/data/seed.ts`, the client store actions in `web/src/store/app-store.ts`, and the screen/behavior spec in `SMS_DESIGN.MD`. The frontend currently mocks all of this client-side (Zustand + localStorage); this document specifies the REST API a real backend should expose to replace that mock layer 1:1.

## Conventions

**Base URL:** `/api/v1`

**Auth:** `Authorization: Bearer <jwt>` on every request except `/auth/*`. Tokens are short-lived and carry `userId`, `roleId`, and `sessionExpiresAt`.

**Success envelope**

```json
{
  "data": { },
  "meta": { "requestId": "req_8f2c1a", "timestamp": "2026-07-22T09:00:00Z" }
}
```

List endpoints wrap the array and add pagination:

```json
{
  "data": [ ],
  "meta": { "page": 1, "pageSize": 25, "totalItems": 132, "totalPages": 6 }
}
```

**Error envelope**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Amount exceeds remaining award balance.",
    "field": "amount",
    "details": { "remainingBalance": 300000 }
  }
}
```

Common error codes: `UNAUTHENTICATED`, `FORBIDDEN` (role not permitted), `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT` (e.g. duplicate disbursement, edit on reconciled record), `LOCKED` (account lockout / read-only record), `RATE_LIMITED`.

**Every mutating endpoint writes an `AuditLogEntry`** (see [Audit Log](#audit-log)) capturing `performedBy`, `performedByRole`, `before`/`after`, and a server timestamp — this is implicit for every POST/PATCH/PUT/DELETE below and not repeated per-endpoint.

**RBAC:** the `Roles` column lists which `roleId`s (§ [Roles](#roles--users)) may call the endpoint. `admin` can call everything and is omitted for brevity.

**Filtering/pagination on list endpoints:** standard query params are `?page`, `?pageSize`, `?sort`, plus entity-specific filters noted per section (e.g. `?programId=`, `?status=`, `?districtId=`).

---

## Table of contents

1. [Authentication & Session](#authentication--session)
2. [Roles & Users](#roles--users)
3. [Reference Data](#reference-data)
4. [Programs](#programs)
5. [Beneficiary Import](#beneficiary-import)
6. [Beneficiaries](#beneficiaries)
7. [Awards](#awards)
8. [Disbursements](#disbursements)
9. [Academic Performance & M&E](#academic-performance--me)
10. [Notifications](#notifications)
11. [Reports & Exports](#reports--exports)
12. [Admin](#admin)
13. [Dashboard](#dashboard)
14. [Audit Log](#audit-log)

---

## Authentication & Session

### `POST /auth/login`
Roles: all (unauthenticated)

Request:

```json
{ "email": "emmanuel.phiri@presstrust.mw", "password": "••••••••" }
```

Response `200` — MFA required (always true when `mfaEnabled`):

```json
{
  "data": {
    "mfaRequired": true,
    "mfaToken": "mfa_9f1c2b3a",
    "mfaMethod": "email"
  }
}
```

Response `401` (generic — never reveals whether the account exists):

```json
{ "error": { "code": "UNAUTHENTICATED", "message": "Invalid email or password." } }
```

Response `423` after the 3rd consecutive failure:

```json
{ "error": { "code": "LOCKED", "message": "Account locked after 3 failed attempts. Contact an administrator." } }
```

### `POST /auth/mfa/verify`
Roles: all (unauthenticated, holds `mfaToken`)

Request:

```json
{ "mfaToken": "mfa_9f1c2b3a", "code": "482913" }
```

Response `200`:

```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "rt_7c2e9a",
    "expiresAt": "2026-07-22T09:10:00Z",
    "user": {
      "id": "u-ops-officer",
      "name": "Emmanuel Phiri",
      "email": "emmanuel.phiri@presstrust.mw",
      "roleId": "ops_officer",
      "title": "Operations Officer",
      "mfaEnabled": true,
      "lastLogin": "2026-07-22T07:40:00"
    }
  }
}
```

Response `401`: `{ "error": { "code": "UNAUTHENTICATED", "message": "Code expired or already used." } }`

### `POST /auth/password-reset/request`
Roles: all (unauthenticated)

Request: `{ "email": "emmanuel.phiri@presstrust.mw" }`
Response `202`: `{ "data": { "message": "If that account exists, a reset link has been sent." } }`

### `POST /auth/password-reset/confirm`
Roles: all (unauthenticated)

Request:

```json
{ "resetToken": "prt_a92f1e", "newPassword": "NewPass123" }
```

Response `200`: `{ "data": { "message": "Password updated. Please log in." } }`
Response `410`: `{ "error": { "code": "VALIDATION_ERROR", "message": "Reset link has expired or already been used." } }`

### `POST /auth/logout`
Roles: any authenticated user

Response `204` (no body). Invalidates the refresh token server-side; the access token is left to expire naturally (kept short-lived for this reason).

### `POST /auth/session/heartbeat`
Roles: any authenticated user

Called by the client to keep the inactivity timer alive and detect server-side session expiry.

Response `200`:

```json
{ "data": { "sessionExpiresAt": "2026-07-22T09:20:00Z" } }
```

Response `401` once the configured `sessionTimeoutMinutes` (see [System Config](#admin)) has elapsed with no activity.

---

## Roles & Users

### `GET /roles`
Roles: `admin`

```json
{
  "data": [
    { "id": "ops_officer", "name": "Operations Officer", "portal": "Operations Portal", "description": "Programs, beneficiary import/onboarding, awards, schools" }
  ]
}
```

### `PUT /roles/:id/permissions`
Roles: `admin`. Body is the module/field-level permission matrix (module → action → allowed), e.g. `{ "beneficiary.bankAccount": { "view": false, "viewUnmasked": true } }`.

### `GET /users`
Roles: `admin` · Filters: `?roleId=`, `?search=`

```json
{
  "data": [
    { "id": "u-finance-maker", "name": "Joseph Kalua", "email": "joseph.kalua@presstrust.mw", "roleId": "finance_maker", "title": "Finance Officer (Maker)", "mfaEnabled": true, "lastLogin": "2026-07-22T09:02:00", "locked": false }
  ],
  "meta": { "page": 1, "pageSize": 25, "totalItems": 8, "totalPages": 1 }
}
```

### `POST /users`
Roles: `admin`

```json
{ "name": "New Officer", "email": "new.officer@presstrust.mw", "roleIds": ["ops_officer"], "title": "Operations Officer", "temporaryPassword": true }
```

### `PATCH /users/:id`
Roles: `admin` — updates name/title/roleIds/`mfaEnabled`.

### `POST /users/:id/deactivate` / `POST /users/:id/unlock`
Roles: `admin` — body optional `{ "reason": "..." }`. Response `200` with the updated user.

---

## Reference Data

### `GET /districts` · `POST /districts` · `PATCH /districts/:id`
Roles: `admin`, `ops_officer` (read); `admin` (write)

```json
{ "data": [{ "id": "d-lilongwe", "name": "Lilongwe", "region": "Central Region" }] }
```

### `GET /academic-periods` · `POST /academic-periods` · `PATCH /academic-periods/:id`

```json
{ "data": [{ "id": "ap-2026-t1", "year": "2026", "term": "Term 1", "label": "2026 · Term 1" }] }
```

### `GET /item-categories` · `POST /item-categories` · `PATCH /item-categories/:id`
`ItemCategory` is a closed enum in the current prototype (`Fees | Boarding | Exam Fees | Uniform | Books | Transport | Shoes | Other`); the backend should model it as an editable lookup table with `{ id, name, active }` and expose the same string values for backward compatibility.

### `GET /funding-sources` · `POST /funding-sources`

```json
{ "data": ["Press Trust Endowment Fund", "Global Education Partners", "Ministry of Education Bursary Fund"] }
```

### `GET /schools`
Roles: `admin`, `ops_officer`, `finance_maker`, `finance_checker`, `me_officer`, `management`, `auditor` · Filters: `?districtId=`, `?status=`, `?type=`

```json
{
  "data": [
    {
      "id": "sch-lgss",
      "name": "Lilongwe Girls' Secondary School",
      "type": "Secondary",
      "districtId": "d-lilongwe",
      "location": "Area 18, Lilongwe",
      "contactPerson": "Mrs. Jane Kachingwe",
      "phone": "+265 991 234 001",
      "email": "admin@lgss.edu.mw",
      "registrationNumber": "MOE-SEC-1042",
      "status": "Active",
      "bankAccount": {
        "bankName": "National Bank of Malawi",
        "branch": "Capital City Branch",
        "accountNumber": "••••4455",
        "status": "Active"
      }
    }
  ]
}
```

`accountNumber` is masked by default; only roles granted `viewUnmasked` (see permission matrix) receive the plaintext value, and doing so is written to the audit log automatically.

### `POST /schools` · `PATCH /schools/:id`
Roles: `admin`, `ops_officer`

Request body mirrors `School` minus `id`/`bankAccount` (bank account is managed separately, below).

### `POST /schools/:id/bank-account/request-change`
Roles: `admin`, `ops_officer` — creates a **pending** change on an active account rather than applying it directly (maker–checker).

```json
{ "bankName": "Standard Bank Malawi", "branch": "Lilongwe Central", "accountNumber": "9911002233" }
```

Response `200` — account now carries `pendingChange`:

```json
{
  "data": {
    "id": "sch-lgss",
    "bankAccount": {
      "bankName": "National Bank of Malawi",
      "branch": "Capital City Branch",
      "accountNumber": "••••4455",
      "status": "Pending Approval",
      "pendingChange": {
        "bankName": "Standard Bank Malawi",
        "branch": "Lilongwe Central",
        "accountNumber": "9911002233",
        "requestedBy": "Emmanuel Phiri",
        "requestedAt": "2026-07-22T09:00:00Z"
      }
    }
  }
}
```

### `POST /schools/:id/bank-account/approve` · `POST /schools/:id/bank-account/reject`
Roles: `admin` (must differ from the requester — enforced server-side, not just in the UI). Approve applies `pendingChange` onto `bankAccount` and clears it; reject discards it. Body: `{ "reason"?: string }`.

---

## Programs

### `GET /programs`
Roles: `admin`, `ops_officer`, `finance_maker`, `finance_checker`, `management`, `auditor` · Filters: `?status=`, `?academicYear=`

```json
{
  "data": [
    {
      "id": "prog-secondary-2026",
      "name": "Press Trust Secondary Scholarship 2026",
      "description": "Full tuition, boarding and learning materials support for vulnerable secondary school students.",
      "academicYear": "2026",
      "applicationOpenDate": "2026-01-05",
      "applicationCloseDate": "2026-02-28",
      "budgetCeiling": 20000000,
      "budgetUtilized": 4950000,
      "fundingSources": ["Press Trust Endowment Fund"],
      "requiredDocuments": ["Birth Certificate", "Proof of School Enrollment", "Guardian National ID", "Household Means Assessment"],
      "awardType": "Renewable",
      "status": "Open"
    }
  ]
}
```

### `GET /programs/:id`
Same shape as a single list item.

### `POST /programs`
Roles: `admin`, `ops_officer` — creates in `Draft` status.

Request: `Program` minus `id`/`budgetUtilized` (server-computed).

### `PATCH /programs/:id`
Roles: `admin`, `ops_officer` — partial update. Server rejects edits to `budgetCeiling`/`fundingSources` once `budgetUtilized > 0` unless an admin override flag is passed, mirroring the award-amount-edit rule.

### `POST /programs/:id/publish`
Roles: `admin`, `ops_officer` — `Draft → Open`. Fails with `VALIDATION_ERROR` if `applicationOpenDate`/`applicationCloseDate` are missing.

### `POST /programs/:id/archive`
Roles: `admin`, `ops_officer` — any status `→ Archived`.

The `Closed` transition happens automatically server-side once `applicationCloseDate` is reached (a scheduled job), matching "closing date auto-locks new intake."

---

## Beneficiary Import

### `GET /import-batches`
Roles: `admin`, `ops_officer` · Filters: `?programId=`

```json
{
  "data": [
    {
      "id": "imp-2026-07",
      "fileName": "moe_beneficiary_intake_july2026.csv",
      "programId": "prog-secondary-2026",
      "academicYear": "2026",
      "uploadedBy": "Emmanuel Phiri",
      "uploadedAt": "2026-07-20T09:00:00",
      "totalRows": 10,
      "accepted": 5,
      "rejected": 5
    }
  ]
}
```

### `GET /import-batches/:id`
Roles: `admin`, `ops_officer` — full detail including `rows[]` (see `ImportRow` in the types file):

```json
{
  "data": {
    "id": "imp-2026-07",
    "rows": [
      { "rowNumber": 1, "beneficiaryName": "Dan Chirwa", "nationalId": "MW-20101044556", "schoolName": "Lilongwe Girls' Secondary School", "status": "Accepted", "raw": { "dob": "2013-04-10", "district": "Lilongwe" } },
      { "rowNumber": 6, "beneficiaryName": "Fatima Jere", "nationalId": "MW-20140788112", "schoolName": "St. Monica's CDSS", "status": "Rejected", "rejectionReason": "Missing required field: Guardian Phone", "raw": { "dob": "2014-02-01", "district": "Zomba" } }
    ]
  }
}
```

### `GET /import-batches/template`
Roles: `admin`, `ops_officer` — returns the downloadable CSV template (`Content-Type: text/csv`), column headers matching `Beneficiary` intake fields.

### `POST /import-batches/mappings`
Roles: `admin`, `ops_officer` — saves a reusable column-mapping profile for future uploads.

```json
{ "name": "MoE standard export", "mapping": { "Full Name": "firstName+lastName", "ID Number": "nationalId", "School": "schoolName", "DOB": "dob" } }
```

### `POST /import-batches`
Roles: `admin`, `ops_officer` — multipart upload: `file` (CSV), `programId`, `academicYear`, optional `mappingId`.

Validates every row server-side (missing required field, bad date format, duplicate `nationalId` against existing beneficiaries, unknown school name) and returns the same shape as `GET /import-batches/:id` with per-row `status`/`rejectionReason` populated — nothing is persisted as a `Beneficiary` yet.

### `POST /import-batches/:id/commit`
Roles: `admin`, `ops_officer` — creates `Beneficiary` records (status `Imported`) for every row currently `Accepted`. Body: `{ "rowNumbers"?: number[] }` (omit to commit all accepted rows).

```json
{ "data": { "createdBeneficiaryIds": ["ben-dan", "ben-grace-mwale", "ben-isaac", "ben-thoko", "ben-patricia"], "batch": { "id": "imp-2026-07", "accepted": 5, "rejected": 5 } } }
```

### `GET /import-batches/:id/error-log`
Roles: `admin`, `ops_officer` — downloadable CSV/XLSX of rejected rows with reasons.

---

## Beneficiaries

### `GET /beneficiaries`
Roles: `admin`, `ops_officer`, `ops_approver`, `finance_maker`, `finance_checker`, `me_officer`, `management`, `auditor`
Filters: `?programId=`, `?districtId=`, `?schoolId=`, `?status=`, `?validationStatus=`, `?atRisk=true`, `?search=` (name/nationalId/beneficiaryId)

```json
{
  "data": [
    {
      "id": "ben-chikondi",
      "beneficiaryId": "PT-2025-0001",
      "firstName": "Chikondi",
      "lastName": "Banda",
      "gender": "Female",
      "districtId": "d-lilongwe",
      "schoolId": "sch-lgss",
      "programId": "prog-secondary-2026",
      "academicYear": "2026",
      "status": "Active",
      "validationStatus": "Accepted",
      "atRisk": null
    }
  ],
  "meta": { "page": 1, "pageSize": 25, "totalItems": 7, "totalPages": 1 }
}
```

### `GET /beneficiaries/:id`
Full `Beneficiary` object, matching the tabbed profile screen — bio, guardian, school/program, documents, status history, at-risk/termination state. Awards/disbursements/academic performance for the beneficiary are separate calls (below) rather than nested, to keep the payload sized for the list-heavy tabs.

```json
{
  "data": {
    "id": "ben-mphatso",
    "beneficiaryId": "PT-2025-0002",
    "nationalId": "MW-19070533221",
    "firstName": "Mphatso",
    "lastName": "Phiri",
    "dob": "2011-07-05",
    "gender": "Male",
    "districtId": "d-zomba",
    "address": "Chinamwali Village, Zomba",
    "phone": "+265 888 002 233",
    "guardianName": "Grace Phiri",
    "guardianRelationship": "Aunt",
    "guardianPhone": "+265 888 002 234",
    "guardianEmail": "grace.phiri@example.mw",
    "schoolId": "sch-smc",
    "programId": "prog-secondary-2026",
    "academicYear": "2026",
    "status": "Active",
    "importDate": "2026-01-18",
    "validationStatus": "Accepted",
    "validationConfirmedBy": "Emmanuel Phiri",
    "onboardingApprovedBy": "Linda Mbewe",
    "documents": [
      { "id": "doc-birth", "name": "Birth Certificate", "status": "Verified", "uploadedAt": "2026-03-01", "version": 1 }
    ],
    "statusHistory": [
      { "id": "sh-1", "status": "Imported", "changedBy": "Emmanuel Phiri", "changedAt": "2026-01-18T09:00:00" },
      { "id": "sh-3", "status": "Active", "changedBy": "Linda Mbewe", "changedAt": "2026-01-21T14:00:00" }
    ],
    "atRisk": {
      "reason": "Average score 38% — below 50% continuation threshold for two consecutive terms",
      "flaggedAt": "2026-06-10T10:00:00",
      "flaggedBy": "System (auto-flag)",
      "auto": true,
      "warningIssued": true
    }
  }
}
```

### `GET /beneficiaries/:id/audit-log`
Roles: same as profile viewers — returns the `AuditLogEntry[]` scoped to `entityType=Beneficiary&entityId=:id` (backs the profile's Audit Log tab; also reachable via the general `/audit-log` endpoint with query params).

### `PATCH /beneficiaries/:id`
Roles: `admin`, `ops_officer` — edits bio/guardian/school/program fields. Body: partial `Beneficiary`.

### `POST /beneficiaries/:id/documents`
Roles: `admin`, `ops_officer` — multipart upload of a document slot.

```json
{ "documentId": "doc-means", "file": "<binary>" }
```

Response bumps `version` and sets `status: "Pending"` pending review.

### `PATCH /beneficiaries/:id/documents/:documentId`
Roles: `admin`, `ops_officer`, `ops_approver` — reviewer sets `{ "status": "Verified" | "Rejected", "expiryDate"?: string }`.

### `POST /beneficiaries/:id/confirm-validation`
Roles: `ops_officer` (not `ops_approver` — enforced server-side so the same user can't also approve onboarding).

Response `200`:

```json
{ "data": { "id": "ben-dan", "status": "Pending Onboarding", "validationConfirmedBy": "Emmanuel Phiri" } }
```

Response `403` if the caller previously performed `confirm-validation` on this record and now attempts `approve-onboarding` themselves.

### `POST /beneficiaries/:id/approve-onboarding`
Roles: `ops_approver` only, and must differ from `validationConfirmedBy` on the record.

```json
{ "data": { "id": "ben-dan", "status": "Active", "onboardingApprovedBy": "Linda Mbewe" } }
```

### `POST /beneficiaries/:id/flag-exception`
Roles: `ops_officer`, `ops_approver`

```json
{ "reason": "Guardian phone number could not be verified via SMS gateway" }
```

### `POST /beneficiaries/:id/resolve-exception`
Roles: `ops_officer`, `ops_approver` — body optional `{ "resolutionNote"?: string }`.

### `POST /beneficiaries/:id/status`
Roles: `ops_officer`, `ops_approver` — covers Suspend / Reinstate / Terminate-Close from the profile screen. `reason` is required for `Suspended` and `Terminated`.

```json
{ "status": "Terminated", "reason": "Repeated academic failure after warning; M&E recommended termination." }
```

Server blocks new `Disbursement` creation against any beneficiary whose `status` is `Terminated` or `Suspended` (see [Disbursements](#disbursements)).

---

## Awards

### `GET /awards`
Roles: `admin`, `ops_officer`, `finance_maker`, `finance_checker`, `management`, `auditor` · Filters: `?programId=`, `?status=`, `?beneficiaryId=`, `?academicPeriodId=`

```json
{
  "data": [
    {
      "id": "awd-chikondi-1",
      "beneficiaryId": "ben-chikondi",
      "programId": "prog-secondary-2026",
      "fundingSource": "Press Trust Endowment Fund",
      "amount": 450000,
      "disbursed": 150000,
      "startDate": "2026-01-25",
      "endDate": "2026-12-15",
      "conditions": "Maintain 50% average and 80% attendance each term.",
      "awardType": "Renewable",
      "status": "Active",
      "letterGenerated": true
    }
  ]
}
```

### `GET /awards/:id`
Same shape as a single list item.

### `POST /awards`
Roles: `admin`, `ops_officer`

```json
{
  "beneficiaryId": "ben-dan",
  "programId": "prog-secondary-2026",
  "fundingSource": "Press Trust Endowment Fund",
  "amount": 450000,
  "startDate": "2026-08-01",
  "endDate": "2026-12-15",
  "conditions": "Maintain 50% average and 80% attendance each term.",
  "awardType": "Renewable"
}
```

Server-side validation:
- `beneficiaryId` must resolve to a beneficiary with `status: "Active"`.
- `amount` must not push `program.budgetUtilized + amount` over `program.budgetCeiling` — else `409 CONFLICT`:

```json
{ "error": { "code": "CONFLICT", "message": "Award would breach program budget ceiling.", "details": { "budgetCeiling": 20000000, "budgetUtilized": 19700000, "requestedAmount": 500000 } } }
```

Created with `status: "Draft"`.

### `PATCH /awards/:id`
Roles: `admin`, `ops_officer` — edits `amount`/`conditions`/`endDate`. Once `disbursed > 0`, changing `amount` requires `{ "overrideAuthorization": true, "overrideReason": "..." }` supplied by a user with override rights, else `403 FORBIDDEN`.

### `POST /awards/:id/generate-letter`
Roles: `admin`, `ops_officer` — renders the award letter template with beneficiary/award variables, stores it, sets `letterGenerated: true`.

```json
{ "data": { "id": "awd-dan-1", "letterGenerated": true, "letterUrl": "/files/award-letters/awd-dan-1.pdf" } }
```

### `POST /awards/:id/activate` · `POST /awards/:id/suspend` · `POST /awards/:id/reinstate` · `POST /awards/:id/close`
Roles: `admin`, `ops_officer` — `suspend`/`close` require `{ "reason": "..." }`.

### `POST /awards/:id/renew`
Roles: `admin`, `ops_officer` — creates a new `Award` for the next period with `renewedFromId` set to `:id`.

```json
{ "startDate": "2027-01-05", "endDate": "2027-12-15", "amount": 470000 }
```

```json
{ "data": { "id": "awd-dan-2", "renewedFromId": "awd-dan-1", "status": "Draft" } }
```

---

## Disbursements

### `GET /disbursements`
Roles: `admin`, `finance_maker`, `finance_checker`, `ops_officer`, `management`, `auditor` · Filters: `?awardId=`, `?beneficiaryId=`, `?status=`, `?category=`, `?academicPeriodId=`, `?programId=`

```json
{
  "data": [
    {
      "id": "dis-1003",
      "awardId": "awd-mphatso-1",
      "beneficiaryId": "ben-mphatso",
      "category": "Boarding",
      "payeeType": "School",
      "payeeName": "St. Monica's CDSS",
      "amount": 150000,
      "academicPeriodId": "ap-2026-t2",
      "notes": "Term 2 boarding fees",
      "status": "Paid",
      "requestedBy": "Joseph Kalua",
      "requestedAt": "2026-05-05T09:00:00",
      "approvedBy": "Ruth Nkhoma",
      "approvedAt": "2026-05-06T09:00:00",
      "paidAt": "2026-05-08T09:00:00",
      "evidenceFileName": "voucher-1003.pdf"
    }
  ]
}
```

### `GET /disbursements/:id`
Same shape as a single list item, `403` for `auditor`/read-only roles is never returned — they get read access, just no action endpoints below.

### `POST /disbursements`
Roles: `finance_maker`

```json
{
  "awardId": "awd-dan-1",
  "category": "Fees",
  "payeeType": "School",
  "amount": 150000,
  "academicPeriodId": "ap-2026-t3",
  "notes": "Term 3 tuition fees"
}
```

`beneficiaryId` and `payeeName`/bank details are resolved server-side from the award/school — the client cannot set them directly. Validation performed before creation (`422`/`409` on failure):
- Award must be `status: "Active"` and its beneficiary not `Suspended`/`Terminated`.
- `amount` ≤ `award.amount - award.disbursed` (remaining award balance) — else `CONFLICT` with `{ "remainingAwardBalance": ... }`.
- `amount` ≤ program's remaining budget (`budgetCeiling - budgetUtilized`) — else `CONFLICT` with `{ "remainingProgramBudget": ... }`.
- No existing disbursement with the same `beneficiaryId` + `category` + `academicPeriodId` — else `409 CONFLICT` `{ "code": "DUPLICATE_DISBURSEMENT" }`.

Created with `status: "Requested"`.

### `POST /disbursements/:id/approve`
Roles: `finance_checker` — server rejects with `403 FORBIDDEN` if `req.user.id === disbursement.requestedByUserId` (the maker–checker separation is enforced here, not just hidden in the UI).

```json
{ "data": { "id": "dis-1005", "status": "Approved", "approvedBy": "Ruth Nkhoma", "approvedAt": "2026-07-22T09:00:00Z" } }
```

### `POST /disbursements/:id/mark-paid`
Roles: `finance_maker`, `finance_checker` — multipart, requires `evidence` file; `400 VALIDATION_ERROR` if omitted. On success, increments the linked `Award.disbursed`.

```json
{ "data": { "id": "dis-1005", "status": "Paid", "evidenceFileName": "voucher-1005.pdf", "paidAt": "2026-07-22T09:05:00Z" } }
```

### `POST /disbursements/:id/mark-failed`
Roles: `finance_maker`, `finance_checker` — body `{ "reason": "Bank rejected transfer — invalid account number" }` (required).

### `POST /disbursements/:id/mark-reconciled`
Roles: `finance_checker` — only valid from `status: "Paid"`. After this call the record becomes read-only; any further mutation attempt returns `409 CONFLICT` `{ "code": "RECORD_LOCKED" }` and is itself audit-logged.

### `POST /disbursements/:id/return-funds`
Roles: `finance_checker` — body `{ "amount": 25000, "reason": "Partial refund from school" }`; decrements the linked `Award.disbursed` and sets `status: "Returned"`, `returnedAmount`.

---

## Academic Performance & M&E

### `GET /academic-performance`
Roles: `admin`, `me_officer`, `ops_officer`, `management`, `auditor` · Filters: `?beneficiaryId=`, `?academicPeriodId=`, `?schoolId=`

```json
{
  "data": [
    { "id": "perf-4", "beneficiaryId": "ben-mphatso", "academicPeriodId": "ap-2026-t2", "schoolId": "sch-smc", "average": 38, "attendance": 64, "progression": "Repeated", "lockedFromDeletion": true, "recordedBy": "Precious Gondwe", "recordedAt": "2026-07-10T09:00:00" }
  ]
}
```

### `POST /academic-performance`
Roles: `me_officer`

```json
{ "beneficiaryId": "ben-dan", "academicPeriodId": "ap-2026-t3", "schoolId": "sch-lgss", "average": 44, "attendance": 71, "progression": "Repeated" }
```

If `average` falls below the configured at-risk threshold (see [System Config](#admin)), the server auto-creates/updates the beneficiary's `atRisk` flag (`auto: true`) as part of this call's response side effects.

```json
{
  "data": { "id": "perf-9", "average": 44, "attendance": 71, "progression": "Repeated" },
  "meta": { "autoFlagged": true, "beneficiaryId": "ben-dan" }
}
```

### `DELETE /academic-performance/:id`
Roles: `me_officer` — `409 CONFLICT` `{ "code": "RECORD_LOCKED" }` once `lockedFromDeletion: true` (set automatically the moment any disbursement references that period for that beneficiary).

### `GET /at-risk-register`
Roles: `me_officer`, `admin`, `management` — returns beneficiaries where `atRisk` is set (auto or manual).

```json
{
  "data": [
    {
      "beneficiaryId": "ben-mphatso",
      "beneficiaryName": "Mphatso Phiri",
      "atRisk": {
        "reason": "Average score 38% — below 50% continuation threshold for two consecutive terms",
        "flaggedAt": "2026-06-10T10:00:00",
        "flaggedBy": "System (auto-flag)",
        "auto": true,
        "warningIssued": true
      }
    }
  ]
}
```

### `POST /beneficiaries/:id/at-risk`
Roles: `me_officer` — manual flag, `reason` required.

```json
{ "reason": "Guardian reports household hardship affecting attendance" }
```

### `DELETE /beneficiaries/:id/at-risk`
Roles: `me_officer` — body `{ "justification": "Performance recovered to 65% average in Term 3" }` (required).

### `POST /beneficiaries/:id/warning`
Roles: `me_officer` — part of the [Continuation/Warning/Termination workflow](#continuation-workflow); sets `atRisk.warningIssued`, `warningReason`, `warningAt`, and a `recheckAcademicPeriodId` for the next term's re-evaluation.

```json
{ "reason": "Average below 50% threshold in Term 2; formal warning issued per program conditions.", "recheckAcademicPeriodId": "ap-2026-t3" }
```

### `POST /beneficiaries/:id/recommend-continuation`
Roles: `me_officer` — clears `atRisk` after a successful re-check.

### `POST /beneficiaries/:id/recommend-termination`
Roles: `me_officer`

```json
{ "reason": "Average remained below threshold for a second consecutive term after warning." }
```

This routes to Operations: the record now carries `terminationRecommended`, surfaced on the Beneficiary Profile (Operations Portal) for the actual `POST /beneficiaries/:id/status` call with `status: "Terminated"`.

### `DELETE /beneficiaries/:id/termination-recommendation`
Roles: `ops_officer`, `ops_approver` — clears the recommendation once Operations has acted (or dismissed it).

### `GET /interventions` · `GET /interventions/:id`
Roles: `me_officer`, `admin`, `management` · Filters: `?beneficiaryId=`, `?status=`, `?assignedOfficer=`

```json
{
  "data": [
    {
      "id": "case-1",
      "beneficiaryId": "ben-mphatso",
      "description": "Home visit to assess attendance barriers and household support needs following repeated poor performance.",
      "assignedOfficer": "Precious Gondwe",
      "dueDate": "2026-07-30",
      "status": "In Progress",
      "createdAt": "2026-06-11T09:00:00",
      "updates": [{ "note": "Initial home visit scheduled with guardian.", "by": "Precious Gondwe", "at": "2026-06-12T09:00:00" }]
    }
  ]
}
```

### `POST /interventions`
Roles: `me_officer`

```json
{ "beneficiaryId": "ben-thoko", "description": "Follow up on unresolved guardian phone verification exception.", "assignedOfficer": "Precious Gondwe", "dueDate": "2026-08-05" }
```

Created with `status: "Open"`. Cases cannot be deleted, only status-updated (`POST /interventions/:id/status`) — there is intentionally no `DELETE` endpoint.

### `POST /interventions/:id/status`
Roles: `me_officer`

```json
{ "status": "Closed", "note": "Guardian phone number re-verified successfully; no further action needed." }
```

### `GET /monitoring-visits`
Roles: `me_officer`, `admin`, `management` · Filters: `?beneficiaryId=`, `?schoolId=`

### `POST /monitoring-visits`
Roles: `me_officer` — multipart if attachments included.

```json
{ "beneficiaryId": "ben-mphatso", "visitDate": "2026-07-25", "findings": "Follow-up visit; attendance has improved to 80%.", "followUpActions": "Continue monitoring for one more term before closing the case." }
```

### `GET /outcomes` (Outcome statistics)
Roles: `me_officer`, `admin`, `management` · Filters: `?programId=`, `?academicYear=`, `?districtId=`

```json
{
  "data": {
    "completionRate": 0.82,
    "dropoutRate": 0.06,
    "progressionRate": 0.88,
    "totalCohort": 214,
    "byProgram": [{ "programId": "prog-primary-2025", "completionRate": 1.0, "dropoutRate": 0.0 }]
  }
}
```

`Completed`/`Dropped` outcomes themselves are recorded through the existing `POST /beneficiaries/:id/status` endpoint; when `status: "Dropped"` (mapped from `Terminated`) is set, `reason` (exit reason) is mandatory, matching §5.5 of the design spec.

---

## Notifications

### `GET /notification-templates`
Roles: `admin` · 

```json
{
  "data": [
    { "id": "tmpl-2", "name": "Decision Notification", "event": "Onboarding Decision", "subject": "Update on your Press Trust application", "body": "Dear {{guardianName}}, the status of {{beneficiaryName}}'s application is now {{status}}.", "active": true }
  ]
}
```

### `POST /notification-templates` · `PATCH /notification-templates/:id`
Roles: `admin` — body is `NotificationTemplate` minus `id`. `event` must be one of the fixed system trigger points (`Beneficiary Import Accepted`, `Onboarding Decision`, `Document Rejected`, `Award Renewal Due`, `Disbursement Paid`, …).

### `GET /notification-log`
Roles: `admin`, `auditor` · Filters: `?event=`, `?status=`, `?recipient=`

```json
{
  "data": [
    { "id": "nlog-2", "templateId": "tmpl-2", "recipient": "esther.banda@example.mw", "event": "Onboarding Decision", "sentAt": "2026-01-25T14:05:00", "status": "Sent" }
  ]
}
```

Entries here are created automatically by the server whenever a matching trigger event fires (e.g. `approve-onboarding`, `mark-paid`) — there is no manual "create" endpoint.

---

## Reports & Exports

### `GET /reports/beneficiary-register`
### `GET /reports/awards`
### `GET /reports/disbursements`
### `GET /reports/budget-utilization`
### `GET /reports/school-payments`
### `GET /reports/me-outcomes`

Roles: `admin`, `management`, `finance_checker` (budget/disbursements), `ops_officer`, `me_officer` (outcomes), `auditor` (all, read-only). Shared filter params: `?programId=`, `?academicPeriodId=`, `?districtId=`, `?schoolId=`, `?status=`, `?format=json|csv|xlsx|pdf`.

Example — `GET /reports/budget-utilization?programId=prog-secondary-2026`:

```json
{
  "data": [
    {
      "programId": "prog-secondary-2026",
      "programName": "Press Trust Secondary Scholarship 2026",
      "budgetCeiling": 20000000,
      "approvedAwardsTotal": 900000,
      "disbursedTotal": 450000,
      "remainingBalance": 19100000,
      "ceilingBreached": false
    }
  ]
}
```

When `?format=csv|xlsx|pdf` is passed, the response is the binary file and the request is recorded in the export log automatically (see below) with the applied filters embedded in the file header/footer per the "filters shown in export" requirement.

### `GET /report-templates`
Roles: `admin`, `management`, `finance_checker`, `ops_officer`, `me_officer` — the saved Dynamic Report Builder templates.

```json
{
  "data": [
    { "id": "rpt-tmpl-1", "name": "Program Budget Summary", "createdBy": "Ruth Nkhoma", "createdAt": "2026-03-01T09:00:00", "rows": ["Program"], "columns": ["Budget Ceiling", "Disbursed Total", "Remaining Balance"], "filters": ["Academic Year"] }
  ]
}
```

### `POST /report-templates`
Roles: same as above — body is `ReportTemplate` minus `id`/`createdAt` (drag-and-drop field selection maps to `rows`/`columns`/`filters` string arrays of field names).

### `PATCH /report-templates/:id` · `DELETE /report-templates/:id`
Roles: `admin`, or the template's `createdBy`.

### `POST /report-templates/:id/run`
Roles: same as list — executes the template against live data.

```json
{ "filters": { "Academic Year": "2026" } }
```

```json
{
  "data": {
    "columns": ["Program", "Budget Ceiling", "Disbursed Total", "Remaining Balance"],
    "rows": [["Press Trust Secondary Scholarship 2026", 20000000, 450000, 19550000]]
  }
}
```

### `GET /export-log`
Roles: `admin`, `auditor`, `management`

```json
{
  "data": [
    { "id": "exp-1", "reportName": "Disbursements — Press Trust Secondary Scholarship 2026", "format": "PDF", "exportedBy": "Ruth Nkhoma", "exportedAt": "2026-07-10T09:00:00", "filters": "Program=Secondary 2026" }
  ]
}
```

Populated automatically by any `?format=csv|xlsx|pdf` report call above; no manual create endpoint.

---

## Admin

### `GET /admin/system-config`
Roles: `admin`

```json
{
  "data": {
    "sessionTimeoutMinutes": 10,
    "passwordPolicy": "Min 8 characters, 1 uppercase, 1 number",
    "mfaEnabled": true,
    "atRiskThresholdAverage": 50
  }
}
```

### `PATCH /admin/system-config`
Roles: `admin`

```json
{ "sessionTimeoutMinutes": 15 }
```

### `GET /admin/smtp-settings`
Roles: `admin` — returns config **without** credentials (`{ "host": "smtp.presstrust.mw", "port": 587, "fromAddress": "no-reply@presstrust.mw", "credentialsConfigured": true }`); credentials are write-only.

### `PUT /admin/smtp-settings`
Roles: `admin`

```json
{ "host": "smtp.presstrust.mw", "port": 587, "username": "sms-notify", "password": "••••••••", "fromAddress": "no-reply@presstrust.mw" }
```

Stored encrypted; never echoed back in any subsequent `GET`.

---

## Audit Log

### `GET /audit-log`
Roles: `admin` (full access + this endpoint itself is access-logged), `auditor` (read-only) · Filters: `?entityType=`, `?entityId=`, `?performedBy=`, `?performedByRole=`, `?dateFrom=`, `?dateTo=`, `?action=`

```json
{
  "data": [
    { "id": "aud-9", "entityType": "Disbursement", "entityId": "dis-1001", "entityLabel": "Disbursement DIS-1001", "action": "Marked Reconciled", "performedBy": "Ruth Nkhoma", "performedByRole": "finance_checker", "timestamp": "2026-02-20T09:00:00", "before": "Paid", "after": "Reconciled" }
  ],
  "meta": { "page": 1, "pageSize": 50, "totalItems": 10, "totalPages": 1 }
}
```

### `GET /audit-log/export`
Roles: `admin`, `auditor` — `?format=csv|xlsx|pdf` plus the same filters as above; recorded into the export log like any other report export.

---

## Dashboard

### `GET /dashboard/kpis`
Roles: `management`, `admin` · Filters: `?programId=`, `?academicPeriodId=`

```json
{
  "data": {
    "activeBeneficiariesByProgram": [
      { "programId": "prog-secondary-2026", "programName": "Press Trust Secondary Scholarship 2026", "count": 2 }
    ],
    "budgetUtilizationPercent": 24.75,
    "totalDisbursementsThisPeriod": 300000,
    "atRiskCount": 1
  }
}
```

### `GET /dashboard/charts/disbursements-by-program`
### `GET /dashboard/charts/disbursements-by-district`
### `GET /dashboard/charts/completion-vs-dropout`

Roles: `management`, `admin` — each returns `{ "data": [{ "label": "...", "value": number }] }` series for the respective chart.

Drill-down from any KPI/chart point is implemented client-side by calling the existing `GET /beneficiaries` or `GET /disbursements` with the matching filter (e.g. `atRisk=true`), rather than a dedicated drill-down endpoint.

---

## Entity reference

For the exact shape of every object referenced above, see the TypeScript interfaces in `web/src/types/index.ts` — the API request/response bodies are designed to be a direct JSON serialization of those types (`Role`, `User`, `District`, `School`, `Program`, `AcademicPeriod`, `Beneficiary`, `Award`, `Disbursement`, `AcademicPerformance`, `InterventionCase`, `MonitoringVisit`, `NotificationTemplate`, `NotificationLogEntry`, `AuditLogEntry`, `ImportBatch`, `ReportTemplate`, `ExportLogEntry`), so the current mocked `useAppStore` (`web/src/store/app-store.ts`) can be swapped for real HTTP calls without changing the shape consumed by the UI.
