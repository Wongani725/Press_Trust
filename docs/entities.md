# Press Trust SMS Entity Specification

This document turns the entity definitions from the SRS v1.2 into a clean handoff document for coding agents. It is meant to guide backend and web portal implementation.

## Product Surfaces

| Surface | Planned stack |
| --- | --- |
| Admin portal | Next.js (App Router) |
| Backend/API | TypeScript, Express.js |
| Auth | JWT + TOTP MFA |
| Database | PostgreSQL |
| ORM | Prisma |

## Implementation Conventions

- Use singular PascalCase model names in Prisma, for example `User`, `Program`, `Award`.
- Use snake_case column names in the database.
- Use UUIDs for primary keys on all operational entities unless marked as `int` for simple lookup tables.
- Use `Decimal` money fields for award amounts, budget ceilings, and disbursement amounts. Do not use floating point.
- Store document paths as URI strings pointing to the local `uploads/` folder.
- Default nullability is required unless a field is marked nullable.
- Add `created_at` and `updated_at` to all operational records.
- Bank account numbers and other sensitive fields are masked by default (`****1234`). Only authorized roles can view unmasked values.
- Status fields use defined enums; transitions follow controlled state machines.
- All mutations on operational records create an `AuditLog` entry.

## Normalized Naming

| Source or variation | Canonical name |
| --- | --- |
| `beneficiary` (SRS) | `Beneficiary` |
| `disbursement` | `Disbursement` |
| `payee` | `Payee` (string field) |
| `guardian` | `Guardian` |
| `funding source` | `FundingSource` |
| `monitoring visit` | `MonitoringVisit` |
| `academic period` | `AcademicPeriod` (reference data) |
| `intervention` | `Intervention` |
| `program` | `Program` |

## Core Enums

| Enum | Values |
| --- | --- |
| `UserRole` | `SuperAdmin`, `Operations`, `Finance`, `M&E`, `Auditor`, `Sponsor` |
| `UserStatus` | `active`, `inactive`, `blocked` |
| `ProgramStatus` | `Draft`, `Open`, `Closed`, `Archived` |
| `BeneficiaryStatus` | `Imported`, `PendingOnboarding`, `Active`, `Suspended`, `Closed` |
| `AwardStatus` | `Draft`, `Active`, `Suspended`, `Completed`, `Closed` |
| `AwardType` | `one_off`, `recurring`, `renewable` |
| `DisbursementStatus` | `Requested`, `Approved`, `Paid`, `Failed`, `Reconciled` |
| `PayeeType` | `school`, `guardian`, `vendor` |
| `DocumentStatus` | `Pending`, `Verified`, `Rejected` |
| `ProgressionStatus` | `Promoted`, `Repeated`, `Completed`, `Dropped` |
| `InterventionStatus` | `Open`, `InProgress`, `Closed` |
| `EntityType` | `beneficiary`, `school` |
| `NotificationChannel` | `email`, `in_app` |

## Domain Map

- **Identity:** users, roles, authentication, session management.
- **Program management:** scholarship programs, funding sources, budgets, eligibility rules.
- **Master data:** schools, school bank accounts, disbursement item catalog, reference data (districts, academic periods).
- **Beneficiary lifecycle:** beneficiary records, guardians, CSV import, onboarding, documents.
- **Award management:** awards, award letters, renewals, funding source linkage.
- **Financial tracking:** disbursements, payment evidence, reconciliation, reversals, returned funds.
- **Monitoring & evaluation:** academic performance, attendance, progression, at-risk flags, interventions, monitoring visits, outcomes.
- **Reporting & analytics:** dashboard KPIs, standard reports, dynamic report builder, scheduled reports.
- **Communications:** notification templates, email triggers, notification logs.
- **Audit & compliance:** audit logs, export logs, document download logs.

## Identity

### User

Represents an internal system user with role-based access.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `name` | `string` | Full display name |
| `email` | `string` | Unique; used for login |
| `password_hash` | `string` | BCrypt hash |
| `mfa_secret` | `string` | TOTP secret; nullable until MFA is set up |
| `mfa_enabled` | `boolean` | Defaults to `false` |
| `role` | `UserRole` | User's primary role |
| `phone` | `string` | Nullable |
| `status` | `UserStatus` | Defaults to `active` |
| `failed_login_attempts` | `int` | Defaults to `0` |
| `locked_until` | `datetime` | Nullable; lockout expiry |
| `last_login` | `datetime` | Nullable |
| `programs` | `Program[]` | Many-to-many; which programs user can access |

Important relationships:
- Has many audit log entries.
- Has many notification events (as sender/trigger).
- Assigned to one or more programs via join table.

