import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const poolConfig: any = {};
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.port = parseInt(process.env.PGPORT || '5432', 10);
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || 'postgres';
  poolConfig.database = process.env.PGDATABASE || 'press_trust_sms';
}
const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Password123!';
const ROUNDS = 12;

const ROLES: { name: UserRole; description: string; permissions: object }[] = [
  {
    name: 'SuperAdmin',
    description: 'Full system access; user management, role assignment, system config, audit logs',
    permissions: {},
  },
  {
    name: 'Operations',
    description: 'Program management, beneficiary intake, onboarding, awards, documents',
    permissions: {},
  },
  {
    name: 'Finance',
    description: 'Disbursement creation and approval, reconciliation, financial reports, bank accounts',
    permissions: {},
  },
  {
    name: 'ME',
    description: 'Academic performance, at-risk flags, interventions, monitoring visits, outcomes',
    permissions: {},
  },
  {
    name: 'Auditor',
    description: 'Read-only access to all records, audit logs, export logs',
    permissions: {},
  },
  {
    name: 'Sponsor',
    description: 'View-only access to program portfolio and approved reports',
    permissions: {},
  },
];

const SEED_USERS: { name: string; email: string; role: UserRole }[] = [
  { name: 'Super Admin', email: 'superadmin@presstrust.mw', role: 'SuperAdmin' },
  { name: 'Operations Manager', email: 'operations@presstrust.mw', role: 'Operations' },
  { name: 'Finance Officer', email: 'finance@presstrust.mw', role: 'Finance' },
  { name: 'M&E Coordinator', email: 'me@presstrust.mw', role: 'ME' },
  { name: 'Auditor', email: 'auditor@presstrust.mw', role: 'Auditor' },
  { name: 'Sponsor', email: 'sponsor@presstrust.mw', role: 'Sponsor' },
];

// ── Malawi Reference Data ──

const DISTRICTS = [
  'Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Kasungu', 'Dedza', 'Mchinji',
  'Mangochi', 'Salima', 'Ntcheu', 'Nkhata Bay', 'Rumphi', 'Karonga',
  'Thyolo', 'Mulanje', 'Phalombe', 'Chiradzulu', 'Balaka', 'Nkhotakota',
  'Dowa', 'Ntchisi', 'Likoma', 'Chitipa', 'Mwanza', 'Nsanje', 'Chikwawa',
];

const ACADEMIC_PERIODS = ['2026-T1', '2026-T2', '2026-T3', '2027-T1', '2027-T2', '2027-T3'];

const DISBURSEMENT_ITEMS = ['fees', 'uniform', 'books', 'boarding', 'transport', 'exam_fees', 'stationery', 'medical'];

const SCHOOLS: { name: string; district: string; type: string }[] = [
  { name: 'Lilongwe Secondary School', district: 'Lilongwe', type: 'secondary' },
  { name: 'Blantyre Girls Secondary', district: 'Blantyre', type: 'secondary' },
  { name: 'Mzuzu Academy', district: 'Mzuzu', type: 'secondary' },
  { name: 'Zomba Catholic Secondary', district: 'Zomba', type: 'secondary' },
  { name: 'Kasungu Day Secondary', district: 'Kasungu', type: 'secondary' },
  { name: 'Dedza Secondary School', district: 'Dedza', type: 'secondary' },
  { name: 'Mchinji Secondary', district: 'Mchinji', type: 'secondary' },
  { name: 'Mangochi Secondary School', district: 'Mangochi', type: 'secondary' },
];

const PROGRAM = {
  name: 'Press Trust Secondary School Scholarship 2026',
  description: 'Scholarship for deserving secondary school students across Malawi',
  budget_ceiling: 5000000,
  award_types: ['one_off', 'recurring'] as any,
};

async function seedReferenceData(type: string, items: string[]) {
  for (const name of items) {
    const code = name.toLowerCase().replace(/\s+/g, '_');
    await prisma.referenceData.upsert({
      where: { type_code: { type, code } },
      update: { name, status: 'active' },
      create: { type, code, name, status: 'active' },
    });
    console.log(`Seeded ${type}: ${name}`);
  }
}

async function seedSchools(schools: typeof SCHOOLS) {
  for (const s of schools) {
    const existing = await prisma.school.findFirst({ where: { name: s.name } });
    if (existing) {
      await prisma.school.update({ where: { id: existing.id }, data: { district: s.district, type: s.type, status: 'active' } });
    } else {
      await prisma.school.create({ data: { name: s.name, district: s.district, type: s.type, status: 'active' } });
    }
    console.log(`Seeded school: ${s.name} (${s.district})`);
  }
}

async function seedDisbursementItems(items: string[]) {
  for (const name of items) {
    await prisma.disbursementItem.upsert({
      where: { name },
      update: { status: 'active' },
      create: { name, status: 'active' },
    });
    console.log(`Seeded disbursement item: ${name}`);
  }
}

