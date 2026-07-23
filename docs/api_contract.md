# Press Trust SMS API Contract

This document defines the complete API surface for the Scholarship Management System. Endpoints are organized by domain module and follow consistent conventions.

## Conventions

- **Base URL:** `/api/v1`
- **Auth:** JWT Bearer token in `Authorization: Bearer <token>` header.
- **MFA:** If user has MFA enabled, `X-MFA-Token` header must be included after MFA verification.
- **Protected endpoints** require a valid JWT. Admin endpoints require specific roles.
- **List endpoints** support pagination with `?page=1&limit=20` and filtering by relevant fields.
- **Sensitive fields** (bank account numbers, national IDs) are masked by default (`****1234`). Use `?unmasked=true` for authorized roles; access is logged.
- **Status transitions** follow controlled state machines. Invalid transitions return `422` with allowed transitions listed.
- **Maker-Checker** endpoints: a user cannot approve/verify their own created record.
- **Standard responses:**
  - `200` — Success with body
  - `201` — Created
  - `400` — Validation error
  - `401` — Unauthenticated
  - `403` — Forbidden (wrong role)
  - `404` — Not found
  - `422` — Unprocessable (invalid status transition, business rule violation)
  - `500` — Internal error
- **Error body:** `{ "error": { "code": "string", "message": "string", "details": {} } }`
- **Paginated response:** `{ "data": [], "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 } }`

---

## Auth Endpoints

| Method | Endpoint | Description | Auth |
| --- | --- | --- | --- |
| `POST` | `/auth/login` | Login with email + password; returns JWT + MFA challenge if enabled | None |
| `POST` | `/auth/mfa/verify` | Submit TOTP code; returns full access token | JWT (partial) |
| `POST` | `/auth/refresh` | Refresh expired token | JWT (refresh) |
| `POST` | `/auth/logout` | Invalidate current session | JWT |
| `POST` | `/auth/password/forgot` | Request password reset email | None |
| `POST` | `/auth/password/reset` | Reset password with token | None |
| `PUT` | `/auth/password/change` | Change current password | JWT |
| `GET` | `/auth/session` | Get current user session info | JWT |

**Login response:**
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": 900,
  "mfaRequired": true,
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "role": "string",
    "programs": ["uuid"]
  }
}
```

---

## User & Role Management (Admin)

### Users

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/users` | List users (`?role=&status=&programId=&q=`) | SuperAdmin |
| `POST` | `/admin/users` | Create internal user | SuperAdmin |
| `GET` | `/admin/users/{id}` | Get user details | SuperAdmin |
| `PUT` | `/admin/users/{id}` | Update user details | SuperAdmin |
| `PATCH` | `/admin/users/{id}/status` | Activate/suspend/deactivate/lock | SuperAdmin |
| `POST` | `/admin/users/{id}/unlock` | Unlock locked account | SuperAdmin |
| `POST` | `/admin/users/{id}/mfa/reset` | Reset user MFA secret | SuperAdmin |

### Roles

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/roles` | List roles | SuperAdmin |
| `POST` | `/admin/roles` | Create role | SuperAdmin |
| `GET` | `/admin/roles/{id}` | Get role + permissions | SuperAdmin |
| `PUT` | `/admin/roles/{id}` | Update role | SuperAdmin |
| `PATCH` | `/admin/roles/{id}/status` | Activate/deactivate role | SuperAdmin |
| `PUT` | `/admin/roles/{id}/permissions` | Set role permissions | SuperAdmin |

**User create body:**
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "Operations",
  "phone": "string",
  "programIds": ["uuid"]
}
```

---

## Program Management (Admin / Operations)

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/programs` | List programs (`?status=&fundingSourceId=`) | Operations, SuperAdmin |
| `POST` | `/admin/programs` | Create program | Operations, SuperAdmin |
| `GET` | `/admin/programs/{id}` | Get program with full config | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}` | Update program | Operations, SuperAdmin |
| `PATCH` | `/admin/programs/{id}/status` | Change status (Draft/Open/Closed/ Archived) | Operations, SuperAdmin |
| `GET` | `/admin/programs/{id}/budget` | Get budget utilization | Operations, Finance, SuperAdmin |
| `PUT` | `/admin/programs/{id}/budget` | Update budget ceiling | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/funding-sources` | Update funding allocation | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/eligibility-rules` | Set eligibility rules | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/evaluation-rubric` | Set evaluation rubric | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/workflow-stages` | Set workflow/approver stages | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/form-config` | Set application form fields | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/required-documents` | Set required document types | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/communication-templates` | Update email/letter templates | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/notification-triggers` | Toggle notification events | Operations, SuperAdmin |
| `PUT` | `/admin/programs/{id}/academic-periods` | Configure academic periods | Operations, SuperAdmin |
| `GET` | `/admin/programs/{id}/audit-log` | Get program config change log | SuperAdmin, Auditor |

