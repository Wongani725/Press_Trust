# Press Trust SMS — Demo Presentation Flow

**Theme colors:** `#715E26` (primary), `#C19B38` (accent), white, black
**Logo:** `docs/press_logo.jpg`

---

## Agenda (60 minutes)

| Time | Section | Lead |
|------|---------|------|
| 0:00–0:05 | Introduction & System Overview | Team lead |
| 0:05–0:45 | End-to-End System Demonstration | Tech lead |
| 0:45–1:00 | Questions & Clarifications | All |

---

## 0:00–0:05 — Introduction & System Overview

**Opening remarks**
- Press Trust team introductions
- Vendor team introductions

**Solution overview (2–3 slides)**
- **Purpose:** Scholarship lifecycle management — from Ministry CSV intake to beneficiary closure
- **Architecture:** Next.js admin portal → Express REST API → PostgreSQL
- **Security:** JWT + TOTP or email OTP MFA, role-based access (SuperAdmin, Operations, Finance, M&E, Auditor, Sponsor), immutable audit trail
- **Deployment:** Docker containers, Gmail SMTP for email delivery

---

## 0:05–0:45 — End-to-End Demonstration

Single narrative: tracking **Chifundo Banda** from intake through graduation.

---

### 1. Login as SuperAdmin — Show MFA Options (3 min)

**TOTP path:**
```
URL:   https://sms.presstrust.org
User:  wmsumba@imosys.mw
Pass:  Demo@2026

→ POST /auth/login
  Response: { mfaRequired: true, mfaMethod: "totp" }
→ Open Google Authenticator → enter 6-digit TOTP: 839271
→ POST /auth/mfa/verify { token: "839271" }
  Response: { accessToken, refreshToken }
→ Dashboard loads
```

**Email OTP path (alternative):**
```
User:  tayamuthola@gmail.com   (configured for email OTP)
Pass:  Demo@2026

→ POST /auth/login
  Response: { mfaRequired: true, mfaMethod: "email_otp" }
→ Check email inbox: "Your Press Trust verification code: 482916"
→ Enter code: 482916
→ POST /auth/mfa/verify { token: "482916" }
  Response: { accessToken, refreshToken }
→ Dashboard loads
```

**Dashboard — empty state:**
- Active Beneficiaries: 0
- Programs: 0
- Awards: 0
- Disbursements: all zeros
- "We'll build this up from scratch"

---

### 2. MFA Setup — Two Methods (3 min)

**Method A — TOTP (Authenticator App):**
```
User Profile → Security → "Set up MFA"
→ Choose: Authenticator App
→ POST /auth/mfa/setup { method: "totp" }
→ QR code displayed on screen
→ Open phone → Google Authenticator → Scan QR code
→ Enter 6-digit code: 584937
→ POST /auth/mfa/verify-setup { token: "584937" }
→ "TOTP MFA enabled successfully"
```

**Method B — Email OTP:**
```
User Profile → Security → "Set up MFA"
→ Choose: Email OTP
→ POST /auth/mfa/setup { method: "email_otp" }
→ "Check your email for a verification code"
→ Open inbox: "Your Press Trust verification code: 731548"
→ Enter code: 731548
→ POST /auth/mfa/verify-setup { token: "731548" }
→ "Email OTP MFA enabled successfully"
```

---

### 3. Create Program (3 min)

**Action:** Operations creates a scholarship program

```
Name:            Malawi Secondary Education Scholarship 2026
Type:            Renewable
Budget Ceiling:  MWK 50,000,000
Funding Source:  MoE Grant #2026-04 (MWK 50,000,000)
Academic Period: 2026-T1, 2026-T2, 2026-T3
Award Types:     one_off (fees), recurring (boarding)
Status:          Open
```

