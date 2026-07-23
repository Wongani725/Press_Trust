# Press Trust SMS End-to-End Workflow

This document defines the complete business process flow for the Scholarship Management System, from program creation through to beneficiary closure and reporting.

---

## Stage 1: Program Setup (Operations / Admin)

```
Admin/Operations creates Program
  → Configure name, description, type
  → Set application open/close dates
  → Define academic periods (year/term/semester)
  → Configure award types (one-off, recurring, renewable)
  → Set budget ceiling per program
  → Allocate funding source(s) to program
  → Define eligibility rules
  → Configure evaluation rubric (criteria, weights, minimum thresholds, tie-break)
  → Configure workflow stages and approvers
  → Set up application form fields via form builder (with conditional logic)
  → Specify required onboarding documents
  → Create communication templates (emails, award letters, contracts)
  → Configure notification triggers
  → Set program status to "Open"
```

**Key rules:**
- Program cannot be saved without required fields.
- Budget ceiling set at this stage; cannot create awards that exceed it.
- All configuration changes are audited (who, what, when, before/after).
- Program statuses: `Draft → Open → Closed → Archived`. Closed prevents new applications; Archived prevents all activity on historical data.

---

## Stage 2: Beneficiary Intake

Two paths feed into the system: bulk CSV import and individual online application.

### Path A — Bulk CSV Import (Government Beneficiary Lists)

```
1. Authorized user downloads standardized CSV import template
2. User uploads CSV file with beneficiary data
3. System validates ALL rows:
   - Required field completeness
   - Data type/format validation (dates, numbers, emails, phones)
   - Duplicate detection against existing records
     (uniqueness: National ID + Exams ID + Intake)
   - Referential integrity (school, district, program must exist in system)
   - Inconsistency flagging with existing master data
4. System generates:
   - Row-level error log (downloadable CSV with row number + failure reason)
   - Import summary report (total uploaded, accepted, rejected counts)
5. Valid rows proceed; rejected rows do not block valid ones
6. Imported records appear in Beneficiary Registry with status "Imported"
```

### Path B — Individual Application (Future Phase, Applicant Portal)

```
1. Applicant creates account (email/phone + password)
2. System enforces MFA setup
3. Applicant browses open programs and selects one
4. Applicant fills dynamic application form:
   - Biodata, demographics, contacts
   - Academic/institutional details
   - Guardian/parent information
   - Identifiers (National ID, Exams ID)
   - Save-as-draft + autosave supported
   - Conditional logic fields rendered based on prior answers
5. Applicant uploads supporting documents:
   - Documents virus-scanned on upload
   - Resumable uploads for low-bandwidth
6. System validates data formats and completeness
   → Cannot submit until all mandatory fields completed
7. Applicant submits application
   → Automated submission confirmation email sent
   → Reference number generated
   → Status: "Submitted"
```

### Common Next Steps (Both Paths)

```
1. Internal user reviews imported/submitted records
2. User confirms internal validation checks passed
   (Segregation: validation user ≠ onboarding approver)
3. If inconsistencies found:
   → Record flagged as "Exception" with mandatory reason
   → Appears in Exception Queue
   → Authorized user reviews and resolves
4. Onboarding approval by authorized role
   (Different user from validation)
5. System enforces:
   → All mandatory onboarding fields complete
   → Required supporting documents uploaded
   → Documents verified (Pending → Verified) if configured
6. Beneficiary activated with unique internal identifier
   → Status changes from "Imported" to "Active"
   → Now eligible for award creation
```

---

## Stage 3: Award Creation & Activation

```
1. Authorized user (Operations) creates Award:
   → Linked to:
      - Active beneficiary (must be Active, not Suspended/Closed)
      - Program
      - Funding source / budget line
   → Specify:
      - Award amount
      - Duration (start date, end date)
      - Award type (one-off, recurring, renewable)
      - Disbursement schedule (one-off or periodic, linked to terms)
      - Support categories (fees, boarding, uniform, books, exam fees, etc.)

2. System validates:
   → Beneficiary is Active (otherwise blocked)
   → Award amount does not exceed remaining program budget
   → Funding source has sufficient allocation
   → No duplicate award for same beneficiary/program/period
   → If budget insufficient: creation blocked with message

3. Award enters "Draft" status → editable before activation

4. Authorized user activates the award:
   → Status changes to "Active"
   → Award letter generated from configurable template
     (variable substitution: name, amount, dates, etc.)
   → Letter stored in beneficiary document record
   → Award balance established (= amount)
   → Program budget utilization updated (reduced by award amount)

5. Award lifecycle statuses:
   Draft → Active → (if issues) Suspended → Reinstated → Active
   Active → Completed (end of period, no renewal)
   Active → Closed/Terminated (mandatory reason)
```

---

## Stage 4: Disbursement & Financial Tracking

### Disbursement Processing

```
1. Finance user (Maker) creates Disbursement Request:
   → Linked to Active award
   → Specify:
      - Amount (cannot exceed remaining award balance)
      - Category (from disbursement item catalog)
      - Academic period
      - Payee type (school, guardian, or vendor)
      - Payee auto-populated from master data
   → System validates:
      - Award is Active
      - Amount ≤ remaining award balance
      - Amount ≤ remaining program budget
      - Not a duplicate (same beneficiary + category + period)
      - Mandatory documents are verified (if configured)

2. Disbursement enters "Requested" status

3. Different Finance user (Checker) reviews and approves:
   → Self-approval is BLOCKED server-side
   → Optional: multi-level approval (Maker → Checker → Approver)
   → If rejected: status set back with reason

4. Payment executed externally (bank transfer, etc.)

5. Finance user uploads payment evidence:
   → Voucher, receipt, or bank confirmation document
   → Virus-scanned on upload

6. Status set to "Paid":
   → Blocked if no evidence attached (configurable)
   → Award balance decremented
   → Program budget utilization updated

7. Finance user marks as "Reconciled":
   → Record locked — no further edits
   → Reconciliation report available
```