**Program create body:**
```json
{
  "name": "string",
  "description": "string",
  "applicationOpenDate": "2026-06-01",
  "applicationCloseDate": "2026-08-31",
  "budgetCeiling": 500000.00,
  "fundingSourceId": "uuid",
  "awardTypes": ["one-off", "recurring", "renewable"],
  "config": {}
}
```

---

## Master Data (Admin)

### Schools

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/schools` | List schools (`?district=&type=&status=`) | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/schools` | Create school | Operations, SuperAdmin |
| `GET` | `/admin/schools/{id}` | Get school + bank accounts | Operations, Finance, M&E, SuperAdmin |
| `PUT` | `/admin/schools/{id}` | Update school | Operations, SuperAdmin |
| `PATCH` | `/admin/schools/{id}/status` | Activate/deactivate | Operations, SuperAdmin |

### School Bank Accounts

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/schools/{schoolId}/bank-accounts` | List (masked) | Finance, SuperAdmin |
| `POST` | `/admin/schools/{schoolId}/bank-accounts` | Create | Finance, SuperAdmin |
| `GET` | `/admin/schools/{schoolId}/bank-accounts/{id}` | View (masked unless authorized) | Finance, SuperAdmin |
| `PUT` | `/admin/schools/{schoolId}/bank-accounts/{id}` | Update (triggers approval) | Finance, SuperAdmin |
| `PATCH` | `/admin/schools/{schoolId}/bank-accounts/{id}/status` | Activate/deactivate | Finance, SuperAdmin |
| `POST` | `/admin/schools/{schoolId}/bank-accounts/{id}/approve` | Approve change (checker) | Finance, SuperAdmin |
| `POST` | `/admin/schools/{schoolId}/bank-accounts/{id}/reject` | Reject change | Finance, SuperAdmin |

### Funding Sources

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/funding-sources` | List | Operations, Finance, SuperAdmin |
| `POST` | `/admin/funding-sources` | Create | Operations, SuperAdmin |
| `GET` | `/admin/funding-sources/{id}` | Get + allocation/utilization | Operations, Finance, SuperAdmin |
| `PUT` | `/admin/funding-sources/{id}` | Update | Operations, SuperAdmin |
| `PATCH` | `/admin/funding-sources/{id}/status` | Activate/deactivate | Operations, SuperAdmin |

### Disbursement Items

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/disbursement-items` | List | Finance, Operations, SuperAdmin |
| `POST` | `/admin/disbursement-items` | Create | SuperAdmin |
| `PUT` | `/admin/disbursement-items/{id}` | Update | SuperAdmin |
| `PATCH` | `/admin/disbursement-items/{id}/status` | Activate/deactivate | SuperAdmin |

### Reference Data

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/reference-data/{type}` | List by type | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/reference-data/{type}` | Create entry | SuperAdmin |
| `PUT` | `/admin/reference-data/{type}/{id}` | Update | SuperAdmin |
| `PATCH` | `/admin/reference-data/{type}/{id}/status` | Deactivate | SuperAdmin |

---

## Beneficiary Management

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries` | List (`?programId=&status=&schoolId=&district=&q=`) | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/beneficiaries` | Create individual record | Operations, SuperAdmin |
| `GET` | `/admin/beneficiaries/{id}` | Get full profile + guardians + documents | Operations, Finance, M&E, SuperAdmin |
| `PUT` | `/admin/beneficiaries/{id}` | Update details | Operations, SuperAdmin |
| `PATCH` | `/admin/beneficiaries/{id}/status` | Change status (reason required for suspension/closure) | Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{id}/reinstate` | Reinstate suspended beneficiary | Operations, SuperAdmin |
| `GET` | `/admin/beneficiaries/{id}/audit-log` | Get change history | SuperAdmin, Auditor |

### Guardians

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries/{beneficiaryId}/guardians` | List | Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/guardians` | Add | Operations, SuperAdmin |
| `PUT` | `/admin/beneficiaries/{beneficiaryId}/guardians/{id}` | Update | Operations, SuperAdmin |
| `DELETE` | `/admin/beneficiaries/{beneficiaryId}/guardians/{id}` | Remove | Operations, SuperAdmin |

