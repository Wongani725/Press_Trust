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

All use password `Password123!` (MFA disabled by default).

| Role | Name | Email |
|---|---|---|
| SuperAdmin | Super Admin | superadmin@presstrust.mw |
| Operations | Operations Manager | operations@presstrust.mw |
| Operations | Emmanuel Phiri | emmanuel.phiri@presstrust.mw |
| Operations | Linda Mbewe | linda.mbewe@presstrust.mw |
| Finance | Finance Officer | finance@presstrust.mw |
| Finance | Joseph Kalua | joseph.kalua@presstrust.mw |
| Finance | Ruth Nkhoma | ruth.nkhoma@presstrust.mw |
| ME | M&E Coordinator | me@presstrust.mw |
| ME | Precious Gondwe | precious.gondwe@presstrust.mw |
| Auditor | Auditor | auditor@presstrust.mw |
| Auditor | Frank Tembo | frank.tembo@presstrust.mw |
| Sponsor | Sponsor | sponsor@presstrust.mw |

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