### Exception Handling

```
Failed payments:
  → Status set to "Failed" (mandatory reason required)
  → Can be re-requested if needed

Returned funds:
  → Record returned amount linked to original disbursement
  → Award balance restored

Reversals:
  → Full reversal recorded with reason
  → Award balance restored
  → Audit trail captures entire chain
```

Disbursement status machine:
```
Requested → Approved (by Checker, not Maker)
Approved → Paid (evidence required)
Paid → Reconciled (locked)
Paid → Failed (reason required)
Failed → Requested (re-submit)
Any → Reversed (with reason, balance restored)
```

---

## Stage 5: Monitoring & Evaluation

### Ongoing Per Academic Period

```
1. M&E user records per beneficiary:
   → Academic performance (subjects, scores, grades)
   → Attendance percentage
   → Progression status (Promoted, Repeated, Completed, Dropped)

2. System auto-flags beneficiaries:
   → Performance below configured threshold → "At-Risk"
   → Flagged beneficiary appears in at-risk register

3. M&E user can manually flag as At-Risk:
   → Mandatory reason captured
   → Appears in at-risk register

4. M&E user logs interventions:
   → Action description
   → Assign responsible officer
   → Set due date
   → Track status (Open → In Progress → Closed)
   → Interventions cannot be deleted

5. M&E user records monitoring visits:
   → Link to beneficiary or school
   → Visit date, findings, uploaded report
   → Follow-up actions and owners

6. Outcome tracking:
   → Record completion/graduation
   → Record exit reason for discontinued beneficiaries
   → System calculates outcome metrics (completion rate, dropout rate,
     progression rate)
```

---

## Stage 6: Renewal & Closure

### Renewal

```
At end of award period:
  → If program configured as renewable:
     - System checks performance criteria
     - If criteria met: authorized user can renew
     - Renewal creates new award period linked to original (parent_award_id)
     - Original award history preserved
  → If criteria not met:
     - Renewal blocked
     - May lead to closure
```

### Closure

```
1. Authorized user closes an award:
   → Mandatory reason captured
   → Status: "Closed"
   → No further disbursements allowed

2. If beneficiary's last award is closed:
   → Beneficiary status can be set to "Closed"
   → Exit reason captured (graduated, dropped, transferred, etc.)
```

---

## Cross-Cutting: Security & Audit

Every action across all stages is:
- Mediated by RBAC (role-based + program-scoped + field-level)
- Logged in tamper-evident audit trail (who, what, when, before/after)
- Protected by JWT authentication + MFA
- Subject to session timeout and account lockout policies

---

## Process Flow Diagram (Textual)

```
┌───────────────────────────────────┐
│ STAGE 1: PROGRAM SETUP            │
│ Create Program → Configure → Open │
└──────────┬────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────────────────┐
│ STAGE 2: BENEFICIARY INTAKE                                │
│                                                             │
│  ┌── CSV Import ──┐    ┌── Applicant Portal ──┐            │
│  │ Upload CSV     │    │ Register + Apply      │            │
│  │ Validate rows  │    │ Upload docs + Submit   │            │
│  │ Error log      │    │ Confirm email          │            │
│  └───────┬────────┘    └───────────┬────────────┘            │
│          │                        │                          │
│          └──────────┬─────────────┘                          │
│                     ▼                                        │
│  Validate → Exception Queue → Resolve → Onboard → Active    │
└─────────────────────┬────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────┐
│ STAGE 3: AWARD CREATION           │
│ Create Award → Validate → Active  │
│ → Generate Award Letter           │
└──────────┬────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ STAGE 4: DISBURSEMENT                        │
│ Maker creates → Checker approves             │
│ → Payment evidence → Paid → Reconciled       │
│ Exceptions: Failed, Reversed, Returned       │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
┌───────────────────────────────────┐
│ STAGE 5: MONITORING & EVALUATION  │
│ Performance → At-Risk Flag        │
│ → Interventions → Visits → Outcome│
└──────────┬────────────────────────┘
           │
           ▼
┌───────────────────────────────────┐
│ STAGE 6: RENEWAL / CLOSURE        │
│ Renew (if criteria met)           │
│ Close Award → Close Beneficiary   │
└───────────────────────────────────┘
```

---

## Key Guards & Controls Summary

| Check Point | What It Prevents | Enforced At |
| --- | --- | --- |
| Inactive beneficiary status | Award creation, disbursement | API + DB |
| Budget ceiling exceeded | Award creation, disbursement approval | API |
| Duplicate beneficiary | Onboarding (by National ID + Exams ID + Intake) | API |
| Missing mandatory fields | Beneficiary activation, application submission | API |
| Missing/unverified documents | Disbursement processing | API |
| Self-approval | Disbursement approval, onboarding approval | API |
| Reconciled record modification | Any edit after reconciliation | API |
| Insufficient award balance | Disbursement amount exceeding remaining balance | API |
| Duplicate disbursement | Same beneficiary + category + academic period | API |
| Document deletion (approved tx) | Data integrity for financial records | API |
| Audit log modification | Tamper-evident compliance | DB-level |