### Beneficiary Documents

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries/{beneficiaryId}/documents` | List | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/documents` | Upload (multipart) | Operations, SuperAdmin |
| `GET` | `/admin/documents/{id}/download` | Download file | Operations, Finance, M&E, SuperAdmin, Auditor (read) |
| `PUT` | `/admin/documents/{id}/status` | Verify/reject (reason required for reject) | Operations, SuperAdmin |
| `POST` | `/admin/documents/{id}/version` | Upload new version | Operations, SuperAdmin |
| `GET` | `/admin/documents/{id}/versions` | Get version history | Operations, SuperAdmin |
| `POST` | `/admin/documents/{id}/request-reupload` | Request re-upload | Operations, SuperAdmin |

---

## CSV Bulk Import

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/imports/templates/beneficiary` | Download CSV template | Operations, SuperAdmin |
| `POST` | `/admin/imports/beneficiaries` | Upload CSV (multipart) | Operations, SuperAdmin |
| `GET` | `/admin/imports/{importId}` | Get import status + summary | Operations, SuperAdmin |
| `GET` | `/admin/imports/{importId}/errors` | Download error log (CSV) | Operations, SuperAdmin |
| `GET` | `/admin/imports` | List import history | Operations, SuperAdmin |

### Onboarding from Import

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/onboarding/pending` | List imported records pending onboarding | Operations, SuperAdmin |
| `POST` | `/admin/onboarding/{importedRecordId}/validate` | Confirm validation passed | Operations, SuperAdmin |
| `POST` | `/admin/onboarding/{importedRecordId}/approve` | Approve + activate beneficiary | Operations, SuperAdmin |
| `POST` | `/admin/onboarding/{importedRecordId}/exception` | Flag as exception with reason | Operations, SuperAdmin |
| `PUT` | `/admin/onboarding/exceptions/{id}/resolve` | Resolve exception | Operations, SuperAdmin |

---

## Award Management

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/awards` | List (`?beneficiaryId=&programId=&status=&period=`) | Operations, Finance, SuperAdmin |
| `POST` | `/admin/awards` | Create award | Operations, SuperAdmin |
| `GET` | `/admin/awards/{id}` | Get with balance + schedule | Operations, Finance, SuperAdmin |
| `PUT` | `/admin/awards/{id}` | Update (before first disbursement) | Operations, SuperAdmin |
| `PATCH` | `/admin/awards/{id}/status` | Activate/suspend/close (reason required for suspend/close) | Operations, SuperAdmin |
| `POST` | `/admin/awards/{id}/reinstate` | Reinstate suspended award | Operations, SuperAdmin |
| `POST` | `/admin/awards/{id}/renew` | Renew for new period | Operations, SuperAdmin |
| `POST` | `/admin/awards/{id}/letter/generate` | Generate award letter | Operations, SuperAdmin |
| `GET` | `/admin/awards/{id}/letter` | Download latest letter | Operations, Finance, SuperAdmin |
| `GET` | `/admin/awards/{id}/disbursements` | List disbursements for this award | Finance, Operations, SuperAdmin |
| `GET` | `/admin/awards/{id}/audit-log` | Get award change history | SuperAdmin, Auditor |

**Award create body:**
```json
{
  "beneficiaryId": "uuid",
  "programId": "uuid",
  "fundingSourceId": "uuid",
  "amount": 150000.00,
  "startDate": "2026-09-01",
  "endDate": "2027-08-31",
  "awardType": "recurring",
  "disbursementSchedule": [
    {"term": "Term 1", "amount": 50000.00, "dueDate": "2026-09-15"},
    {"term": "Term 2", "amount": 50000.00, "dueDate": "2027-01-15"},
    {"term": "Term 3", "amount": 50000.00, "dueDate": "2027-04-15"}
  ]
}
```

---

## Disbursement & Financial Tracking

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/disbursements` | List (`?programId=&status=&period=&payeeType=`) | Finance, Operations, SuperAdmin |
| `POST` | `/admin/disbursements` | Create (Maker) | Finance |
| `POST` | `/admin/disbursements/batch` | Create batch disbursements | Finance |
| `GET` | `/admin/disbursements/{id}` | Get with approval trail + evidence | Finance, Operations, SuperAdmin |
| `PUT` | `/admin/disbursements/{id}` | Update (before approval only) | Finance |
| `POST` | `/admin/disbursements/{id}/approve` | Approve (Checker — blocked if self-created) | Finance |
| `POST` | `/admin/disbursements/{id}/reject` | Reject with reason | Finance |
| `POST` | `/admin/disbursements/{id}/evidence` | Upload payment evidence (multipart) | Finance |
| `PATCH` | `/admin/disbursements/{id}/status` | Update status (controlled transitions) | Finance |
| `POST` | `/admin/disbursements/{id}/reconcile` | Mark as reconciled | Finance |
| `POST` | `/admin/disbursements/{id}/reverse` | Record reversal with reason | Finance |
| `POST` | `/admin/disbursements/{id}/return` | Record returned funds | Finance |