### Role

(Optional — if roles need to be dynamic. For now, roles are enum-based with hardcoded permissions.)

---

## Master Data

### Program

A scholarship or bursary program with independent configuration.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `name` | `string` | Required |
| `description` | `string` | Nullable |
| `status` | `ProgramStatus` | Defaults to `Draft` |
| `application_open_date` | `date` | Nullable |
| `application_close_date` | `date` | Nullable |
| `budget_ceiling` | `decimal` | Total program budget |
| `budget_utilized` | `decimal` | Computed; sum of active award amounts |
| `award_types` | `AwardType[]` | Array of allowed award types |
| `eligibility_rules` | `json` | Configurable rules; nullable |
| `evaluation_rubric` | `json` | Criteria, weights, thresholds; nullable |
| `workflow_config` | `json` | Workflow stages and approvers; nullable |
| `form_config` | `json` | Application form field definitions; nullable |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Important relationships:
- Has many beneficiaries.
- Has many awards.
- Has many funding source allocations.
- Belongs to many users (via assignment).

### FundingSource

Donor or funding allocation linked to programs.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `name` | `string` | Required |
| `description` | `string` | Nullable |
| `total_allocation` | `decimal` | Total funds available |
| `utilized_amount` | `decimal` | Computed from linked awards |
| `status` | `string` | `active` or `inactive` |

### School

Educational institution record.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `name` | `string` | Required |
| `type` | `string` | e.g., `secondary`, `primary`, `university` |
| `district` | `string` | Required |
| `location` | `string` | Nullable |
| `contact_phone` | `string` | Nullable |
| `contact_email` | `string` | Nullable |
| `registration_status` | `string` | `registered` or `unregistered`; nullable |
| `status` | `string` | `active` or `inactive` |

Important relationships:
- Has many school bank accounts.
- Has many beneficiaries enrolled.

### SchoolBankAccount

Bank accounts linked to a school, with maker-checker approval for changes.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `school_id` | `uuid` | References `School.id` |
| `bank_name` | `string` | Required |
| `branch` | `string` | Nullable |
| `account_number` | `string` | Masked by default; encrypted at rest |
| `account_holder_name` | `string` | Required |
| `status` | `string` | `active` or `inactive` |
| `approval_status` | `string` | `pending`, `approved`, `rejected` |

Implementation notes:
- Changes to active bank accounts require maker-checker approval.
- Unmasked view logged in audit trail.

### DisbursementItem

Catalog of allowable support categories.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `int` | Primary key |
| `name` | `string` | e.g., `fees`, `uniform`, `books`, `boarding`, `exam_fees` |
| `status` | `string` | `active` or `inactive` |

### ReferenceData

Lookup entries for districts, academic periods, program types, etc.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `int` | Primary key |
| `type` | `string` | e.g., `district`, `academic_period`, `program_type` |
| `code` | `string` | Unique within type |
| `name` | `string` | Display name |
| `status` | `string` | `active` or `inactive` |

---

## Beneficiary Lifecycle

### Beneficiary

Core beneficiary record spanning the full scholarship lifecycle.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_identifier` | `string` | Unique system-generated ID (e.g., `PT-2026-0001`) |
| `first_name` | `string` | |
| `last_name` | `string` | |
| `date_of_birth` | `date` | Nullable |
| `gender` | `string` | `male` or `female` |
| `national_id` | `string` | Nullable; used for dedup |
| `exams_id` | `string` | Nullable; used for dedup |
| `contact_email` | `string` | Nullable |
| `contact_phone` | `string` | Nullable |
| `district` | `string` | |
| `school_id` | `uuid` | References `School.id` |
| `program_id` | `uuid` | References `Program.id` |
| `status` | `BeneficiaryStatus` | Defaults to `Imported` |
| `status_reason` | `string` | Nullable; required for suspension/closure |
| `academic_year` | `string` | Current academic year |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Important relationships:
- Belongs to a school and program.
- Has many guardians.
- Has many documents.
- Has many academic performance records.
- Has many intervention records.
- Has many awards.

### Guardian

Parent, next-of-kin, or guardian linked to a beneficiary.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_id` | `uuid` | References `Beneficiary.id` |
| `name` | `string` | |
| `relationship` | `string` | e.g., `father`, `mother`, `guardian` |
| `contact_phone` | `string` | |
| `contact_email` | `string` | Nullable |
| `consent_provided` | `boolean` | Defaults to `false` |

### Document