async function seedProgram() {
  const existing = await prisma.program.findFirst({ where: { name: PROGRAM.name } });
  if (existing) {
    console.log(`Program already exists: ${existing.name}`);
    return existing;
  }

  const program = await prisma.program.create({
    data: {
      ...PROGRAM,
      status: 'Open',
      application_open_date: new Date('2026-01-01'),
      application_close_date: new Date('2026-12-31'),
    },
  });
  console.log(`Seeded program: ${program.name} (id: ${program.id})`);
  return program;
}

async function main() {
  const password_hash = await bcrypt.hash(PASSWORD, ROUNDS);

  // Seed roles
  const roleMap: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, permissions: r.permissions, status: 'active' },
      create: { name: r.name, description: r.description, permissions: r.permissions, status: 'active' },
    });
    roleMap[role.name] = role.id;
    console.log(`Seeded role: ${role.name} (id: ${role.id})`);
  }

  // Seed users
  for (const u of SEED_USERS) {
    const roleId = roleMap[u.role];
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role_id: roleId,
        role_name: u.role,
        status: 'active',
        mfa_enabled: false,
        password_hash,
        failed_login_attempts: 0,
        locked_until: null,
      },
      create: {
        name: u.name,
        email: u.email,
        password_hash,
        role_id: roleId,
        role_name: u.role,
        status: 'active',
        mfa_enabled: false,
      },
    });
    console.log(`Seeded user: ${user.email} (role: ${user.role_name})`);
  }

  // Seed Malawi reference data
  await seedReferenceData('district', DISTRICTS);
  await seedReferenceData('academic_period', ACADEMIC_PERIODS);

  // Seed schools
  await seedSchools(SCHOOLS);

  // Seed disbursement items
  await seedDisbursementItems(DISBURSEMENT_ITEMS);

  // Seed program
  const program = await seedProgram();

  // Seed sample beneficiaries + guardians (idempotent by national_id)
  if (program) {
    const schools = await prisma.school.findMany({ where: { status: 'active' }, take: 4 });
    const beneficiaries = [
      {
        first_name: 'Chisomo', last_name: 'Banda', gender: 'Female',
        district: schools[0]?.district || 'Lilongwe',
        school_id: schools[0]?.id,
        national_id: 'MW-CHB-001', exams_id: 'EX-001',
        status: 'Active' as any,
        academic_year: '2026-T1',
        guardian: { name: 'John Banda', relationship: 'Father', contact_phone: '+265991234567' },
      },
      {
        first_name: 'Thandiwe', last_name: 'Phiri', gender: 'Female',
        district: schools[1]?.district || 'Blantyre',
        school_id: schools[1]?.id,
        national_id: 'MW-THP-002', exams_id: 'EX-002',
        status: 'Active' as any,
        academic_year: '2026-T1',
        guardian: { name: 'Grace Phiri', relationship: 'Mother', contact_phone: '+265992345678' },
      },
      {
        first_name: 'Yamikani', last_name: 'Kamanga', gender: 'Male',
        district: schools[2]?.district || 'Mzuzu',
        school_id: schools[2]?.id,
        national_id: 'MW-YAK-003', exams_id: 'EX-003',
        status: 'PendingOnboarding' as any,
        academic_year: '2026-T1',
        guardian: { name: 'Peter Kamanga', relationship: 'Uncle', contact_phone: '+265993456789' },
      },
      {
        first_name: 'Tadala', last_name: 'Mussa', gender: 'Female',
        district: schools[3]?.district || 'Zomba',
        school_id: schools[3]?.id,
        national_id: 'MW-TAM-004', exams_id: 'EX-004',
        status: 'Imported' as any,
        academic_year: '2026-T1',
      },
    ];

    for (const b of beneficiaries) {
      if (!b.school_id) continue;
      const existing = await prisma.beneficiary.findFirst({ where: { national_id: b.national_id } });
      if (existing) {
        console.log(`Beneficiary already exists: ${b.national_id}`);
        continue;
      }
      const identifier = `PT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const beneficiary = await prisma.beneficiary.create({
        data: {
          beneficiary_identifier: identifier,
          first_name: b.first_name,
          last_name: b.last_name,
          gender: b.gender,
          district: b.district,
          school_id: b.school_id,
          program_id: program.id,
          national_id: b.national_id,
          exams_id: b.exams_id,
          status: b.status,
          academic_year: b.academic_year,
        },
      });
      if (b.guardian) {
        await prisma.guardian.create({
          data: {
            beneficiary_id: beneficiary.id,
            name: b.guardian.name,
            relationship: b.guardian.relationship,
            contact_phone: b.guardian.contact_phone,
          },
        });
      }
      console.log(`Seeded beneficiary: ${b.first_name} ${b.last_name} (${b.status})`);
    }
  }

  // Seed sample documents for first beneficiary (idempotent by file path)
  const firstBeneficiary = await prisma.beneficiary.findFirst({ where: { national_id: 'MW-CHB-001' } });
  if (firstBeneficiary) {
    const opsUser = await prisma.user.findFirst({ where: { email: 'wongani087@gmail.com' } });
    const docPath = path.join(process.cwd(), 'uploads', 'seed_id_copy_chisomo.pdf');

    const existingDoc = await prisma.document.findFirst({
      where: { documentable_id: firstBeneficiary.id, document_type: 'id_copy' },
    });

    if (!existingDoc && opsUser) {
      // Create a dummy file on disk
      await fs.promises.writeFile(docPath, Buffer.from('Sample ID copy for Chisomo Banda'));

      const document = await prisma.document.create({
        data: {
          documentable_id: firstBeneficiary.id,
          documentable_type: 'beneficiary',
          file_path: docPath,
          original_name: 'id_copy_chisomo.pdf',
          mime_type: 'application/pdf',
          file_size: 32,
          document_type: 'id_copy',
          version: 1,
          virus_scan_status: 'clean',
          uploaded_by: opsUser.id,
        },
      });
      console.log(`Seeded document: ${document.original_name} (${document.document_type}, v${document.version})`);
    }

    // Seed second document
    const existingDoc2 = await prisma.document.findFirst({
      where: { documentable_id: firstBeneficiary.id, document_type: 'report_card' },
    });

    if (!existingDoc2 && opsUser) {
      const docPath2 = path.join(process.cwd(), 'uploads', 'seed_report_card_chisomo.pdf');
      await fs.promises.writeFile(docPath2, Buffer.from('Sample report card for Chisomo Banda'));

      const document2 = await prisma.document.create({
        data: {
          documentable_id: firstBeneficiary.id,
          documentable_type: 'beneficiary',
          file_path: docPath2,
          original_name: 'report_card_chisomo.pdf',
          mime_type: 'application/pdf',
          file_size: 36,
          document_type: 'report_card',
          version: 1,
          virus_scan_status: 'clean',
          uploaded_by: opsUser.id,
        },
      });
      console.log(`Seeded document: ${document2.original_name} (${document2.document_type}, v${document2.version})`);
    }
  }

  // Seed sample awards for first beneficiary (idempotent)
  const activeBeneficiary = await prisma.beneficiary.findFirst({ where: { national_id: 'MW-CHB-001' } });
  if (activeBeneficiary) {
    const program = await prisma.program.findFirst({ where: { name: PROGRAM.name } });
    if (program) {
      const existingAwards = await prisma.award.count({ where: { beneficiary_id: activeBeneficiary.id } });
      if (existingAwards === 0) {
        const awards = [
          { amount: 50000, status: 'Active' as any, award_type: 'one_off' as any, start: new Date('2026-01-01'), end: new Date('2026-12-31') },
          { amount: 30000, status: 'Draft' as any, award_type: 'recurring' as any, start: new Date('2026-06-01'), end: new Date('2026-12-31') },
          { amount: 20000, status: 'Completed' as any, award_type: 'one_off' as any, start: new Date('2025-01-01'), end: new Date('2025-12-31') },
        ];

        for (const aw of awards) {
          const award = await prisma.award.create({
            data: {
              beneficiary_id: activeBeneficiary.id,
              program_id: program.id,
              amount: aw.amount,
              balance_remaining: aw.amount,
              start_date: aw.start,
              end_date: aw.end,
              award_type: aw.award_type,
              status: aw.status,
            },
          });
          console.log(`Seeded award: ${award.id} (${aw.status}, ${aw.award_type}, MWK ${aw.amount})`);
        }
      } else {
        console.log(`Awards already exist for beneficiary ${activeBeneficiary.national_id}`);
      }
    }
  }

  // Seed sample disbursements for first active award (idempotent)
  const activeAward = await prisma.award.findFirst({
    where: { status: 'Active' },
    include: { beneficiary: true, program: true },
  });
  if (activeAward) {
    const opsUser = await prisma.user.findFirst({ where: { email: 'wongani087@gmail.com' } });
    const existingDisbursements = await prisma.disbursement.count({ where: { award_id: activeAward.id } });
    if (existingDisbursements === 0 && opsUser) {
      const a = activeAward as any;
      const d1 = await prisma.disbursement.create({
        data: {
          award_id: activeAward.id,
          beneficiary_id: a.beneficiary_id,
          program_id: a.program_id,
          amount: 25000,
          category: 'fees',
          academic_period: '2026-T1',
          payee_type: 'school',
          payee_name: 'Lilongwe Secondary School',
          status: 'Requested',
          created_by: opsUser.id,
        },
      });
      console.log(`Seeded disbursement: ${d1.id} (Requested, fees, MWK 25000)`);

      const d2 = await prisma.disbursement.create({
        data: {
          award_id: activeAward.id,
          beneficiary_id: a.beneficiary_id,
          program_id: a.program_id,
          amount: 15000,
          category: 'books',
          academic_period: '2026-T1',
          payee_type: 'vendor',
          payee_name: 'Malawi Book Suppliers',
          status: 'Approved',
          approved_by: opsUser.id,
          approved_at: new Date(),
          created_by: opsUser.id,
        },
      });
      console.log(`Seeded disbursement: ${d2.id} (Approved, books, MWK 15000)`);

      const d3 = await prisma.disbursement.create({
        data: {
          award_id: activeAward.id,
          beneficiary_id: a.beneficiary_id,
          program_id: a.program_id,
          amount: 10000,
          category: 'transport',
          academic_period: '2026-T1',
          payee_type: 'guardian',
          payee_name: 'John Banda',
          status: 'Paid',
          paid_at: new Date(),
          created_by: opsUser.id,
        },
      });
      console.log(`Seeded disbursement: ${d3.id} (Paid, transport, MWK 10000)`);
    } else {
      console.log('Disbursements already exist for seeded award');
    }
  }

  // Seed sample M&E data (performance, at-risk flag, intervention)
  const meUser = await prisma.user.findFirst({ where: { email: 'tayamuthola@gmail.com' } });
  const chisomo = await prisma.beneficiary.findFirst({ where: { national_id: 'MW-CHB-001' } });
  if (chisomo && meUser) {
    const school = await prisma.school.findUnique({ where: { id: chisomo.school_id } });
    if (school) {
      const existingPerf = await prisma.academicPerformance.findFirst({
        where: { beneficiary_id: chisomo.id, academic_period: '2026-T1' },
      });
      if (!existingPerf) {
        const perf = await prisma.academicPerformance.create({
          data: {
            beneficiary_id: chisomo.id,
            school_id: school.id,
            academic_period: '2026-T1',
            subjects: { english: 65, math: 72, science: 58, social_studies: 70 } as any,
            overall_score: 66.25,
            attendance_percentage: 82,
            progression: 'Promoted',
            notes: 'Good start to the year, needs support in science',
            created_by: meUser.id,
          },
        });
        console.log(`Seeded performance: ${perf.id} (2026-T1, score 66.25)`);
      }
    }

    const existingFlag = await prisma.atRiskFlag.findFirst({
      where: { beneficiary_id: chisomo.id, resolved: false },
    });
    if (!existingFlag) {
      const flag = await prisma.atRiskFlag.create({
        data: {
          beneficiary_id: chisomo.id,
          reason: 'Attendance dropped below 80% in February',
          flagged_by: meUser.id,
        },
      });
      console.log(`Seeded at-risk flag: ${flag.id}`);
    }

    const existingIntervention = await prisma.intervention.findFirst({
      where: { beneficiary_id: chisomo.id },
    });
    if (!existingIntervention) {
      const intervention = await prisma.intervention.create({
        data: {
          beneficiary_id: chisomo.id,
          action: 'Home visit to discuss attendance with guardian',
          assigned_to: meUser.id,
          due_date: new Date('2026-03-15'),
          status: 'Open',
          created_by: meUser.id,
        },
      });
      console.log(`Seeded intervention: ${intervention.id}`);
    }
  }

  // Seed sample MonitoringVisit and Outcome
  if (chisomo && meUser) {
    const existingVisit = await prisma.monitoringVisit.findFirst({
      where: { entity_id: chisomo.id, entity_type: 'beneficiary' },
    });
    if (!existingVisit) {
      const visit = await prisma.monitoringVisit.create({
        data: {
          entity_type: 'beneficiary',
          entity_id: chisomo.id,
          visit_date: new Date('2026-02-15'),
          findings: 'Beneficiary attending classes regularly, guardian supportive.',
          follow_up_actions: 'Continue monitoring attendance monthly.',
          conducted_by: meUser.id,
        },
      });
      console.log(`Seeded monitoring visit: ${visit.id}`);
    }

    const existingOutcome = await prisma.outcome.findFirst({
      where: { beneficiary_id: chisomo.id },
    });
    if (!existingOutcome) {
      const program = await prisma.program.findFirst({ where: { name: PROGRAM.name } });
      if (program) {
        const outcome = await prisma.outcome.create({
          data: {
            beneficiary_id: chisomo.id,
            program_id: program.id,
            outcome_type: 'Completion',
            outcome_date: new Date('2026-12-31'),
            reason: 'Completed academic year successfully',
            recorded_by: meUser.id,
          },
        });
        console.log(`Seeded outcome: ${outcome.id}`);
      }
    }
  }

  console.log('\nAll Malawi reference data seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