**Disbursement create body:**
```json
{
  "awardId": "uuid",
  "amount": 50000.00,
  "category": "fees",
  "academicPeriod": "2026-T1",
  "payeeType": "school",
  "payeeId": "uuid",
  "notes": "Term 1 tuition fees"
}
```

**Status transition rules (server-enforced):**
```
Requested → Approved (by Checker, not Maker)
Approved → Paid (evidence required)
Paid → Reconciled (locked, no further changes)
Paid → Failed (reason required)
Failed → Requested (re-submit)
Any → Reversed (reason + balance restored)
```

---

## Monitoring & Evaluation

### Academic Performance

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries/{beneficiaryId}/performance` | List historical | M&E, Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/performance` | Record results | M&E |
| `PUT` | `/admin/beneficiaries/{beneficiaryId}/performance/{id}` | Update | M&E |

### Attendance & Progression

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/attendance` | Record attendance | M&E |
| `GET` | `/admin/beneficiaries/{beneficiaryId}/attendance` | Get records | M&E, Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/progression` | Record progression status | M&E |

### At-Risk Management

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries/at-risk` | List at-risk beneficiaries | M&E, Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{id}/at-risk` | Flag as at-risk with reason | M&E |
| `DELETE` | `/admin/beneficiaries/{id}/at-risk` | Remove flag with justification | M&E |

### Interventions

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/beneficiaries/{beneficiaryId}/interventions` | List | M&E, Operations, SuperAdmin |
| `POST` | `/admin/beneficiaries/{beneficiaryId}/interventions` | Log | M&E |
| `PUT` | `/admin/interventions/{id}` | Update | M&E |
| `PATCH` | `/admin/interventions/{id}/status` | Update status | M&E |

### Monitoring Visits

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/monitoring-visits` | List (`?beneficiaryId=&schoolId=`) | M&E, Operations, SuperAdmin |
| `POST` | `/admin/monitoring-visits` | Record | M&E |
| `GET` | `/admin/monitoring-visits/{id}` | Get details | M&E, Operations, SuperAdmin |
| `PUT` | `/admin/monitoring-visits/{id}` | Update | M&E |
| `POST` | `/admin/monitoring-visits/{id}/attachments` | Upload report | M&E |

### Outcomes

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `POST` | `/admin/beneficiaries/{id}/outcome` | Record completion/graduation/exit | M&E, Operations |
| `GET` | `/admin/programs/{programId}/outcome-metrics` | Get outcome statistics | M&E, Management, SuperAdmin |

---

## Reporting & Dashboards

