# Press Trust SMS Task Breakdown

This task breakdown converts the planning, entity, API, and architecture documents into small AI-ready implementation tasks for the Scholarship Management System. Every task is scoped for one focused OpenCode session, includes acceptance criteria and testing expectations, and avoids broad feature buckets.

## Sources Reviewed

- `SRS v1.2 — Press Trust SRS - 30 April 2026_text.txt`
- `entities.md`
- `workflow.md`
- `api_contract.md`
- `backend-architecture.md` (nyerere docs)
- `frontend-architecture.md` (nyerere docs)

## Project Summary

The Press Trust SMS is a scholarship administration platform for Press Trust Malawi. It includes a Next.js admin portal for internal users (Operations, Finance, M&E, Admin, Management, Auditor) and a TypeScript/Express backend using Prisma, PostgreSQL, and JWT + TOTP MFA. Core scope includes program management, beneficiary intake (CSV import), award management, disbursement processing with maker-checker-approver workflows, M&E tracking, document management, reporting, audit logging, and system configuration.

## Task Numbering Convention

- `BE-###`: Backend tasks (Wongani)
- `FE-###`: Frontend/Admin Portal tasks (Immanuel)
- `INT-###`: Integration tasks across systems
- `QA-###`: QA and testing tasks
- `DOC-###`: Documentation tasks

## Team Assignment Summary

| Team Member | Primary Area | Expected Focus |
| --- | --- | --- |
| Wongani | Backend | API foundation, auth, user management, programs, master data, import, beneficiaries, awards, disbursements, M&E, reporting, notifications, audit |
| Immanuel | Frontend / Next.js | Admin portal implementation using feature-based Next.js architecture |

## Task Dependency Notes

- Backend foundation tasks `BE-001` to `BE-009` should be completed before most backend feature endpoints.
- Frontend tasks can begin with API clients and mock data, but should not be considered complete until matching backend endpoints are available.
- Integration tasks should run after the first backend and frontend vertical slices are available.
- QA tasks depend on implemented feature slices and should be updated as acceptance criteria evolve.
- Database schema and API changes must update `entities.md` and `api_contract.md` through documentation tasks.

---

## Backend Workstream Tasks (Wongani)

### Task ID: [BE-001]
**Title:** Scaffold backend clean monolith foundation
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** None

#### Objective
Create the backend project structure with the TypeScript, Express.js, Prisma, PostgreSQL, and JWT auth architecture.

#### Relevant Files / Modules
- `src/app.ts`
- `src/api/controllers/`
- `src/api/routes/`
- `src/api/middleware/`
- `src/modules/`
- `src/shared/`
- `src/infrastructure/`
- `src/jobs/`
- `prisma/`

#### Implementation Notes
Set up the pragmatic clean monolith folder layout from `backend-architecture.md`. Add central app bootstrap, route registration, environment config loading (`dotenv`), database client location (`prisma/`), shared utilities, and placeholder module indexes without implementing business endpoints yet.

#### Acceptance Criteria
- Backend folder structure matches the architecture document.
- Express app can start with a `/health` endpoint.
- Prisma client is configured from environment variables.
- Route registration has a clear place for `/api/v1/auth`, `/api/v1/admin/*` routes.
- Environment config supports `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`.

#### Testing Expectations
- Add a health endpoint test if a test runner exists.
- Run TypeScript compile, lint, and backend test command if configured.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files consistent with the project testing design:
- **Unit tests** for services and controllers: mock dependencies using `vi.fn()`, no real database calls
- **Integration tests** for repositories: use real Prisma database connection
- Place test files adjacent to the source file they test: `src/modules/<module>/<layer>/<name>.spec.ts`
- Cross-cutting concerns (shared utilities, middleware, schema validation, auth guards) belong in `src/tests/*.spec.ts`
- The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-002]
**Title:** Define Prisma base enums, User, Role, and AuditLog models
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-001

#### Objective
Create the first Prisma schema slice for shared enums, `User`, a join table for user-program assignment, and `AuditLog`.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/users/`
- `src/modules/audit/`
- `src/shared/domain/`

#### Implementation Notes
Add enums from `entities.md`: `UserRole`, `UserStatus`, `ProgramStatus`, `BeneficiaryStatus`, `AwardStatus`, `DisbursementStatus`, `DocumentStatus`, `PayeeType`, `ProgressionStatus`, `InterventionStatus`, `EntityType`, `AwardType`, `NotificationChannel`. Add `User`, `UserProgram` (join), and `AuditLog` models with relationships. `password_hash` is required. `mfa_secret` is nullable. `AuditLog` supports `old_values`/`new_values` as JSON.

#### Acceptance Criteria
- Prisma schema contains all enums.
- `User` model has correct fields: `id`, `name`, `email` (unique), `password_hash`, `mfa_secret`, `mfa_enabled`, `role`, `phone`, `status`, `failed_login_attempts`, `locked_until`, `last_login`.
- `UserProgram` join table exists.
- `AuditLog` supports JSON old/new values and nullable user reference.
- Migration can be generated locally.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
This task defines Prisma schema models. Update `src/tests/prisma-schema-validation.spec.ts` to assert that the newly defined models are present in the generated PrismaClient, have correct fields, and satisfy unique constraints. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-003]
**Title:** Define Prisma master data models (Program, FundingSource, School, SchoolBankAccount, DisbursementItem, ReferenceData)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-002

#### Objective
Add database models for all master and reference data entities.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/programs/`
- `src/modules/master-data/`

