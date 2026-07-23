# Press Trust Scholarship Management System

A scholarship lifecycle management system covering the full beneficiary journey — from Ministry CSV intake through enrollment, disbursements, monitoring, and closure.

## Architecture

- **Backend:** TypeScript + Express.js REST API
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** JWT + TOTP / email OTP MFA

## Quick Start

```bash
cd backend
cp .env.example .env   # configure your database
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

API docs at [http://localhost:3001/api/v1/docs](http://localhost:3001/api/v1/docs)

## Seeded Users

| Role | Email |
|---|---|
| SuperAdmin | wmsumba@imosys.mw |
| Operations | wongani087@gmail.com |
| Finance | wonganimsumba0@gmail.com |
| ME | tayamuthola@gmail.com |
| Auditor | wonganimsumba@oldmutual.co.mw |
| Sponsor | takondwampoya6@gmail.com |

All use password `password` (MFA disabled by default).

## Features

- Beneficiary CSV import with row-level validation
- Onboarding workflow (validate → exception queue → approve)
- Award management with budget tracking
- Maker-checker disbursement approval
- Academic performance tracking with auto-at-risk flagging
- Interventions, monitoring visits, outcome tracking
- Dynamic report builder with scheduled email delivery
- Notification templates with event-driven triggers (email + in-app)
- Full audit trail with CSV/PDF/XLSX export
- System configuration (SMTP, security, retention)

## Demo Script

See [docs/presentation-flow.md](docs/presentation-flow.md) for the full 60-minute demo walkthrough.

## Brand

Primary: `#715E26` · Secondary: `#C19B38` · Logo: `docs/press_logo.jpg`