Supporting documents linked to beneficiaries or disbursements.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `documentable_id` | `uuid` | Polymorphic: beneficiary or disbursement ID |
| `documentable_type` | `string` | `beneficiary` or `disbursement` |
| `file_path` | `string` | Path in local `uploads/` folder |
| `original_name` | `string` | Original filename |
| `mime_type` | `string` | |
| `file_size` | `int` | Bytes |
| `document_type` | `string` | e.g., `admission_letter`, `national_id`, `payment_voucher` |
| `status` | `DocumentStatus` | Defaults to `Pending` |
| `rejection_reason` | `string` | Nullable; required when Rejected |
| `version` | `int` | Defaults to `1` |
| `expiry_date` | `date` | Nullable |
| `virus_scan_status` | `string` | `pending`, `clean`, `infected` |
| `uploaded_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Implementation notes:
- Previous document versions are retained for audit.
- Documents linked to approved financial transactions cannot be deleted.

---

## Award Management

### Award

Scholarship award linked to an approved beneficiary and program.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_id` | `uuid` | References `Beneficiary.id` |
| `program_id` | `uuid` | References `Program.id` |
| `funding_source_id` | `uuid` | References `FundingSource.id` |
| `amount` | `decimal` | Total award amount |
| `balance_remaining` | `decimal` | Amount minus disbursed |
| `start_date` | `date` | |
| `end_date` | `date` | |
| `award_type` | `AwardType` | |
| `status` | `AwardStatus` | Defaults to `Draft` |
| `status_reason` | `string` | Nullable; required for suspension/closure |
| `parent_award_id` | `uuid` | Nullable; references original award on renewal |
| `budget_utilization_updated` | `boolean` | Internal flag for budget sync |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Implementation notes:
- Balance is reduced automatically on approved disbursements.
- Cannot create award if program budget ceiling would be exceeded.
- Cannot disburse if award is not Active.

---

## Financial Tracking

### Disbursement

A payment request or disbursement record.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `award_id` | `uuid` | References `Award.id` |
| `beneficiary_id` | `uuid` | References `Beneficiary.id` |
| `program_id` | `uuid` | References `Program.id` |
| `amount` | `decimal` | |
| `category` | `string` | References `DisbursementItem.name` |
| `academic_period` | `string` | e.g., `2026-T1` |
| `payee_type` | `PayeeType` | |
| `payee_id` | `uuid` | References school, or nullable for guardian/vendor |
| `payee_name` | `string` | Denormalized for reporting |
| `payee_bank_account` | `string` | Masked; snapshot from master data at time of processing |
| `status` | `DisbursementStatus` | Defaults to `Requested` |
| `failure_reason` | `string` | Nullable; required for Failed |
| `created_by` | `uuid` | Maker; references `User.id` |
| `approved_by` | `uuid` | Checker; nullable |
| `approved_at` | `datetime` | Nullable |
| `paid_at` | `datetime` | Nullable |
| `reconciled_at` | `datetime` | Nullable |
| `reconciled_by` | `uuid` | Nullable |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

Implementation notes:
- Maker cannot approve their own disbursement (enforced at application layer).
- Status transitions: Requested → Approved → Paid → Reconciled. Failed can be set from Requested or Approved. Reversal can be recorded from Paid.
- Payment evidence must be attached before marking as Paid (configurable).
- Duplicate prevention: same beneficiary + category + academic period blocked.

### DisbursementEvidence

Payment evidence attached to a disbursement.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `disbursement_id` | `uuid` | References `Disbursement.id` |
| `document_id` | `uuid` | References `Document.id` |
| `uploaded_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |

### Reversal

Record of a disbursement reversal or returned funds.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `disbursement_id` | `uuid` | References `Disbursement.id` |
| `type` | `string` | `reversal` or `returned_funds` |
| `amount` | `decimal` | |
| `reason` | `string` | |
| `created_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |

---

## Monitoring & Evaluation

### AcademicPerformance

Term/semester academic results for a beneficiary.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_id` | `uuid` | References `Beneficiary.id` |
| `school_id` | `uuid` | References `School.id` |
| `academic_period` | `string` | |
| `subjects` | `json` | Array of {name, score, grade} |
| `overall_score` | `decimal` | Nullable |
| `attendance_percentage` | `decimal` | Nullable |
| `progression` | `ProgressionStatus` | Nullable |
| `notes` | `string` | Nullable |
| `created_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

### Intervention

Logged action for at-risk or flagged beneficiaries.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_id` | `uuid` | References `Beneficiary.id` |
| `action` | `string` | Description of intervention |
| `assigned_to` | `uuid` | References `User.id` |
| `due_date` | `date` | |
| `status` | `InterventionStatus` | Defaults to `Open` |
| `resolution_notes` | `string` | Nullable |
| `created_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