#### Implementation Notes
Implement `Program`, `FundingSource`, `School`, `SchoolBankAccount`, `DisbursementItem`, and `ReferenceData` according to `entities.md`. Program should store config fields as JSON (`eligibility_rules`, `evaluation_rubric`, `workflow_config`, `form_config`). SchoolBankAccount should have `approval_status` for maker-checker workflow.

#### Acceptance Criteria
- All master data models exist in Prisma.
- Program has JSON config fields for flexible configuration.
- SchoolBankAccount has `approval_status` field.
- ReferenceData uses compound unique constraint on `type` + `code`.
- Migration can be generated.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
Update `src/tests/prisma-schema-validation.spec.ts` to assert newly defined models. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-004]
**Title:** Define Prisma beneficiary lifecycle models (Beneficiary, Guardian, Document)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-003

#### Objective
Add database models for beneficiary records, guardians, and document management.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/beneficiaries/`
- `src/modules/documents/`

#### Implementation Notes
Implement `Beneficiary`, `Guardian`, and `Document` according to `entities.md`. Document uses polymorphic `documentable_type`/`documentable_id` for linking to both beneficiaries and disbursements. Add file metadata fields and version tracking.

#### Acceptance Criteria
- Beneficiary has all required fields including `beneficiary_identifier` (unique).
- Guardian links to beneficiary.
- Document supports polymorphism and versioning.
- Enums used for status fields.
- Migration can be generated.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
Update `src/tests/prisma-schema-validation.spec.ts`. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-005]
**Title:** Define Prisma award and disbursement models (Award, Disbursement, DisbursementEvidence, Reversal)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-004

#### Objective
Add database models for award management and financial tracking.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/awards/`
- `src/modules/financials/`

#### Implementation Notes
Implement `Award`, `Disbursement`, `DisbursementEvidence`, and `Reversal` according to `entities.md`. Award has `balance_remaining` computed field. Disbursement enforces maker-checker with `created_by` and `approved_by` fields.

#### Acceptance Criteria
- Award has lifecycle statuses with reason capture fields.
- Disbursement has full approval trail fields.
- DisbursementEvidence links disbursement to document.
- Reversal supports both `reversal` and `returned_funds` types.
- Migration can be generated.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
Update `src/tests/prisma-schema-validation.spec.ts`. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-006]
**Title:** Define Prisma M&E models (AcademicPerformance, Intervention, AtRiskFlag, MonitoringVisit)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-004