### Dashboard

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/dashboard/summary` | High-level KPIs | Management, SuperAdmin |
| `GET` | `/admin/dashboard/beneficiaries` | Beneficiary breakdown | Operations, Management, SuperAdmin |
| `GET` | `/admin/dashboard/disbursements` | Disbursement summary | Finance, Management, SuperAdmin |
| `GET` | `/admin/dashboard/budget` | Budget utilization | Finance, Management, SuperAdmin |
| `GET` | `/admin/dashboard/at-risk` | At-risk summary | M&E, Management, SuperAdmin |

### Standard Reports

| Method | Endpoint | Roles |
| --- | --- | --- |
| `GET` | `/admin/reports/beneficiary-register` | Operations, Management, Auditor |
| `GET` | `/admin/reports/awards` | Operations, Finance |
| `GET` | `/admin/reports/disbursements` | Finance, Auditor |
| `GET` | `/admin/reports/budget-utilization` | Management, Finance, Operations |
| `GET` | `/admin/reports/payments-by-school` | Finance, Operations |
| `GET` | `/admin/reports/me-outcomes` | M&E, Management |
| `GET` | `/admin/reports/reconciliation` | Finance, Auditor |

All report endpoints support filters: `?programId=&academicPeriod=&district=&schoolId=&beneficiaryStatus=&format=csv|xlsx|pdf`

### Dynamic Report Builder

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `POST` | `/admin/reports/dynamic/fields` | Get available report fields | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/reports/dynamic/generate` | Generate ad-hoc report | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/reports/dynamic/templates` | Save as template | Operations, Finance, M&E, SuperAdmin |
| `GET` | `/admin/reports/dynamic/templates` | List saved templates | Operations, Finance, M&E, SuperAdmin |
| `GET` | `/admin/reports/dynamic/templates/{id}` | Get template definition | Operations, Finance, M&E, SuperAdmin |
| `PUT` | `/admin/reports/dynamic/templates/{id}` | Update template | Operations, Finance, M&E, SuperAdmin |
| `DELETE` | `/admin/reports/dynamic/templates/{id}` | Delete template | Operations, Finance, M&E, SuperAdmin |
| `POST` | `/admin/reports/dynamic/templates/{id}/run` | Run saved template | Operations, Finance, M&E, SuperAdmin |

### Scheduled Reports

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `POST` | `/admin/reports/schedules` | Create scheduled delivery | Operations, Finance, M&E, SuperAdmin |
| `GET` | `/admin/reports/schedules` | List schedules | Operations, Finance, M&E, SuperAdmin |
| `PUT` | `/admin/reports/schedules/{id}` | Update schedule | Operations, Finance, M&E, SuperAdmin |
| `DELETE` | `/admin/reports/schedules/{id}` | Cancel schedule | Operations, Finance, M&E, SuperAdmin |

---

## Notifications & Communications

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/notifications/templates` | List templates | Operations, SuperAdmin |
| `POST` | `/admin/notifications/templates` | Create template | Operations, SuperAdmin |
| `PUT` | `/admin/notifications/templates/{id}` | Update template | Operations, SuperAdmin |
| `GET` | `/admin/notifications/triggers` | List event → template mappings | Operations, SuperAdmin |
| `PUT` | `/admin/notifications/triggers/{id}/toggle` | Enable/disable trigger | Operations, SuperAdmin |
| `GET` | `/admin/notifications/log` | Query sent notifications | SuperAdmin, Auditor |

---

## Audit & Compliance

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/audit-logs` | Query (`?entity=&action=&userId=&from=&to=`) | SuperAdmin, Auditor |
| `GET` | `/admin/audit-logs/{id}` | Get single entry with before/after | SuperAdmin, Auditor |
| `GET` | `/admin/audit-logs/export` | Export audit logs | SuperAdmin, Auditor |
| `GET` | `/admin/audit-logs/document-downloads` | Document download log | SuperAdmin, Auditor |
| `GET` | `/admin/audit-logs/report-exports` | Report export log | SuperAdmin, Auditor |

---

## System Configuration

| Method | Endpoint | Description | Roles |
| --- | --- | --- | --- |
| `GET` | `/admin/system/smtp-config` | Get SMTP config (masked) | SuperAdmin |
| `PUT` | `/admin/system/smtp-config` | Update SMTP settings | SuperAdmin |
| `POST` | `/admin/system/smtp-config/test` | Test email delivery | SuperAdmin |
| `GET` | `/admin/system/backup-status` | Last backup status | SuperAdmin |
| `GET` | `/admin/system/retention-policies` | Get retention config | SuperAdmin |
| `PUT` | `/admin/system/retention-policies` | Update retention periods | SuperAdmin |

---

## Admin Role Guidance

| Role | Suggested API access |
| --- | --- |
| `SuperAdmin` | Full access: user management, roles, system config, audit logs, destructive operations |
| `Operations` | Programs, beneficiaries, imports, onboarding, awards, documents, school master data |
| `Finance` | Disbursements (maker + checker — segregated), bank accounts, financial reports, reconciliation |
| `M&E` | Academic performance, at-risk flags, interventions, monitoring visits, outcome reporting |
| `Auditor` | Read-only: audit logs, export logs, reports, beneficiary records |

---

## Implementation Notes

- Use `GET, POST` for collection endpoints and `GET, PUT, PATCH, DELETE` for item endpoints consistently.
- Prefer soft deletes (status changes) for beneficiaries, awards, and disbursements. Hard deletes allowed only for reference data not yet used in transactions.
- Admin list endpoints should include enough related data to avoid N+1 queries (include school name, program name, status labels).
- Every mutation must create an `AuditLog` record with `action`, `entity_type`, `entity_id`, `user_id`, `old_values`, and `new_values`.
- Maker-checker endpoints must verify the approving user is different from the creating user.
- Financial amount fields use decimal (not float) to avoid precision errors.
- File uploads are limited to configurable size (recommended 50 MB default) and virus-scanned synchronously on upload.
- Paginated responses default to `page=1, limit=20`. Maximum limit is 100.