### AtRiskFlag

Tracks at-risk status for a beneficiary.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `beneficiary_id` | `uuid` | References `Beneficiary.id`; unique if only one active flag |
| `reason` | `string` | |
| `flagged_by` | `uuid` | References `User.id` |
| `resolved` | `boolean` | Defaults to `false` |
| `resolved_at` | `datetime` | Nullable |
| `resolved_by` | `uuid` | Nullable |
| `created_at` | `datetime` | |
| `resolved_at` | `datetime` | |

### MonitoringVisit

Record of a site visit to a beneficiary or school.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `entity_type` | `EntityType` | `beneficiary` or `school` |
| `entity_id` | `uuid` | Polymorphic reference |
| `visit_date` | `date` | |
| `findings` | `text` | |
| `follow_up_actions` | `text` | Nullable |
| `conducted_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

---

## Reporting & Audit

### AuditLog

Immutable log of all user actions and system events.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | Nullable for system actions |
| `action` | `string` | e.g., `create`, `update`, `approve`, `export`, `status_change` |
| `entity_type` | `string` | e.g., `Beneficiary`, `Award`, `Disbursement` |
| `entity_id` | `uuid` | |
| `old_values` | `json` | Nullable |
| `new_values` | `json` | Nullable |
| `ip_address` | `string` | Nullable |
| `created_at` | `datetime` | |

Implementation notes:
- Tamper-evident: no update or delete allowed on audit logs.
- Retained per configurable retention policy.

### ReportDefinition

Saved dynamic report template.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `name` | `string` | |
| `fields` | `json` | Selected report fields/layout |
| `filters` | `json` | Applied filter configuration |
| `created_by` | `uuid` | References `User.id` |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

### NotificationLog

Record of sent notifications.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `recipient` | `string` | Email address |
| `channel` | `NotificationChannel` | |
| `template_id` | `string` | Which template was used |
| `status` | `string` | `sent`, `failed` |
| `error_message` | `string` | Nullable |
| `sent_at` | `datetime` | |

### ExportLog

Record of data/report exports.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key |
| `user_id` | `uuid` | References `User.id` |
| `export_type` | `string` | Report name or data type |
| `format` | `string` | `csv`, `xlsx`, `pdf` |
| `filters` | `json` | Filters applied at time of export |
| `exported_at` | `datetime` | |

---

## Suggested Relationship Rules

- `User.email` is unique.
- `Beneficiary` uniqueness is enforced by `national_id` + `exams_id` + `program_id` (configurable).
- `Disbursement` uniqueness (same beneficiary + category + academic period) is enforced; override allowed with authorized justification.
- `Award` can only be created for a beneficiary with `Active` status.
- `Disbursement` can only be created for an `Active` award.
- `SchoolBankAccount` changes require maker-checker approval; pending changes are tracked until approved.
- `AuditLog` records are immutable — no update or delete allowed.
- `Document` deletion is blocked if linked to an approved financial transaction.

## Background Jobs And Derived State

- Expire user lockout after configured period.
- Auto-flag beneficiaries whose performance falls below configured thresholds.
- Flag awards reaching end date.
- Mark expired documents as flagged.
- Disable expired campaigns.
- Schedule automated report generation and delivery.
- Recalculate program budget utilization when awards are created/closed.
- Sync award balance remaining after disbursement approvals and reversals.

## Access Control Notes

| Role | Access scope |
| --- | --- |
| `SuperAdmin` | Full system access; user management, role assignment, system config |
| `Operations` | Program management, beneficiary intake, onboarding, awards (non-financial), document management |
| `Finance` | Disbursement creation (Maker), approval (Checker), reconciliation; financial reports; bank accounts |
| `M&E` | Academic performance, at-risk flags, interventions, monitoring visits, outcome reporting |
| `Auditor` | Read-only access to all records, audit logs, export logs |
| `Sponsor` | View-only access to program portfolio and approved reports |

## Open Questions Before Prisma Schema Finalization

- Should `Document` use polymorphic `documentable_type`/`documentable_id` or separate join tables per entity?
- Should roles stay as an enum or become a dynamic table for future flexibility?
- Should `AtRiskFlag` be a separate table or a boolean on `Beneficiary` with a history table?
- Should disbursement schedules be stored as JSON on `Award` or as a separate `DisbursementSchedule` table?
- Should `AuditLog` include a `request_id` or correlation ID for tracing?
- Should exported files be stored permanently or cleaned up after a retention period?
- What is the exact file size limit for document uploads?
- Should `SchoolBankAccount` have separate `pending_*` fields for changes awaiting approval, or use a separate `BankAccountChange` table?