#### Objective
Add database models for monitoring and evaluation features.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/me/`

#### Implementation Notes
Implement `AcademicPerformance`, `Intervention`, `AtRiskFlag`, and `MonitoringVisit` according to `entities.md`. AcademicPerformance stores subjects as JSON array. AtRiskFlag has unique constraint on `beneficiary_id` for single active flag.

#### Acceptance Criteria
- AcademicPerformance stores subjects as JSON.
- Intervention has status, assigned user, due date.
- AtRiskFlag supports one active flag per beneficiary.
- MonitoringVisit supports polymorphic entity linking.
- Migration can be generated.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
Update `src/tests/prisma-schema-validation.spec.ts`. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-007]
**Title:** Define Prisma reporting models (ReportDefinition, NotificationLog, ExportLog)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-002

#### Objective
Add database models for reporting, notifications, and export tracking.

#### Relevant Files / Modules
- `prisma/schema.prisma`
- `src/modules/reporting/`
- `src/modules/notifications/`

#### Implementation Notes
Implement `ReportDefinition`, `NotificationLog`, and `ExportLog` according to `entities.md`. ReportDefinition stores fields and filters as JSON.

#### Acceptance Criteria
- ReportDefinition stores dynamic field/filter config as JSON.
- NotificationLog captures channel, recipient, status.
- ExportLog tracks user, type, format, and applied filters.
- Migration can be generated.

#### Testing Expectations
- Run Prisma format/validate.
- Add schema validation tests.

#### Test File Requirements
Update `src/tests/prisma-schema-validation.spec.ts`. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-008]
**Title:** Implement JWT auth middleware and login/MFA endpoints
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-001, BE-002

#### Objective
Protect backend routes with JWT bearer token verification, role-based authorization, and TOTP multi-factor authentication.

#### Relevant Files / Modules
- `src/api/middleware/auth.middleware.ts`
- `src/api/middleware/role.middleware.ts`
- `src/infrastructure/auth/`
- `src/api/routes/auth.routes.ts`
- `src/api/controllers/auth.controller.ts`

#### Implementation Notes
Add middleware that verifies JWT tokens, loads the `User` from the database, and exposes role checks. Implement `POST /api/v1/auth/login` (email + password → JWT + MFA challenge), `POST /api/v1/auth/mfa/verify` (TOTP → full access token). Use `jsonwebtoken` for JWT, `bcrypt` for password hashing, `speakeasy` for TOTP generation/verification. Implement account lockout after 3 failed attempts. Include `POST /auth/logout`, `POST /auth/refresh`, password reset endpoints.

#### Acceptance Criteria
- Login returns JWT + MFA challenge when MFA is enabled.
- MFA verify endpoint returns full access token.
- Role middleware blocks unauthorized roles.
- Account lockout after 3 failed attempts (configurable).
- Password reset flow works with email token.
- All auth endpoints handle edge cases (invalid credentials, expired tokens, locked accounts).

#### Testing Expectations
- Add unit tests for token generation, verification, role denial.
- Add integration tests for login, MFA, lockout, password reset.
- Mock bcrypt and speakeasy in tests.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-009]
**Title:** Implement shared API utilities (response helpers, pagination, validation, error middleware)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-001

#### Objective
Create shared backend utilities so all endpoints return consistent responses and handle errors uniformly.

#### Relevant Files / Modules
- `src/shared/dto/`
- `src/shared/utils/`
- `src/api/middleware/error.middleware.ts`
- `src/api/middleware/validate.middleware.ts`

#### Implementation Notes
Add standard response helpers (`success`, `paginated`, `error`), pagination query parser, request validation middleware using `zod`, async route wrapper, and central error handler. Match `api_contract.md` conventions for response shapes.

#### Acceptance Criteria
- Controllers can return consistent success and paginated responses.
- Validation failures return predictable error payloads with field-level details.
- Unhandled errors flow through central middleware with appropriate status codes.
- Pagination defaults to page=1, limit=20, max limit=100.
- No endpoint-specific logic is added in this task.

#### Testing Expectations
- Add unit tests for pagination parsing and error middleware.
- Run backend test suite.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-010]
**Title:** Implement user and role admin CRUD APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement admin endpoints for managing users and roles.

#### Relevant Files / Modules
- `src/modules/users/`
- `src/api/routes/admin/users.routes.ts`
- `src/api/controllers/admin/users.controller.ts`

#### Implementation Notes
Build `GET/POST /admin/users`, `GET/PUT /admin/users/{id}`, `PATCH /admin/users/{id}/status`, `POST /admin/users/{id}/unlock`, `POST /admin/users/{id}/mfa/reset`. For roles: `GET/POST /admin/roles`, `GET/PUT /admin/roles/{id}`, `PATCH /admin/roles/{id}/status`, `PUT /admin/roles/{id}/permissions`. Only SuperAdmin can manage users and roles. Implement user-program assignment.

#### Acceptance Criteria
- SuperAdmin can create/list/update users.
- User status can be changed (activate/suspend/deactivate/lock).
- Locked accounts can be unlocked by SuperAdmin.
- MFA secret can be reset by SuperAdmin.
- Roles can be created, updated, and deactivated.
- Role permissions can be assigned.
- Deleting a role is blocked if users are assigned to it.
- All mutations create AuditLog entries.

#### Testing Expectations
- Add integration tests for user CRUD, role CRUD, role protection, status changes.
- Verify audit log entries are created.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-011]
**Title:** Implement program management CRUD APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement admin endpoints for program configuration and management.

#### Relevant Files / Modules
- `src/modules/programs/`
- `src/api/routes/admin/programs.routes.ts`

#### Implementation Notes
Build `GET/POST /admin/programs`, `GET/PUT /admin/programs/{id}`, `PATCH /admin/programs/{id}/status`. Implement sub-resource endpoints for budget, funding sources, eligibility rules, evaluation rubric, workflow stages, form config, required documents, communication templates, notification triggers, and academic periods. Validate budget ceiling against existing award totals on status change.

#### Acceptance Criteria
- Operations/SuperAdmin can create/list/update programs.
- Program status transitions follow: Draft → Open → Closed → Archived.
- Closing a program prevents new intake but preserves historical data.
- Budget updates validate against existing commitments.
- All config sub-resources can be updated independently.
- All changes are audited.

#### Testing Expectations
- Add integration tests for program CRUD, status transitions, budget validation, config updates.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-012]
**Title:** Implement master data APIs (schools, bank accounts, funding sources, reference data)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement CRUD endpoints for all master data entities.

#### Relevant Files / Modules
- `src/modules/master-data/`
- `src/api/routes/admin/schools.routes.ts`
- `src/api/routes/admin/funding-sources.routes.ts`
- `src/api/routes/admin/reference-data.routes.ts`

#### Implementation Notes
Build endpoints for schools, school bank accounts (with maker-checker approval flow), funding sources, disbursement items, and reference data. Implement bank account masking by default; unmasked view requires `?unmasked=true` and appropriate role, with audit logging.

#### Acceptance Criteria
- Schools CRUD works with district/type filtering.
- School bank accounts are masked by default; only authorized roles can view unmasked.
- Bank account changes require maker-checker approval.
- Funding sources track allocation vs. utilization.
- Reference data uses compound `type` + `code` uniqueness.
- Delete is blocked for records referenced by transactions.

#### Testing Expectations
- Add integration tests for all master data CRUD, bank account masking, approval flow, delete protection.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-013]
**Title:** Implement CSV bulk import flow
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement the complete CSV import pipeline: template download, upload, validation, error reporting, and onboarding workflow.

#### Relevant Files / Modules
- `src/modules/imports/`
- `src/api/routes/admin/imports.routes.ts`

#### Implementation Notes
Build `GET /admin/imports/templates/beneficiary` (generates CSV template with headers), `POST /admin/imports/beneficiaries` (accepts CSV multipart upload). Implement row-level validation for required fields, data types, duplicates (National ID + Exams ID + Program), and referential integrity (school, district, program must exist). Generate downloadable error log and import summary. Valid rows proceed without being blocked by rejected rows. Implement onboarding endpoints for validation confirmation, approval, exception flagging, and resolution.

#### Acceptance Criteria
- Template download returns a valid CSV with correct headers.
- CSV upload validates all rows and returns summary + error log.
- Duplicate detection uses configurable uniqueness rules.
- Referential integrity is enforced.
- Valid rows are imported; rejected rows do not block valid ones.
- Onboarding workflow supports validate → approve/exception flow.
- Import history is maintained.

#### Testing Expectations
- Add integration tests for template generation, successful import, partial success, full failure, duplicate detection.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-014]
**Title:** Implement beneficiary CRUD, status management, and guardian APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement endpoints for beneficiary management including CRUD, status transitions, and guardian management.

#### Relevant Files / Modules
- `src/modules/beneficiaries/`
- `src/api/routes/admin/beneficiaries.routes.ts`

#### Implementation Notes
Build `GET/POST /admin/beneficiaries`, `GET/PUT /admin/beneficiaries/{id}`, `PATCH /admin/beneficiaries/{id}/status` (with mandatory reason for suspension/closure), `POST /admin/beneficiaries/{id}/reinstate`. Implement guardian CRUD as sub-resource. Enforce status transition rules: only Active beneficiaries can receive awards; disbursements blocked for non-Active. Validate duplicates on create.

#### Acceptance Criteria
- Beneficiary CRUD works with filtering by program, status, school, district.
- Status transitions follow rules: Imported → PendingOnboarding → Active → Suspended/Closed.
- Suspension and closure require mandatory reason.
- Reinstate restores to Active.
- Guardian CRUD works as beneficiary sub-resource.
- Duplicate beneficiary creation is blocked.
- Audit log captures all changes.

#### Testing Expectations
- Add integration tests for CRUD, status transitions, duplicate prevention, guardian CRUD, audit logging.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-015]
**Title:** Implement document upload, verification, and versioning APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement document management endpoints for upload, download, verification workflow, versioning, and access control.

#### Relevant Files / Modules
- `src/modules/documents/`
- `src/api/routes/admin/documents.routes.ts`
- `src/infrastructure/storage/`

#### Implementation Notes
Build document upload (multipart, virus-scanned), download (streaming, access-controlled), status update (Pending/Verified/Rejected with mandatory reason for rejection), version upload, version history. Store files in `uploads/` folder. Restrict document deletion: blocked for documents linked to approved financial transactions. Log all download activity.

#### Acceptance Criteria
- Upload saves file to `uploads/` folder with metadata in database.
- Virus scanning runs on upload (simulated or real).
- Document verification workflow: Pending → Verified/Rejected.
- Rejection requires reason.
- Version upload retains previous versions.
- Download is access-controlled and logged.
- Deletion is blocked for documents linked to approved transactions.

#### Testing Expectations
- Add integration tests for upload, download, verification, versioning, deletion protection, download logging.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-016]
**Title:** Implement award CRUD, activation, and lifecycle management APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement award management endpoints including creation, activation, suspension, closure, and renewal.

#### Relevant Files / Modules
- `src/modules/awards/`
- `src/api/routes/admin/awards.routes.ts`

#### Implementation Notes
Build `GET/POST /admin/awards`, `GET/PUT /admin/awards/{id}`, `PATCH /admin/awards/{id}/status`, `POST /admin/awards/{id}/reinstate`, `POST /admin/awards/{id}/renew`, `POST /admin/awards/{id}/letter/generate`. Enforce: beneficiary must be Active; award amount must not exceed program budget ceiling; amount must not exceed available funding source allocation. On activation, decrement program budget utilization. On closure, restore budget. Renewal creates linked award with updated dates.

#### Acceptance Criteria
- Award CRUD works with filtering by program, beneficiary, status.
- Creation validates beneficiary status and budget ceiling.
- Activation changes status to Active and updates budget utilization.
- Suspension/closure requires reason; closure restores budget.
- Reinstatement restores Active status.
- Renewal creates linked award with parent_award_id.
- Award letter generation uses configurable template.
- All status changes are audited.

#### Testing Expectations
- Add integration tests for award CRUD, activation budget check, suspension, closure, renewal, letter generation.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-017]
**Title:** Implement disbursement request and approval APIs (maker-checker)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement disbursement processing endpoints with maker-checker-approver workflow.

#### Relevant Files / Modules
- `src/modules/financials/`
- `src/api/routes/admin/disbursements.routes.ts`

#### Implementation Notes
Build `GET/POST /admin/disbursements`, `POST /admin/disbursements/batch`, `GET /admin/disbursements/{id}`, `PUT /admin/disbursements/{id}`, `POST /admin/disbursements/{id}/approve`, `POST /admin/disbursements/{id}/reject`, `POST /admin/disbursements/{id}/evidence`, `PATCH /admin/disbursements/{id}/status`. Enforce status machine: Requested → Approved → Paid → Reconciled. Block self-approval. Validate award balance, program budget, duplicate prevention. Require evidence before Paid status.

#### Acceptance Criteria
- Maker (Finance) creates disbursement request.
- Checker (different Finance user) approves; self-approval blocked.
- Validation checks: award balance, budget, duplicate (beneficiary + category + period).
- Payment evidence upload required before Paid status.
- Batch creation creates individual disbursement records.
- Status transitions follow defined state machine; invalid transitions return 422.
- All actions are audited with before/after values.

#### Testing Expectations
- Add integration tests for create, approve (including self-approval block), reject, evidence upload, status transitions, batch.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-018]
**Title:** Implement disbursement reconciliation, reversal, and returned funds APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-017

#### Objective
Implement endpoints for reconciliation, reversals, and returned funds handling.

#### Relevant Files / Modules
- `src/modules/financials/`
- `src/api/routes/admin/disbursements.routes.ts`

#### Implementation Notes
Build `POST /admin/disbursements/{id}/reconcile`, `POST /admin/disbursements/{id}/reverse`, `POST /admin/disbursements/{id}/return`. Reconciled records become immutable. Reversals and returns restore award balance. Record audit trail for all actions.

#### Acceptance Criteria
- Reconciliation marks disbursement as Reconciled and locks edits.
- Reversal records reason and restores award balance.
- Returned funds record amount and restore balance.
- Reconciled disbursements cannot be modified.
- All actions create audit log entries.

#### Testing Expectations
- Add integration tests for reconcile, reverse, return, and immutability after reconciliation.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-019]
**Title:** Implement M&E APIs (performance, attendance, progression, at-risk, interventions)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** High
**Depends On:** BE-008, BE-009

#### Objective
Implement endpoints for monitoring and evaluation features.

#### Relevant Files / Modules
- `src/modules/me/`
- `src/api/routes/admin/me.routes.ts`

#### Implementation Notes
Build academic performance CRUD, attendance recording, progression status, at-risk flagging (auto + manual), and intervention logging. Implement auto-flagging for beneficiaries whose performance falls below configurable thresholds. Enforce one active at-risk flag per beneficiary. Interventions track status (Open → In Progress → Closed).

#### Acceptance Criteria
- Performance can be recorded with subjects as JSON.
- Attendance and progression can be recorded per beneficiary per period.
- At-risk beneficiaries can be flagged manually (reason required) and auto-flagged based on thresholds.
- At-risk flag can be removed with justification.
- Interventions support CRUD with status tracking.
- Interventions cannot be deleted.
- Performance records are immutable after linked disbursement.

#### Testing Expectations
- Add integration tests for performance CRUD, at-risk flagging, intervention status transitions.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-020]
**Title:** Implement monitoring visits, outcomes, and program metrics APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-008, BE-009

#### Objective
Implement endpoints for site visits, outcome tracking, and program-level metrics.

#### Relevant Files / Modules
- `src/modules/me/`
- `src/api/routes/admin/me.routes.ts`

#### Implementation Notes
Build monitoring visit CRUD with polymorphic entity linking (beneficiary/school) and attachment upload. Implement outcome recording (completion/graduation/exit) and program outcome metrics calculation (completion rate, dropout rate, progression rate).

#### Acceptance Criteria
- Monitoring visits can be recorded for beneficiaries or schools.
- Visit reports can be uploaded as attachments.
- Outcome recording captures completion, graduation, or exit with reason.
- Program outcome metrics are calculated from underlying data.
- Metrics respect filter parameters (program, period, district).

#### Testing Expectations
- Add integration tests for visit CRUD, outcome recording, metrics calculation.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-021]
**Title:** Implement dashboard and standard report APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-016, BE-017, BE-019

#### Objective
Implement dashboard KPI endpoints and standard report generation.

#### Relevant Files / Modules
- `src/modules/reporting/`
- `src/api/routes/admin/dashboard.routes.ts`
- `src/api/routes/admin/reports.routes.ts`

#### Implementation Notes
Build dashboard summary endpoint (active beneficiaries, budget utilization, disbursement totals, at-risk counts) with drill-down support. Implement standard report endpoints: beneficiary register, awards, disbursements, budget utilization, payments by school, M&E outcomes, reconciliation. All reports support filters (program, period, district, school, status) and export to CSV/Excel/PDF.

#### Acceptance Criteria
- Dashboard KPIs reflect current data with role-based visibility.
- Drill-down from KPIs returns underlying records.
- Standard reports generate correct totals matching filtered data.
- Reports export to CSV, Excel, and PDF with applied filters.
- Export events are logged.
- Financial reports restricted to Finance roles.

#### Testing Expectations
- Add integration tests for dashboard KPIs, report data accuracy, export formats, export logging.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-022]
**Title:** Implement dynamic report builder and scheduled reports
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-021

#### Objective
Implement the dynamic drag-and-drop report builder and scheduled report delivery.

#### Relevant Files / Modules
- `src/modules/reporting/`
- `src/api/routes/admin/reports.routes.ts`

#### Implementation Notes
Build dynamic report endpoints: `POST /admin/reports/dynamic/fields` (returns available fields by entity), `POST /admin/reports/dynamic/generate` (accepts field selection + filters, returns data). Implement report template CRUD (save/load/update/delete report definitions). Implement scheduled report creation, listing, updating, and deletion with configurable delivery.

#### Acceptance Criteria
- Available fields endpoint returns relevant fields grouped by entity.
- Dynamic report generation returns filtered data based on field selections.
- Report templates can be saved, listed, loaded, updated, and deleted.
- Scheduled reports can be created with cron/interval and format selection.
- Schedule delivery configuration is stored.

#### Testing Expectations
- Add integration tests for field listing, report generation, template CRUD, schedule CRUD.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-023]
**Title:** Implement notification templates, triggers, and email sending
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-008, BE-009

#### Objective
Implement notification system with configurable templates, event-based triggers, and email delivery.

#### Relevant Files / Modules
- `src/modules/notifications/`
- `src/api/routes/admin/notifications.routes.ts`
- `src/infrastructure/email/`

#### Implementation Notes
Build notification template CRUD (create/list/update). Implement notification trigger configuration (event → template mapping, enable/disable). Build email sending service using `nodemailer` with configurable SMTP (encrypted credentials). Log all sent notifications with recipient, channel, template, status.

#### Acceptance Criteria
- Notification templates can be created, updated, and listed.
- Notification triggers can be enabled/disabled per event.
- Email sending uses configurable SMTP with encrypted credentials.
- SMTP settings can be tested with a test email endpoint.
- Notification log records all sent notifications.
- SMTP credentials are encrypted at rest.

#### Testing Expectations
- Add integration tests for template CRUD, trigger toggle, notification logging.
- Mock nodemailer for email tests.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-024]
**Title:** Implement audit log query and export APIs
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Medium
**Depends On:** BE-008, BE-009

#### Objective
Implement comprehensive audit log query and export functionality.

#### Relevant Files / Modules
- `src/modules/audit/`
- `src/api/routes/admin/audit.routes.ts`

#### Implementation Notes
Build `GET /admin/audit-logs` with filtering by entity type, entity ID, action, user, date range. Implement `GET /admin/audit-logs/{id}` for detailed entry with before/after values. Create dedicated endpoints for document download log and report export log. Implement audit log export to CSV.

#### Acceptance Criteria
- Audit logs can be queried with multiple filters.
- Entity-specific audit logs accessible from entity endpoints.
- Document download log shows who downloaded what and when.
- Report export log tracks all export activity.
- Audit logs are exportable to CSV.
- Access to audit logs is restricted to SuperAdmin and Auditor roles.

#### Testing Expectations
- Add integration tests for audit log query, filtering, export, role restriction.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

### Task ID: [BE-025]
**Title:** Implement system configuration APIs (SMTP, retention, backup)
**Assigned To:** Wongani
**Workstream:** Backend
**Priority:** Low
**Depends On:** BE-008, BE-009

#### Objective
Implement system-level configuration endpoints.

#### Relevant Files / Modules
- `src/modules/system/`
- `src/api/routes/admin/system.routes.ts`

#### Implementation Notes
Build SMTP configuration endpoints (get/update/test), data retention policy endpoints, backup status endpoint.

#### Acceptance Criteria
- SMTP settings can be retrieved (masked) and updated.
- SMTP test sends a test email.
- Data retention periods are configurable.
- Backup status endpoint returns last backup timestamp and status.

#### Testing Expectations
- Add integration tests for SMTP config CRUD, test email, retention update.

#### Test File Requirements
Every module, service, controller, or repository created or modified in this task must include co-located test files. The OpenCode session MUST run `npx vitest run` before completing the task and confirm all tests pass.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
- Do not hardcode values that belong in constants or config.
- Add or update tests where appropriate.

---

## Frontend Workstream Tasks (Immanuel)

### Task ID: [FE-001]
**Title:** Scaffold Next.js admin portal foundation
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** None

#### Objective
Create the Next.js admin portal project structure with App Router, feature-based architecture, and shared UI foundation.

#### Relevant Files / Modules
- `app/`
- `features/`
- `shared/`
- `providers/`
- `config/`

#### Implementation Notes
Set up the folder structure from `frontend-architecture.md` (admin dashboard variant). Include: `app/(auth)/` for login/password-reset, `app/(dashboard)/` for protected pages, `features/` for domain modules, `shared/` for common UI components, `providers/` for QueryProvider and AuthProvider, `config/` for navigation and permissions. Add Tailwind CSS and shadcn/ui setup.

#### Acceptance Criteria
- Project structure matches the architecture document.
- App Router is configured with auth and dashboard layout groups.
- Tailwind CSS and shadcn/ui are configured.
- Shared UI foundation (button, input, card, table, dialog, skeleton) components exist.
- Providers are set up (React Query, Auth).
- Middleware for route protection exists.

#### Testing Expectations
- App starts without errors.
- Auth middleware redirects unauthenticated users.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-002]
**Title:** Implement login page, MFA verification, and password reset UI
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-001

#### Objective
Build the authentication pages and integrate with auth API endpoints.

#### Relevant Files / Modules
- `app/(auth)/login/`
- `app/(auth)/mfa/`
- `app/(auth)/forgot-password/`
- `app/(auth)/reset-password/`
- `features/auth/`

#### Implementation Notes
Build login form with email/password. After successful login, if MFA required, show MFA TOTP input page. Implement forgot password flow (email → reset link → new password form). Use `react-hook-form` + `zod` for form validation. Auth state managed via AuthProvider with JWT stored in httpOnly cookie or memory.

#### Acceptance Criteria
- Login form validates email and password.
- MFA page shows when MFA is required.
- TOTP code input accepts 6-digit code.
- Password reset flow works end-to-end.
- Form validation shows inline errors.
- Success redirects to dashboard.
- Error states are handled (invalid credentials, locked account).

#### Testing Expectations
- Test login flow with mock API.
- Test MFA verification with mock API.
- Test password reset flow.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-003]
**Title:** Build shared UI component library
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-001

#### Objective
Build a complete set of reusable UI components and layout elements for the admin portal.

#### Relevant Files / Modules
- `shared/components/ui/`
- `shared/components/layout/`
- `shared/components/common/`
- `shared/components/tables/`
- `shared/components/forms/`
- `shared/components/dialogs/`
- `shared/components/charts/`
- `shared/components/skeletons/`

#### Implementation Notes
Build: DataTable with sorting/filtering/pagination, Form components (FormField, Select, DatePicker, FileUpload), Modal/Dialog component, PageHeader with breadcrumbs, Sidebar navigation, StatusBadge for status enums, ConfirmDialog for destructive actions, Chart components for dashboard (bar, line, pie), Skeleton loaders, EmptyState component, ErrorBoundary, Toast/notification component.

#### Acceptance Criteria
- DataTable supports pagination, column sorting, and row selection.
- Forms support validation errors and loading states.
- FileUpload shows progress and handles errors.
- Sidebar navigation is role-aware.
- StatusBadge renders colored badges for all entity statuses.
- Charts render with mock data.
- All components are typed with TypeScript.

#### Testing Expectations
- Render tests for key components.
- Verify accessibility basics.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-004]
**Title:** Implement API client layer and data fetching utilities
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-001

#### Objective
Build the API communication layer for the admin portal.

#### Relevant Files / Modules
- `shared/lib/api/client.ts`
- `shared/lib/api/protected-api.ts`
- `shared/lib/api/errors.ts`
- `shared/lib/api/interceptors.ts`
- `shared/lib/constants/`
- `shared/hooks/`

#### Implementation Notes
Build API client with fetch/axios wrapper, JWT token injection, automatic refresh on 401, error interceptor for consistent error handling. Implement typed hooks for queries and mutations using `@tanstack/react-query`. Create pagination hook, debounce hook, and permission check hook.

#### Acceptance Criteria
- API client injects JWT token from auth context.
- Automatic token refresh on 401 responses.
- Error interceptor shows toast notifications.
- React Query hooks are set up for all entity types.
- Pagination hook works with the API pagination format.
- Permission hook checks user role against required permissions.

#### Testing Expectations
- Test API client with mock responses.
- Test pagination hook.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-005]
**Title:** Build dashboard page with KPIs, charts, and drill-down
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-002, FE-003, FE-004

#### Objective
Build the main dashboard landing page showing key scholarship KPIs.

#### Relevant Files / Modules
- `features/dashboard/`
- `app/(dashboard)/dashboard/`

#### Implementation Notes
Build dashboard with KPI cards (active beneficiaries, budget utilization, disbursement totals, at-risk counts), trend charts (disbursements over time, budget utilization by program), and recent activity widgets. Implement drill-down: clicking a KPI navigates to the relevant list page with pre-applied filters. Use role-based visibility (Finance sees financial KPIs, M&E sees at-risk widgets).

#### Acceptance Criteria
- KPI cards display real data from dashboard API.
- Charts render with correct data.
- Drill-down navigates to filtered list pages.
- Role-based visibility: Finance sees financial KPIs, M&E sees at-risk, Operations sees beneficiary KPIs.
- Loading states show skeletons.
- Error states show appropriate messages.

#### Testing Expectations
- Test KPI rendering with mock data.
- Test drill-down navigation.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-006]
**Title:** Build program management pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build CRUD pages for program configuration and management.

#### Relevant Files / Modules
- `features/programs/`
- `app/(dashboard)/programs/`

#### Implementation Notes
Build program list page with status filter and search. Build create/edit program form with sections: general info, dates, budget, funding sources, eligibility rules, evaluation rubric, workflow stages, form config, required documents, communication templates. Use tabbed or stepped form for the complex create/edit page. Implement status change with confirmation dialog.

#### Acceptance Criteria
- Program list shows all programs with status badges.
- Create/edit form handles all configuration sections.
- Status change has confirmation dialog.
- Budget utilization bar shows remaining vs. used.
- Funding source allocation is shown and editable.
- Form validation prevents submission of incomplete programs.

#### Testing Expectations
- Test list rendering with mock data.
- Test form submission with mock API.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-007]
**Title:** Build beneficiary management pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build pages for beneficiary listing, detail view, create/edit, and status management.

#### Relevant Files / Modules
- `features/beneficiaries/`
- `app/(dashboard)/beneficiaries/`

#### Implementation Notes
Build beneficiary list with filters (program, status, school, district, search). Build detail page showing: profile info, guardian list, document list, award history, disbursement history, performance history, at-risk status, intervention log. Build create/edit form. Implement status change with reason dialog. Build guardian sub-form.

#### Acceptance Criteria
- List supports filtering by all specified fields.
- Detail page shows all related data in sections/ tabs.
- Status change requires reason for suspension/closure.
- Guardian CRUD works inline on detail page.
- Document list shows verification status.
- Audit log section on detail page.

#### Testing Expectations
- Test list with filters.
- Test detail page rendering with mock data.
- Test status change dialog.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-008]
**Title:** Build CSV import page
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build the CSV upload and import management interface.

#### Relevant Files / Modules
- `features/imports/`
- `app/(dashboard)/imports/`

#### Implementation Notes
Build template download button, file upload area with drag-and-drop, import progress/status display, validation error table (downloadable), import history list. Build onboarding workflow: pending list with validate/approve/exception buttons. Build exception queue with resolve functionality.

#### Acceptance Criteria
- Template download button downloads CSV.
- File upload shows progress and completion status.
- Import summary shows accepted/rejected counts.
- Error log is downloadable.
- Import history shows all past imports.
- Onboarding pending list shows records awaiting approval.
- Approve/validate/exception buttons trigger correct API calls.
- Exception queue shows flagged records with resolve option.

#### Testing Expectations
- Test upload flow with mock API.
- Test onboarding actions.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-009]
**Title:** Build award management pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build pages for award listing, creation, activation, and lifecycle management.

#### Relevant Files / Modules
- `features/awards/`
- `app/(dashboard)/awards/`

#### Implementation Notes
Build award list with filters (program, beneficiary, status). Build create form: search/select beneficiary, select program, enter amount/dates, select funding source. Build detail page with: award info, balance tracker, disbursement list, status history. Implement action buttons: activate, suspend, close, reinstate, renew (with confirmation dialogs and reason capture). Award letter generation button.

#### Acceptance Criteria
- List supports filtering by program, status, beneficiary.
- Create form validates budget and beneficiary status.
- Detail page shows balance remaining.
- Status change actions have confirmation with reason input.
- Renewal creates linked award with updated dates.
- Award letter generation button triggers API and provides download.
- Budget utilization warning when approaching ceiling.

#### Testing Expectations
- Test award creation with mock API.
- Test status change actions.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-010]
**Title:** Build disbursement management pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build pages for disbursement processing, approval workflow, and reconciliation.

#### Relevant Files / Modules
- `features/disbursements/`
- `app/(dashboard)/disbursements/`

#### Implementation Notes
Build disbursement list with status filter and financial summary. Build create form: select award, enter amount, category, payee, academic period. Build detail page with: approval trail timeline, payment evidence viewer, status transition buttons. Implement maker-checker separation: Maker sees "Submit for Approval", Checker sees "Approve/Reject". Build evidence upload area. Build reconciliation view. Handle batch disbursement creation.

#### Acceptance Criteria
- List shows status badges with color coding.
- Create form validates award balance and budget.
- Maker view shows submit button; Checker view shows approve/reject.
- Self-approval is blocked (UI hides approve button for maker).
- Evidence upload is required before Paid status.
- Reconciliation button is available for Paid disbursements.
- Batch creation form supports multiple line items.
- Status history timeline shows full approval chain.

#### Testing Expectations
- Test create flow.
- Test approve/reject with mock API.
- Test evidence upload.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-011]
**Title:** Build M&E pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** High
**Depends On:** FE-003, FE-004

#### Objective
Build pages for monitoring and evaluation features.

#### Relevant Files / Modules
- `features/me/`
- `app/(dashboard)/me/`

#### Implementation Notes
Build performance entry form (per beneficiary per period, subjects as dynamic rows). Build at-risk register with filterable list and flag/remove actions. Build intervention log with create/edit and status tracking. Build monitoring visit form with entity search and attachment upload. Build outcomes dashboard with completion/dropout/progression metrics.

#### Acceptance Criteria
- Performance entry form supports adding multiple subjects dynamically.
- At-risk register shows flagged beneficiaries with reason.
- At-risk flagging/removal works with reason capture.
- Intervention list with status filter and create/edit.
- Monitoring visit form supports beneficiary or school selection.
- Outcomes dashboard shows metrics with program filter.

#### Testing Expectations
- Test performance entry.
- Test at-risk flagging.
- Test visit creation.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-012]
**Title:** Build reporting pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** Medium
**Depends On:** FE-003, FE-004

#### Objective
Build standard reports, dynamic report builder, and scheduled report pages.

#### Relevant Files / Modules
- `features/reports/`
- `app/(dashboard)/reports/`

#### Implementation Notes
Build standard reports page with filter panel (program, period, district, school, status) and export buttons (CSV, Excel, PDF). Build dynamic report builder with drag-and-drop field selection, filter configuration, and save/load templates. Build scheduled reports page with create/edit form (select report, set schedule, choose format).

#### Acceptance Criteria
- Standard reports render with applied filters.
- Export buttons trigger downloads in selected format.
- Dynamic report builder allows field selection from available fields.
- Report templates can be saved, loaded, and deleted.
- Scheduled report form accepts schedule configuration.
- Loading states for report generation.

#### Testing Expectations
- Test report rendering with mock data.
- Test export triggers.
- Test dynamic report builder.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-013]
**Title:** Build master data management pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** Medium
**Depends On:** FE-003, FE-004

#### Objective
Build CRUD pages for all master data entities.

#### Relevant Files / Modules
- `features/master-data/`
- `app/(dashboard)/master-data/`

#### Implementation Notes
Build pages for: Schools (list/detail with bank accounts), School Bank Accounts (with maker-checker approval status), Funding Sources, Disbursement Items, Reference Data (districts, academic periods, etc.). Implement bank account masking (show `****1234` with toggle for authorized roles). Show approval status for pending bank account changes.

#### Acceptance Criteria
- Schools list with district/type filters.
- School detail shows linked bank accounts with masking.
- Bank account toggle shows unmasked for authorized roles (logged).
- Bank account changes show pending/approved status.
- Funding sources show allocation vs. utilization.
- Reference data CRUD with type grouping.
- Delete protection for records in use.

#### Testing Expectations
- Test CRUD flows with mock API.
- Test bank account masking.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-014]
**Title:** Build user and role management, audit log viewer pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** Medium
**Depends On:** FE-003, FE-004

#### Objective
Build admin pages for user management, role management, and audit log viewing.

#### Relevant Files / Modules
- `features/admin/`
- `app/(dashboard)/admin/`

#### Implementation Notes
Build user list with role/status filters, user create/edit form (with program assignment), user detail page. Build role management pages (CRUD, permission assignment). Build audit log viewer with date range, entity, action, user filters and export button. Build dedicated views for document download log and report export log.

#### Acceptance Criteria
- User list filters by role, status, program.
- User create/edit form handles program assignment.
- Role management includes permission assignment interface.
- Audit log viewer supports all filters.
- Audit log export triggers CSV download.
- Document download log and report export log are accessible.
- All pages restricted to SuperAdmin role.

#### Testing Expectations
- Test user CRUD.
- Test audit log filtering.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.

---

### Task ID: [FE-015]
**Title:** Build notification template management and document viewer pages
**Assigned To:** Immanuel
**Workstream:** Frontend
**Priority:** Low
**Depends On:** FE-003, FE-004

#### Objective
Build notification template management and system configuration pages.

#### Relevant Files / Modules
- `features/settings/`
- `app/(dashboard)/settings/`

#### Implementation Notes
Build notification template list/create/edit page. Build notification trigger toggle interface. Build SMTP configuration page. Build data retention policy configuration page. Build document viewer/manager page (list all documents, filter by type/status/entity).

#### Acceptance Criteria
- Notification templates can be created with subject/body.
- Notification triggers can be enabled/disabled.
- SMTP config form with masked fields and test button.
- Document viewer lists documents with filters.
- Retention policy form with number inputs.

#### Testing Expectations
- Test template CRUD.
- Test SMTP config form.

#### Constraints
- Keep changes minimal and follow the existing architecture documents.
- Do not introduce new dependencies without approval.
- Do not modify unrelated files.
