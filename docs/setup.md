# Press Trust SMS — Local Development Setup

This guide covers setting up the Scholarship Management System on a new machine for local development.

---

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| Node.js | 18.x or 20.x (LTS) | Runtime for both backend and frontend |
| npm | 9+ | Package manager |
| PostgreSQL | 14+ | Database |
| Git | Latest | Version control |
| VS Code (recommended) | Latest | IDE |

---

## Repository Structure

```
press-trust-sms/
├── backend/                  # TypeScript + Express API
│   ├── src/
│   │   ├── modules/          # Business domains
│   │   ├── shared/           # Shared utilities
│   │   ├── infrastructure/   # DB, email, auth services
│   │   ├── api/              # Routes, controllers, middleware
│   │   ├── jobs/             # Background jobs
│   │   └── app.ts            # Bootstrap
│   ├── prisma/               # Prisma schema + migrations
│   ├── uploads/              # Local file storage (gitignored)
│   ├── tests/                # Test files
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
├── frontend/                 # Next.js admin portal
│   ├── app/                  # App Router pages
│   ├── features/             # Feature modules
│   ├── shared/               # Shared components, hooks, lib
│   ├── providers/            # React Query, Auth, Theme
│   ├── config/               # Navigation, permissions
│   ├── public/               # Static assets
│   ├── package.json
│   ├── next.config.ts
│   └── .env.local
│
└── docs/                     # Project documentation
    ├── entities.md
    ├── workflow.md
    ├── api_contract.md
    ├── task_breakdown.md
    └── setup.md
```

---

## Step 1: Clone and Install Dependencies

```bash
git clone <repository-url> press-trust-sms
cd press-trust-sms
```

### Backend

```bash
cd backend
npm install
```

### Frontend

```bash
cd frontend
npm install
```

---

## Step 2: Environment Configuration

### Backend (`backend/.env`)

```env
# Server
NODE_ENV=development
PORT=3001

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/press_trust_sms?schema=public"

# JWT
JWT_SECRET="change-this-to-a-random-secret-in-production"
JWT_REFRESH_SECRET="change-this-to-another-random-secret"
JWT_EXPIRES_IN=900
JWT_REFRESH_EXPIRES_IN=604800

# Email (SMTP)
SMTP_HOST="smtp.example.com"
SMTP_PORT=587
SMTP_USER="your-email@example.com"
SMTP_PASS="your-email-password"
SMTP_FROM="wmsumba@imosys.mw"

# File Uploads
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=52428800

# Security
BCRYPT_ROUNDS=12
MFA_ISSUER="PressTrustSMS"
ACCOUNT_LOCKOUT_THRESHOLD=3
ACCOUNT_LOCKOUT_DURATION_MINUTES=15
SESSION_TIMEOUT_MINUTES=30
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_APP_NAME="Press Trust SMS"
```

---

## Step 3: Database Setup

### Create the database

```bash
# Using psql
psql -U postgres -c "CREATE DATABASE press_trust_sms;"

# Or using createdb
createdb -U postgres press_trust_sms
```

### Run Prisma migrations

```bash
cd backend
npx prisma migrate dev --name init
```

This creates all tables based on the Prisma schema.

### (Optional) Seed sample data

```bash
npx prisma db seed
```

If a seed script is configured, this populates the database with sample reference data and a default admin user.

### Open Prisma Studio (optional)

```bash
npx prisma studio
```

Opens a browser-based data browser at `http://localhost:5555`.

---

## Step 4: Running the Application

### Start Backend (Development)

```bash
cd backend
npm run dev
```

The API starts at `http://localhost:3001`. Health check: `http://localhost:3001/health`

### Start Frontend (Development)

```bash
cd frontend
npm run dev
```

The admin portal starts at `http://localhost:3000`.

### Start Both Simultaneously

Open two terminals, one for each, or use:

```bash
# From project root, if concurrently is configured
npm run dev
```

---

## Step 5: Verify Setup

1. Backend health check: `curl http://localhost:3001/health` should return `{ "status": "ok", "timestamp": "..." }`
2. Frontend: Open `http://localhost:3000` — should show login page
3. Prisma Studio: `http://localhost:5555` — should show all tables

---

## Backend Dependencies

### Production