**Pre-loaded master data (show in dropdowns):**
- 26 Malawi districts
- 8 schools (Lilongwe Girls, Mary's Head Secondary, etc.)
- Disbursement items: fees, uniform, books, boarding, exam_fees

---

### 4. CSV Import — Ministry Beneficiary List (5 min)

**Action:** Download template → Upload CSV

**CSV data to upload:** (from `docs/example_beneficiaries.csv`)
```
first_name,last_name,gender,national_id,school_name,district,academic_year
Chifundo,Banda,female,MW-CHB-001,Lilongwe Secondary School,Lilongwe,2026
Tapiwa,Phiri,male,MW-TAP-002,Blantyre Girls Secondary,Blantyre,2026
Zikomo,Kumwenda,male,MW-ZIK-003,Mzuzu Academy,Zomba,2026
Thandiwe,Kayira,female,MW-THK-004,Zomba Catholic Secondary,Mzuzu,2026
Kondwani,Nkhoma,male,MW-KON-005,Kasungu Day Secondary,Ntcheu,2026
```

**Also demonstrate error handling** with `docs/example_beneficiaries_with_errors.csv` (contains rows with missing fields to trigger validation errors).

**System response:**
- Validates all rows
- Row 6 (intentionally invalid) → error CSV with reason
- Summary: 5 valid, 1 rejected
- 5 beneficiaries in registry with status **Imported**

---

### 5. Onboarding & Activation (5 min)

**Review individual beneficiary:**
```
Identifier:  PT-2026-0001   (auto-generated)
Name:        Chifundo Banda
School:      Lilongwe Girls Secondary
District:    Lilongwe
Status:      Imported
```

**Activation flow:**
```
1. Validate → passes all checks
2. Approve (different user from validator — segregation)
3. Status: Imported → PendingOnboarding → Active
4. Now eligible for awards
```

**Exception flow (for Kondwani Nkhoma):**
```
1. Flag as "Exception" → reason: "Missing exam slip"
2. Shows in Exception Queue
3. Upload document → resolve
4. Proceed to activation
```

---

### 6. Award Creation & Activation (5 min)

**Create award for Chifundo Banda:**
```
Beneficiary:     Chifundo Banda (PT-2026-0001)
Program:         Malawi Secondary Education Scholarship 2026
Amount:          MWK 350,000
Duration:        2026-01-15 → 2026-12-15
Award Type:      renewable
Categories:      fees, boarding, books
```

**Validation passes:**
- Budget ceiling: MWK 50M — sufficient (MWK 49,650,000 remaining)
- Award enters **Draft** status

**Activate:**
- Status: Draft → **Active**
- Award letter generated as PDF with:
  - Press Trust logo (brand colors #715E26 / #C19B38)
  - Student name, amount, dates
  - "Press Trust Scholarship Committee" signature
- Budget utilized: MWK 50M → MWK 49,650,000

**Repeat:** Create award for Tapiwa Phiri (MWK 420,000)

---

### 7. Disbursement Processing — Maker-Checker (8 min)

**Login as Finance Maker:**
```
User:  wonganimsumba0@gmail.com
Pass:  Demo@2026
MFA:   [enter TOTP or email OTP]
```

**Create disbursement:**
```
Award:           PT-2026-0001 — Chifundo Banda
Amount:          MWK 85,000
Category:        fees
Academic Period: 2026-T1
Payee Type:      school (Lilongwe Girls Secondary)
```

- Status: **Requested**

**Upload evidence:** receipt.pdf → virus scan = clean → Verified

**Login as Finance Checker** (different account):
```
User:  wmsumba@imosys.mw
Pass:  Demo@2026
```

- See pending approval in queue
- **Show self-approval blocked:** "You cannot approve your own request"
- Approve → **Approved**
- Mark as Paid → **Paid** (award balance: MWK 350K → MWK 265K)
- Mark as Reconciled → **Locked** (immutable)

**Exception:** Create second disbursement → reject with reason "Insufficient documentation"

---

### 8. Monitoring & Evaluation (5 min)

**Login as M&E:**
```
User:  tayamuthola@gmail.com
Pass:  Demo@2026
MFA:   [email OTP — check inbox]
```

**Record performance for Chifundo Banda (2026-T1):**
```
English:         72% (B)
Mathematics:     45% (D)  ← below threshold
Science:         68% (B)
Social Studies:  81% (A)
Overall Score:   66.5%
Attendance:      82%
```

**Run Auto-Flag:**
- Chifundo's Math (45%) < 50% threshold → **At-Risk flag** created

**Manual flag for Tapiwa Phiri:**
```
Reason: Attendance dropped to 68%
```

**Show at-risk register:** both beneficiaries listed with active flags

**Create intervention for Chifundo:**
```
Action:         Extra math tutoring — 2x per week
Assigned To:    M&E Officer
Due Date:       2026-04-15
Status:         Open
```

**Progression:** Open → InProgress → **Closed**

---

### 9. Outcomes & Renewal (3 min)

**Record completion for Chifundo:**
```
Outcome Type:   Completion
Date:           2026-12-15
Notes:          Successfully completed Form 4
```

**Renewal:**
- Click "Renew" → new award period created
- Linked to original award (parent_award_id)

**Record exit for another beneficiary:**
```
Outcome Type:   Exit
Reason:         Transferred to non-participating school
Date:           2026-06-30
```

---

### 10. Reports & Dashboards (5 min)

**Dashboard shows live KPIs:**
- Active Beneficiaries: 4
- Pending Onboarding: 1
- At-Risk Count: 2
- Programs: 1 (Open)
- Disbursements: 1 Approved, 1 Paid
- Budget: 99.1% remaining

**Export reports:**
| Report | Format | Demo |
|--------|--------|------|
| Beneficiary Register | CSV / PDF / XLSX | Show all 3 |
| Disbursements Report | CSV | Filter by program |
| Budget Utilization | PDF | Shows bar chart of utilized vs ceiling |
| M&E Outcomes | XLSX | Completion rate, dropout rate |

**Dynamic Report Builder:**
```
1. Source: "Beneficiaries"
2. Fields: Name, District, School, Status
3. Run → data table
4. Save as "Simple Beneficiary List"
5. Schedule: Every Monday 8am → CSV → email to wongani087@gmail.com
```

---

### 11. Audit Trail & System Config (3 min)

**Audit Logs:** Filter by entity_type: "Award"
- Shows create, activate, close events
- Click entry → see old_values / new_values JSON diff
- Export as CSV

**System Config:**
- SMTP: smtp.gmail.com (change → transporter resets)
- Security: lockout threshold = 3, session timeout = 30 min
- Retention: audit log = 90 days, export log = 30 days
- Update audit_log_retention_days to 180 → audit logged

---

## 0:45–1:00 — Questions & Clarifications

### Anticipated Questions

| Question | Answer |
|---|---|
| **Can you handle 50,000+ beneficiaries?** | Yes. Paginated queries, Prisma connection pooling, indexed columns. Tested with 10K+ records. |
| **What email service are you using?** | Nodemailer via Gmail SMTP. Configurable in System Config UI. Failures logged in NotificationLog. |
| **How do users recover from lost MFA?** | SuperAdmin can reset any user's MFA via `POST /admin/users/:id/mfa/reset`. Two MFA methods supported: TOTP authenticator app and email OTP. |
| **Can we customize email templates?** | Yes — templates use `{{variable}}` substitution. HTML templates with brand styling. |
| **How does the CSV import handle errors?** | Row-level validation. Error CSV downloadable. Valid rows proceed; invalid rows don't block the batch. |
| **What roles exist?** | SuperAdmin (full), Operations (beneficiaries/awards), Finance (disbursements), M&E (performance), Auditor (read-only), Sponsor (view reports). |
| **Is data backed up?** | PostgreSQL pg_dump. Report files persisted in `uploads/reports/`. Retention configurable via System Config. |
| **How is the disbursement maker-checker enforced?** | Server-side: `approved_by` cannot equal `created_by`. Self-approval returns 403. |
| **Can we add more MFA methods?** | Currently TOTP + email OTP. SMS OTP could be added as a future enhancement. |
| **What happens if the email server is down during login?** | Login still proceeds. OTP email failure is logged; user can retry. Admin can check NotificationLog for delivery status. |

---

## Dummy Data Summary

| Entity | Count | Details |
|--------|-------|---------|
| Users | 5 | superadmin, operations, maker, checker, me |
| Programs | 1 | Malawi Secondary Education Scholarship 2026 |
| Funding Sources | 1 | MoE Grant #2026-04 (MWK 50M) |
| Schools | 8 | Lilongwe Girls, Mary's Head, etc. (all districts) |
| Beneficiaries | 5 | Imported via CSV, then activated |
| Awards | 2 | Chifundo (MWK 350K), Tapiwa (MWK 420K) |
| Disbursements | 1 | Chifundo fees (MWK 85K), approved+paid+reconciled |
| Performance | 1 | Chifundo (Math 45% → at-risk) |
| At-Risk Flags | 2 | Chifundo (auto), Tapiwa (manual) |
| Interventions | 1 | Math tutoring for Chifundo → Closed |
| Outcomes | 1 | Completion — Chifundo |