| Package | Purpose |
| --- | --- |
| `express` | Web framework |
| `@prisma/client` | Database ORM |
| `jsonwebtoken` | JWT token creation and verification |
| `bcryptjs` | Password hashing |
| `speakeasy` | TOTP MFA generation and verification |
| `qrcode` | QR code generation for MFA setup |
| `zod` | Request validation |
| `nodemailer` | Email sending |
| `multer` | File uploads |
| `helmet` | Security headers |
| `cors` | Cross-origin requests |
| `morgan` | HTTP request logging |
| `dotenv` | Environment variable loading |
| `uuid` | UUID generation |

### Development

| Package | Purpose |
| --- | --- |
| `typescript` | TypeScript compiler |
| `ts-node-dev` | Dev server with hot reload |
| `vitest` | Test runner |
| `supertest` | HTTP integration testing |
| `prisma` | Schema management and migrations (dev dependency) |

### Install Commands

```bash
# Production dependencies
npm install express @prisma/client jsonwebtoken bcryptjs speakeasy qrcode zod nodemailer multer helmet cors morgan dotenv uuid

# Dev dependencies
npm install -D typescript ts-node-dev vitest supertest prisma @types/express @types/jsonwebtoken @types/bcryptjs @types/nodemailer @types/multer @types/cors @types/morgan @types/uuid
```

---

## Frontend Dependencies

### Production

| Package | Purpose |
| --- | --- |
| `next` | React framework with App Router |
| `react` / `react-dom` | UI library |
| `@tanstack/react-query` | Server state management and data fetching |
| `react-hook-form` | Form state management |
| `@hookform/resolvers` | Zod resolver for react-hook-form |
| `zod` | Schema validation |
| `lucide-react` | Icons |
| `recharts` | Charts and graphs |
| `date-fns` | Date formatting |
| `clsx` | Conditional classnames |
| `tailwind-merge` | Tailwind class merging |

### Development

| Package | Purpose |
| --- | --- |
| `typescript` | TypeScript compiler |
| `tailwindcss` | Utility CSS framework |
| `@tailwindcss/postcss` | PostCSS plugin for Tailwind |
| `shadcn/ui` | UI component system |
| `@types/react` / `@types/react-dom` | React type definitions |
| `eslint` | Linting |
| `prettier` | Code formatting |

### Install Commands

```bash
# Create Next.js project
npx create-next-app@latest frontend --typescript --tailwind --app

# Production dependencies
npm install @tanstack/react-query react-hook-form @hookform/resolvers zod lucide-react recharts date-fns clsx tailwind-merge

# Dev dependencies
npm install -D prettier

# Initialize shadcn/ui
npx shadcn@latest init
# Then add components as needed:
npx shadcn@latest add button input card table dialog form select toast
```

---

## Common Commands

### Backend

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Start production server |
| `npm test` | Run tests with vitest |
| `npx vitest run` | Run tests once |
| `npx vitest --ui` | Run tests with UI |
| `npx prisma migrate dev` | Create/apply migration |
| `npx prisma migrate deploy` | Apply migrations in production |
| `npx prisma studio` | Open database browser |
| `npx prisma generate` | Regenerate Prisma client |
| `npx prisma db seed` | Seed database |
| `npm run lint` | Run ESLint |

### Frontend

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

---

## Testing

### Backend

```bash
cd backend
npx vitest run          # Run all tests once
npx vitest              # Run tests in watch mode
npx vitest --coverage   # Run with coverage report
```

### Test Convention

- **Unit tests** mock all dependencies using `vi.fn()`.
- **Integration tests** use a real test database.
- Test files are co-located with their source files as `*.spec.ts`.
- Cross-cutting tests (middleware, utilities) go in `src/tests/`.

---

## Troubleshooting

### Prisma client not found

```bash
cd backend
npx prisma generate
```

### Database connection refused

- Ensure PostgreSQL is running.
- Verify `DATABASE_URL` in `.env`.
- Check PostgreSQL port (default: `5432`).

### Port already in use

- Backend default: `3001`. Change with `PORT` in `.env`.
- Frontend default: `3000`. Next.js will prompt to use another port if busy.

### File uploads failing

- Ensure `uploads/` directory exists in backend root.
- Check `MAX_FILE_SIZE` in `.env` (default: 50 MB).

### TypeScript errors after pull

```bash
cd backend
npm install
npx prisma generate
```

### Migration issues

```bash
# Reset database (destroys data)
npx prisma migrate reset

# Create a new migration after schema changes
npx prisma migrate dev --name <description>
```
