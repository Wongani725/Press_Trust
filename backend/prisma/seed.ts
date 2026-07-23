import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { logAudit } from '../src/shared/utils/audit';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/modules/roles/permissions';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const poolConfig: any = {};
if (process.env.DATABASE_URL) {
  poolConfig.connectionString = process.env.DATABASE_URL;
} else {
  poolConfig.host = process.env.PGHOST || 'localhost';
  poolConfig.port = parseInt(process.env.PGPORT || '5432', 10);
  poolConfig.user = process.env.PGUSER || 'postgres';
  poolConfig.password = process.env.PGPASSWORD || '1234';
  poolConfig.database = process.env.PGDATABASE || 'press_trust_sms';
}
const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const PASSWORD = 'Password123!';
const ROUNDS = 12;

// ──────────────────────────────────────────────
// Roles & Users
// ──────────────────────────────────────────────

const ROLES: { name: UserRole; description: string; permissions: object }[] = [
  { name: 'SuperAdmin', description: 'Full system access; user management, role assignment, system config, audit logs', permissions: DEFAULT_ROLE_PERMISSIONS.SuperAdmin },
  { name: 'Operations', description: 'Program management, beneficiary intake, onboarding, awards, documents', permissions: DEFAULT_ROLE_PERMISSIONS.Operations },
  { name: 'Finance', description: 'Disbursement creation and approval, reconciliation, financial reports, bank accounts', permissions: DEFAULT_ROLE_PERMISSIONS.Finance },
  { name: 'ME', description: 'Academic performance, at-risk flags, interventions, monitoring visits, outcomes', permissions: DEFAULT_ROLE_PERMISSIONS.ME },
  { name: 'Auditor', description: 'Read-only access to all records, audit logs, export logs', permissions: DEFAULT_ROLE_PERMISSIONS.Auditor },
  { name: 'Sponsor', description: 'View-only access to program portfolio and approved reports', permissions: DEFAULT_ROLE_PERMISSIONS.Sponsor },
];

// `key` lets the rest of the script reference a specific seeded user without
// hardcoding emails that may not exist (a prior version of this script looked
// up personal gmail addresses that were never seeded, so document/award/M&E
// records silently failed to seed).
const SEED_USERS: { key: string; name: string; email: string; role: UserRole }[] = [
  { key: 'superadmin', name: 'Super Admin', email: 'superadmin@presstrust.mw', role: 'SuperAdmin' },
  { key: 'opsManager', name: 'Operations Manager', email: 'operations@presstrust.mw', role: 'Operations' },
  { key: 'opsMaker', name: 'Emmanuel Phiri', email: 'emmanuel.phiri@presstrust.mw', role: 'Operations' },
  { key: 'opsChecker', name: 'Linda Mbewe', email: 'linda.mbewe@presstrust.mw', role: 'Operations' },
  { key: 'financeManager', name: 'Finance Officer', email: 'finance@presstrust.mw', role: 'Finance' },
  { key: 'financeMaker', name: 'Joseph Kalua', email: 'joseph.kalua@presstrust.mw', role: 'Finance' },
  { key: 'financeChecker', name: 'Ruth Nkhoma', email: 'ruth.nkhoma@presstrust.mw', role: 'Finance' },
  { key: 'meManager', name: 'M&E Coordinator', email: 'me@presstrust.mw', role: 'ME' },
  { key: 'meOfficer', name: 'Precious Gondwe', email: 'precious.gondwe@presstrust.mw', role: 'ME' },
  { key: 'auditorManager', name: 'Auditor', email: 'auditor@presstrust.mw', role: 'Auditor' },
  { key: 'auditor2', name: 'Frank Tembo', email: 'frank.tembo@presstrust.mw', role: 'Auditor' },
  { key: 'sponsor', name: 'Sponsor', email: 'sponsor@presstrust.mw', role: 'Sponsor' },
];

// ──────────────────────────────────────────────
// Malawi Reference Data
// ──────────────────────────────────────────────

const DISTRICTS = [
  'Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Kasungu', 'Dedza', 'Mchinji',
  'Mangochi', 'Salima', 'Ntcheu', 'Nkhata Bay', 'Rumphi', 'Karonga',
  'Thyolo', 'Mulanje', 'Phalombe', 'Chiradzulu', 'Balaka', 'Nkhotakota',
  'Dowa', 'Ntchisi', 'Likoma', 'Chitipa', 'Mwanza', 'Nsanje', 'Chikwawa',
];

const ACADEMIC_PERIODS = ['2026-T1', '2026-T2', '2026-T3', '2027-T1', '2027-T2', '2027-T3'];

const DISBURSEMENT_ITEMS = ['fees', 'uniform', 'books', 'boarding', 'transport', 'exam_fees', 'stationery', 'medical'];

const REFERENCE_DATA_BY_TYPE: Record<string, { code: string; name: string }[]> = {
  school_type: [
    { code: 'primary', name: 'Primary' },
    { code: 'secondary', name: 'Secondary' },
    { code: 'cdss', name: 'CDSS' },
  ],
  relationship: [
    { code: 'mother', name: 'Mother' },
    { code: 'father', name: 'Father' },
    { code: 'aunt', name: 'Aunt' },
    { code: 'uncle', name: 'Uncle' },
    { code: 'grandparent', name: 'Grandparent' },
    { code: 'guardian', name: 'Guardian' },
    { code: 'other', name: 'Other' },
  ],
  document_type: [
    { code: 'birth_certificate', name: 'Birth Certificate' },
    { code: 'national_id', name: 'National ID' },
    { code: 'guardian_id', name: 'Guardian National ID' },
    { code: 'enrollment_proof', name: 'Proof of School Enrollment' },
    { code: 'means_assessment', name: 'Household Means Assessment' },
    { code: 'report_card', name: 'Latest Report Card' },
    { code: 'id_copy', name: 'ID Copy' },
  ],
  disbursement_category: [
    { code: 'fees', name: 'Fees' },
    { code: 'boarding', name: 'Boarding' },
    { code: 'exam_fees', name: 'Exam Fees' },
    { code: 'uniform', name: 'Uniform' },
    { code: 'books', name: 'Books' },
    { code: 'transport', name: 'Transport' },
    { code: 'shoes', name: 'Shoes' },
    { code: 'other', name: 'Other' },
  ],
  program_type: [
    { code: 'one_off', name: 'One-off' },
    { code: 'recurring', name: 'Recurring' },
    { code: 'renewable', name: 'Renewable' },
  ],
};

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

const SCHOOL_BANK_ACCOUNTS: { school: string; bank_name: string; branch: string; account_number: string; approval_status: string }[] = [
  { school: 'Lilongwe Secondary School', bank_name: 'National Bank of Malawi', branch: 'Capital City Branch', account_number: '1002034455', approval_status: 'approved' },
  { school: 'Blantyre Girls Secondary', bank_name: 'Standard Bank Malawi', branch: 'Blantyre Branch', account_number: '8820019933', approval_status: 'approved' },
  { school: 'Mzuzu Academy', bank_name: 'FDH Bank', branch: 'Mzuzu Branch', account_number: '5501122390', approval_status: 'approved' },
  { school: 'Zomba Catholic Secondary', bank_name: 'NBS Bank', branch: 'Zomba Branch', account_number: '3312245567', approval_status: 'approved' },
  { school: 'Kasungu Day Secondary', bank_name: 'First Capital Bank', branch: 'Kasungu Branch', account_number: '7789001122', approval_status: 'pending' },
  { school: 'Dedza Secondary School', bank_name: 'National Bank of Malawi', branch: 'Dedza Branch', account_number: '1002099887', approval_status: 'approved' },
  { school: 'Mchinji Secondary', bank_name: 'Standard Bank Malawi', branch: 'Mchinji Branch', account_number: '8820055443', approval_status: 'pending' },
  { school: 'Mangochi Secondary School', bank_name: 'FDH Bank', branch: 'Mangochi Branch', account_number: '5501199001', approval_status: 'approved' },
];

const FUNDING_SOURCES: { name: string; description: string; total_allocation: number; utilized_amount: number }[] = [
  { name: 'Press Trust Endowment Fund', description: 'Internal endowment supporting long-term secondary scholarships', total_allocation: 20_000_000, utilized_amount: 4_300_000 },
  { name: 'Global Education Partners', description: 'External grant funding for primary school support (uniforms, books, transport)', total_allocation: 8_000_000, utilized_amount: 2_150_000 },
  { name: 'Ministry of Education Bursary Fund', description: 'Government co-funding for vulnerable secondary students', total_allocation: 12_000_000, utilized_amount: 1_800_000 },
];

const PROGRAM_SECONDARY = {
  name: 'Press Trust Secondary School Scholarship 2026',
  description: 'Full tuition, boarding and learning materials support for vulnerable secondary school students across Malawi',
  budget_ceiling: 20_000_000,
  budget_utilized: 4_950_000,
  award_types: ['one_off', 'recurring', 'renewable'] as any,
  status: 'Open' as const,
  application_open_date: new Date('2026-01-05'),
  application_close_date: new Date('2026-02-28'),
};

const PROGRAM_PRIMARY = {
  name: 'Press Trust Primary Support Program 2026',
  description: 'Uniform, books and transport support for orphaned and vulnerable primary school children',
  budget_ceiling: 8_000_000,
  budget_utilized: 1_450_000,
  award_types: ['one_off', 'recurring'] as any,
  status: 'Closed' as const,
  application_open_date: new Date('2026-01-06'),
  application_close_date: new Date('2026-02-20'),
};

// ──────────────────────────────────────────────
// Beneficiaries
// ──────────────────────────────────────────────

interface BeneficiarySeed {
  first_name: string;
  last_name: string;
  gender: string;
  school: string;
  national_id: string;
  exams_id: string;
  status: 'Imported' | 'PendingOnboarding' | 'Active' | 'Suspended' | 'Closed';
  status_reason?: string;
  academic_year: string;
  program: 'secondary' | 'primary';
  contact_phone?: string;
  contact_email?: string;
  guardian?: { name: string; relationship: string; contact_phone: string; contact_email?: string };
}

const BENEFICIARIES: BeneficiarySeed[] = [
  {
    first_name: 'Chisomo', last_name: 'Banda', gender: 'Female', school: 'Lilongwe Secondary School',
    national_id: 'MW-CHB-001', exams_id: 'EX-001', status: 'Active', academic_year: '2026-T1', program: 'secondary',
    contact_phone: '+265888001122',
    guardian: { name: 'John Banda', relationship: 'Father', contact_phone: '+265991234567' },
  },
  {
    first_name: 'Thandiwe', last_name: 'Phiri', gender: 'Female', school: 'Blantyre Girls Secondary',
    national_id: 'MW-THP-002', exams_id: 'EX-002', status: 'Active', academic_year: '2026-T1', program: 'secondary',
    contact_phone: '+265888002233',
    guardian: { name: 'Grace Phiri', relationship: 'Mother', contact_phone: '+265992345678' },
  },
  {
    first_name: 'Yamikani', last_name: 'Kamanga', gender: 'Male', school: 'Mzuzu Academy',
    national_id: 'MW-YAK-003', exams_id: 'EX-003', status: 'PendingOnboarding', academic_year: '2026-T1', program: 'secondary',
    guardian: { name: 'Peter Kamanga', relationship: 'Uncle', contact_phone: '+265993456789' },
  },
  {
    first_name: 'Tadala', last_name: 'Mussa', gender: 'Female', school: 'Zomba Catholic Secondary',
    national_id: 'MW-TAM-004', exams_id: 'EX-004', status: 'Imported', academic_year: '2026-T1', program: 'secondary',
  },
  {
    first_name: 'Mphatso', last_name: 'Nyirenda', gender: 'Male', school: 'Kasungu Day Secondary',
    national_id: 'MW-MPN-005', exams_id: 'EX-005', status: 'Active', academic_year: '2026-T1', program: 'secondary',
    contact_phone: '+265888005566',
    guardian: { name: 'Agnes Nyirenda', relationship: 'Mother', contact_phone: '+265994567890' },
  },
  {
    first_name: 'Grace', last_name: 'Mwale', gender: 'Female', school: 'Dedza Secondary School',
    national_id: 'MW-GRM-006', exams_id: 'EX-006', status: 'Active', academic_year: '2026-T1', program: 'secondary',
    contact_phone: '+265888006677',
    guardian: { name: 'James Mwale', relationship: 'Father', contact_phone: '+265995678901' },
  },
  {
    first_name: 'Isaac', last_name: 'Chirwa', gender: 'Male', school: 'Mchinji Secondary',
    national_id: 'MW-ISC-007', exams_id: 'EX-007', status: 'Suspended', academic_year: '2026-T2', program: 'secondary',
    status_reason: 'Guardian phone number could not be verified via SMS gateway',
    guardian: { name: 'Susan Chirwa', relationship: 'Mother', contact_phone: '+265996789012' },
  },
  {
    first_name: 'Patricia', last_name: 'Zulu', gender: 'Female', school: 'Mangochi Secondary School',
    national_id: 'MW-PAZ-008', exams_id: 'EX-008', status: 'Suspended', academic_year: '2026-T1', program: 'secondary',
    status_reason: 'Missing birth certificate — awaiting re-submission from guardian',
    guardian: { name: 'Peter Zulu', relationship: 'Father', contact_phone: '+265997890123' },
  },
  {
    first_name: 'Dan', last_name: 'Phiri', gender: 'Male', school: 'Lilongwe Secondary School',
    national_id: 'MW-DNP-009', exams_id: 'EX-009', status: 'Imported', academic_year: '2026-T2', program: 'secondary',
    guardian: { name: 'Mary Phiri', relationship: 'Mother', contact_phone: '+265998901234' },
  },
  {
    first_name: 'Ruth', last_name: 'Kamwendo', gender: 'Female', school: 'Blantyre Girls Secondary',
    national_id: 'MW-RUK-010', exams_id: 'EX-010', status: 'PendingOnboarding', academic_year: '2026-T2', program: 'secondary',
    guardian: { name: 'Chikondi Kamwendo', relationship: 'Aunt', contact_phone: '+265999012345' },
  },
  {
    first_name: 'Blessings', last_name: 'Kaunda', gender: 'Male', school: 'Mzuzu Academy',
    national_id: 'MW-BLK-011', exams_id: 'EX-011', status: 'Active', academic_year: '2026-T2', program: 'secondary',
    contact_phone: '+265888011223',
    guardian: { name: 'Ellen Kaunda', relationship: 'Mother', contact_phone: '+265881123456' },
  },
  {
    first_name: 'Chikondi', last_name: 'Nkhoma', gender: 'Female', school: 'Zomba Catholic Secondary',
    national_id: 'MW-CHN-012', exams_id: 'EX-012', status: 'Closed', academic_year: '2026-T1', program: 'primary',
    status_reason: 'Completed Standard 8 — transitioning to secondary school',
    guardian: { name: 'Esther Nkhoma', relationship: 'Mother', contact_phone: '+265882234567' },
  },
  {
    first_name: 'Loveness', last_name: 'Phiri', gender: 'Female', school: 'Kasungu Day Secondary',
    national_id: 'MW-LVP-013', exams_id: 'EX-013', status: 'Closed', academic_year: '2026-T2', program: 'primary',
    status_reason: 'Graduated from the program academic cycle',
    guardian: { name: 'Foster Phiri', relationship: 'Father', contact_phone: '+265883345678' },
  },
  {
    first_name: 'Precious', last_name: 'Banda', gender: 'Female', school: 'Dedza Secondary School',
    national_id: 'MW-PRB-014', exams_id: 'EX-014', status: 'Active', academic_year: '2026-T2', program: 'primary',
    contact_phone: '+265888014455',
    guardian: { name: 'Alice Banda', relationship: 'Mother', contact_phone: '+265884456789' },
  },
  {
    first_name: 'Esther', last_name: 'Gondwe', gender: 'Female', school: 'Mchinji Secondary',
    national_id: 'MW-ESG-015', exams_id: 'EX-015', status: 'Active', academic_year: '2026-T2', program: 'primary',
    contact_phone: '+265888015566',
    guardian: { name: 'Dorothy Gondwe', relationship: 'Mother', contact_phone: '+265885567890' },
  },
  {
    first_name: 'Peter', last_name: 'Zimba', gender: 'Male', school: 'Mangochi Secondary School',
    national_id: 'MW-PTZ-016', exams_id: 'EX-016', status: 'Imported', academic_year: '2027-T1', program: 'secondary',
    guardian: { name: 'Beatrice Zimba', relationship: 'Mother', contact_phone: '+265886678901' },
  },
];

async function seedReferenceData(type: string, items: string[]) {
  for (const name of items) {
    const code = name.toLowerCase().replace(/\s+/g, '_');
    await prisma.referenceData.upsert({
      where: { type_code: { type, code } },
      update: { name, status: 'active' },
      create: { type, code, name, status: 'active' },
    });
  }
  console.log(`Seeded ${items.length} ${type} reference entries`);
}

async function seedTypedReferenceData() {
  for (const [type, items] of Object.entries(REFERENCE_DATA_BY_TYPE)) {
    for (const item of items) {
      await prisma.referenceData.upsert({
        where: { type_code: { type, code: item.code } },
        update: { name: item.name, status: 'active' },
        create: { type, code: item.code, name: item.name, status: 'active' },
      });
    }
    console.log(`Seeded ${items.length} ${type} reference entries`);
  }
}

async function seedSchools(schools: typeof SCHOOLS): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const s of schools) {
    const existing = await prisma.school.findFirst({ where: { name: s.name } });
    if (existing) {
      const updated = await prisma.school.update({
        where: { id: existing.id },
        data: {
          district: s.district,
          type: s.type,
          status: 'active',
          location: `${s.district} District`,
          contact_phone: '+265991234000',
          contact_email: `admin@${s.name.toLowerCase().replace(/[^a-z]+/g, '')}.edu.mw`,
          registration_status: 'registered',
        },
      });
      map.set(s.name, updated.id);
    } else {
      const created = await prisma.school.create({
        data: {
          name: s.name,
          district: s.district,
          type: s.type,
          status: 'active',
          location: `${s.district} District`,
          contact_phone: '+265991234000',
          contact_email: `admin@${s.name.toLowerCase().replace(/[^a-z]+/g, '')}.edu.mw`,
          registration_status: 'registered',
        },
      });
      map.set(s.name, created.id);
    }
  }
  console.log(`Seeded ${schools.length} schools`);
  return map;
}

async function seedSchoolBankAccounts(schoolMap: Map<string, string>) {
  let created = 0;
  for (const acc of SCHOOL_BANK_ACCOUNTS) {
    const schoolId = schoolMap.get(acc.school);
    if (!schoolId) continue;

    const existing = await prisma.schoolBankAccount.findFirst({ where: { school_id: schoolId, account_number: acc.account_number } });
    if (existing) continue;

    await prisma.schoolBankAccount.create({
      data: {
        school_id: schoolId,
        bank_name: acc.bank_name,
        branch: acc.branch,
        account_number: acc.account_number,
        account_holder_name: acc.school,
        status: 'active',
        approval_status: acc.approval_status,
      },
    });
    created++;
  }
  console.log(`Seeded ${created} school bank accounts`);
}

async function seedDisbursementItems(items: string[]) {
  for (const name of items) {
    await prisma.disbursementItem.upsert({
      where: { name },
      update: { status: 'active' },
      create: { name, status: 'active' },
    });
  }
  console.log(`Seeded ${items.length} disbursement items`);
}

async function seedFundingSources(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const fs_ of FUNDING_SOURCES) {
    let source = await prisma.fundingSource.findFirst({ where: { name: fs_.name } });
    if (!source) {
      source = await prisma.fundingSource.create({
        data: { name: fs_.name, description: fs_.description, total_allocation: fs_.total_allocation, utilized_amount: fs_.utilized_amount, status: 'active' },
      });
      console.log(`Seeded funding source: ${source.name}`);
    }
    map.set(fs_.name, source.id);
  }
  return map;
}

async function seedPrograms() {
  async function upsertProgram(def: typeof PROGRAM_SECONDARY) {
    const existing = await prisma.program.findFirst({ where: { name: def.name } });
    if (existing) {
      return prisma.program.update({
        where: { id: existing.id },
        data: {
          description: def.description,
          budget_ceiling: def.budget_ceiling,
          budget_utilized: def.budget_utilized,
          award_types: def.award_types,
          status: def.status,
          application_open_date: def.application_open_date,
          application_close_date: def.application_close_date,
        },
      });
    }
    const created = await prisma.program.create({ data: def as any });
    console.log(`Seeded program: ${created.name} (id: ${created.id})`);
    return created;
  }

  const secondary = await upsertProgram(PROGRAM_SECONDARY);
  const primary = await upsertProgram(PROGRAM_PRIMARY);

  // Attach funding sources to programs (idempotent)
  async function linkFunding(programId: string, sourceNames: string[]) {
    for (const name of sourceNames) {
      const source = await prisma.fundingSource.findFirst({ where: { name } });
      if (!source) continue;
      const existing = await prisma.programFundingSource.findUnique({
        where: { program_id_funding_source_id: { program_id: programId, funding_source_id: source.id } },
      });
      if (!existing) {
        await prisma.programFundingSource.create({
          data: { program_id: programId, funding_source_id: source.id },
        });
      }
    }
  }

  await prisma.program.update({
    where: { id: secondary.id },
    data: {
      required_documents: ['Birth Certificate', 'Proof of School Enrollment', 'Guardian National ID', 'Household Means Assessment'],
    },
  });
  await prisma.program.update({
    where: { id: primary.id },
    data: {
      required_documents: ['Birth Certificate', 'Proof of School Enrollment'],
    },
  });

  await linkFunding(secondary.id, ['Press Trust Endowment Fund', 'Ministry of Education Bursary Fund']);
  await linkFunding(primary.id, ['Global Education Partners']);

  return { secondary, primary };
}

async function seedBeneficiaries(
  schoolMap: Map<string, string>,
  programs: { secondary: { id: string }; primary: { id: string } },
  importedBy: string
): Promise<Map<string, any>> {
  const beneficiaryMap = new Map<string, any>();
  const newlyCreatedIds: string[] = [];

  for (const b of BENEFICIARIES) {
    const schoolId = schoolMap.get(b.school);
    if (!schoolId) continue;

    const existing = await prisma.beneficiary.findFirst({ where: { national_id: b.national_id } });
    if (existing) {
      beneficiaryMap.set(b.national_id, existing);
      continue;
    }

    const programId = b.program === 'secondary' ? programs.secondary.id : programs.primary.id;
    const identifier = `PT-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

    const beneficiary = await prisma.beneficiary.create({
      data: {
        beneficiary_identifier: identifier,
        first_name: b.first_name,
        last_name: b.last_name,
        gender: b.gender,
        district: SCHOOLS.find((s) => s.name === b.school)?.district || 'Lilongwe',
        school_id: schoolId,
        program_id: programId,
        national_id: b.national_id,
        exams_id: b.exams_id,
        status: b.status,
        status_reason: b.status_reason,
        academic_year: b.academic_year,
        contact_phone: b.contact_phone,
        contact_email: b.contact_email,
      },
    });

    if (b.guardian) {
      await prisma.guardian.create({
        data: {
          beneficiary_id: beneficiary.id,
          name: b.guardian.name,
          relationship: b.guardian.relationship,
          contact_phone: b.guardian.contact_phone,
          contact_email: b.guardian.contact_email,
          consent_provided: true,
        },
      });
    }

    beneficiaryMap.set(b.national_id, beneficiary);
    newlyCreatedIds.push(beneficiary.id);

    await logAudit({
      user_id: importedBy,
      action: 'create',
      entity_type: 'Beneficiary',
      entity_id: beneficiary.id,
      new_values: { beneficiary_identifier: identifier, first_name: b.first_name, last_name: b.last_name, status: b.status },
    });

    // Mirror the real onboarding workflow's audit trail for anyone beyond "Imported"
    if (b.status === 'PendingOnboarding' || b.status === 'Active' || b.status === 'Suspended' || b.status === 'Closed') {
      await logAudit({
        user_id: importedBy,
        action: 'validate',
        entity_type: 'Beneficiary',
        entity_id: beneficiary.id,
        old_values: { status: 'Imported' },
        new_values: { status: 'PendingOnboarding' },
      });
    }
    if (b.status === 'Active' || b.status === 'Closed') {
      await logAudit({
        user_id: importedBy,
        action: 'approve',
        entity_type: 'Beneficiary',
        entity_id: beneficiary.id,
        old_values: { status: 'PendingOnboarding' },
        new_values: { status: 'Active' },
      });
    }
    if (b.status === 'Suspended') {
      await logAudit({
        user_id: importedBy,
        action: 'exception',
        entity_type: 'Beneficiary',
        entity_id: beneficiary.id,
        old_values: { status: 'PendingOnboarding' },
        new_values: { status: 'Suspended', status_reason: b.status_reason },
      });
    }
  }

  if (newlyCreatedIds.length > 0) {
    // Gives the Import History / Import Wizard pages (which read the audit
    // log for action="import") something to show.
    await logAudit({
      user_id: importedBy,
      action: 'import',
      entity_type: 'Beneficiary',
      entity_id: 'bulk',
      new_values: {
        total_rows: newlyCreatedIds.length,
        created: newlyCreatedIds.length,
        created_ids: newlyCreatedIds,
        skipped_duplicates: 0,
        errors: 0,
      },
    });
  }

  console.log(`Seeded ${beneficiaryMap.size} beneficiaries (${newlyCreatedIds.length} newly created)`);
  return beneficiaryMap;
}

async function writeDummyFile(filename: string, content: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), 'uploads');
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  await fs.promises.writeFile(filePath, Buffer.from(content));
  return filePath;
}

interface DocumentSeed {
  nationalId: string;
  document_type: string;
  original_name: string;
  status: 'Pending' | 'Verified' | 'Rejected';
  rejection_reason?: string;
}

const DOCUMENTS: DocumentSeed[] = [
  { nationalId: 'MW-CHB-001', document_type: 'id_copy', original_name: 'id_copy_chisomo.pdf', status: 'Verified' },
  { nationalId: 'MW-CHB-001', document_type: 'report_card', original_name: 'report_card_chisomo.pdf', status: 'Verified' },
  { nationalId: 'MW-YAK-003', document_type: 'birth_certificate', original_name: 'birth_certificate_yamikani.pdf', status: 'Pending' },
  { nationalId: 'MW-YAK-003', document_type: 'guardian_id', original_name: 'guardian_id_yamikani.pdf', status: 'Rejected', rejection_reason: 'ID photo is blurry — please resubmit a clearer scan' },
  { nationalId: 'MW-ISC-007', document_type: 'guardian_id', original_name: 'guardian_id_isaac.pdf', status: 'Rejected', rejection_reason: 'Guardian name does not match the submitted National ID' },
  { nationalId: 'MW-RUK-010', document_type: 'birth_certificate', original_name: 'birth_certificate_ruth.pdf', status: 'Verified' },
  { nationalId: 'MW-RUK-010', document_type: 'means_assessment', original_name: 'means_assessment_ruth.pdf', status: 'Pending' },
  { nationalId: 'MW-TAM-004', document_type: 'birth_certificate', original_name: 'birth_certificate_tadala.pdf', status: 'Pending' },
  { nationalId: 'MW-DNP-009', document_type: 'enrollment_proof', original_name: 'enrollment_proof_dan.pdf', status: 'Pending' },
  { nationalId: 'MW-MPN-005', document_type: 'id_copy', original_name: 'id_copy_mphatso.pdf', status: 'Verified' },
];

async function seedDocuments(beneficiaryMap: Map<string, any>, uploaderId: string): Promise<Map<string, string>> {
  const documentIdByKey = new Map<string, string>();
  let created = 0;
  for (const d of DOCUMENTS) {
    const beneficiary = beneficiaryMap.get(d.nationalId);
    if (!beneficiary) continue;

    const existing = await prisma.document.findFirst({ where: { documentable_id: beneficiary.id, document_type: d.document_type } });
    if (existing) {
      documentIdByKey.set(`${d.nationalId}:${d.document_type}`, existing.id);
      continue;
    }

    const filePath = await writeDummyFile(`seed_${d.document_type}_${beneficiary.id}.pdf`, `Sample ${d.document_type} for ${beneficiary.first_name} ${beneficiary.last_name}`);

    const document = await prisma.document.create({
      data: {
        documentable_id: beneficiary.id,
        documentable_type: 'beneficiary',
        file_path: filePath,
        original_name: d.original_name,
        mime_type: 'application/pdf',
        file_size: 128,
        document_type: d.document_type,
        status: d.status,
        rejection_reason: d.rejection_reason,
        version: 1,
        virus_scan_status: 'clean',
        uploaded_by: uploaderId,
      },
    });
    documentIdByKey.set(`${d.nationalId}:${d.document_type}`, document.id);
    created++;

    await logAudit({
      user_id: uploaderId,
      action: 'upload',
      entity_type: 'Document',
      entity_id: document.id,
      new_values: { document_type: d.document_type, status: d.status },
    });
  }
  console.log(`Seeded ${created} documents`);
  return documentIdByKey;
}

// ──────────────────────────────────────────────
// Awards
// ──────────────────────────────────────────────

interface AwardSeed {
  nationalId: string;
  fundingSource: string;
  amount: number;
  balance_remaining: number;
  start: string;
  end: string;
  award_type: 'one_off' | 'recurring' | 'renewable';
  status: 'Draft' | 'Active' | 'Suspended' | 'Completed' | 'Closed';
  status_reason?: string;
}

const AWARDS: AwardSeed[] = [
  { nationalId: 'MW-CHB-001', fundingSource: 'Press Trust Endowment Fund', amount: 450_000, balance_remaining: 300_000, start: '2026-01-25', end: '2026-12-15', award_type: 'renewable', status: 'Active' },
  { nationalId: 'MW-CHB-001', fundingSource: 'Press Trust Endowment Fund', amount: 30_000, balance_remaining: 30_000, start: '2026-06-01', end: '2026-12-31', award_type: 'recurring', status: 'Draft' },
  { nationalId: 'MW-THP-002', fundingSource: 'Ministry of Education Bursary Fund', amount: 420_000, balance_remaining: 220_000, start: '2026-01-21', end: '2026-12-15', award_type: 'renewable', status: 'Active' },
  { nationalId: 'MW-MPN-005', fundingSource: 'Press Trust Endowment Fund', amount: 450_000, balance_remaining: 150_000, start: '2026-01-21', end: '2026-12-15', award_type: 'renewable', status: 'Active' },
  { nationalId: 'MW-GRM-006', fundingSource: 'Ministry of Education Bursary Fund', amount: 380_000, balance_remaining: 260_000, start: '2026-02-01', end: '2026-12-15', award_type: 'one_off', status: 'Active' },
  { nationalId: 'MW-BLK-011', fundingSource: 'Press Trust Endowment Fund', amount: 400_000, balance_remaining: 400_000, start: '2026-05-01', end: '2027-04-30', award_type: 'renewable', status: 'Active' },
  { nationalId: 'MW-ISC-007', fundingSource: 'Ministry of Education Bursary Fund', amount: 350_000, balance_remaining: 350_000, start: '2026-03-01', end: '2026-12-15', award_type: 'one_off', status: 'Suspended', status_reason: 'Beneficiary onboarding exception under review' },
  { nationalId: 'MW-PAZ-008', fundingSource: 'Press Trust Endowment Fund', amount: 300_000, balance_remaining: 260_000, start: '2026-01-15', end: '2026-12-15', award_type: 'one_off', status: 'Suspended', status_reason: 'Missing document — birth certificate' },
  { nationalId: 'MW-CHN-012', fundingSource: 'Global Education Partners', amount: 120_000, balance_remaining: 0, start: '2025-01-28', end: '2025-12-10', award_type: 'one_off', status: 'Completed' },
  { nationalId: 'MW-LVP-013', fundingSource: 'Global Education Partners', amount: 110_000, balance_remaining: 0, start: '2025-01-25', end: '2025-12-10', award_type: 'one_off', status: 'Closed', status_reason: 'Program cycle completed' },
  { nationalId: 'MW-PRB-014', fundingSource: 'Global Education Partners', amount: 95_000, balance_remaining: 55_000, start: '2026-02-05', end: '2026-12-10', award_type: 'recurring', status: 'Active' },
  { nationalId: 'MW-ESG-015', fundingSource: 'Global Education Partners', amount: 90_000, balance_remaining: 40_000, start: '2026-02-05', end: '2026-12-10', award_type: 'recurring', status: 'Active' },
];

async function seedAwards(
  beneficiaryMap: Map<string, any>,
  programs: { secondary: { id: string }; primary: { id: string } },
  fundingSourceMap: Map<string, string>,
  actorId: string
): Promise<Map<string, any[]>> {
  const awardsByBeneficiary = new Map<string, any[]>();
  let created = 0;

  for (const a of AWARDS) {
    const beneficiary = beneficiaryMap.get(a.nationalId);
    if (!beneficiary) continue;

    // Matched (not counted+replaced) per seed entry so the resulting list stays
    // index-aligned with the AWARDS array — downstream disbursement seeding
    // relies on awardIndex 0 being "the" primary award for that beneficiary.
    let award = await prisma.award.findFirst({ where: { beneficiary_id: beneficiary.id, amount: a.amount, award_type: a.award_type } });

    if (!award) {
      const seedBeneficiary = BENEFICIARIES.find((b) => b.national_id === a.nationalId)!;
      const programId = seedBeneficiary.program === 'secondary' ? programs.secondary.id : programs.primary.id;

      award = await prisma.award.create({
        data: {
          beneficiary_id: beneficiary.id,
          program_id: programId,
          funding_source_id: fundingSourceMap.get(a.fundingSource),
          amount: a.amount,
          balance_remaining: a.balance_remaining,
          start_date: new Date(a.start),
          end_date: new Date(a.end),
          award_type: a.award_type,
          status: a.status,
          status_reason: a.status_reason,
        },
      });
      created++;

      await logAudit({
        user_id: actorId,
        action: 'create',
        entity_type: 'Award',
        entity_id: award.id,
        new_values: { amount: a.amount, award_type: a.award_type, status: a.status },
      });
      if (a.status === 'Active') {
        await logAudit({
          user_id: actorId,
          action: 'status_change',
          entity_type: 'Award',
          entity_id: award.id,
          old_values: { status: 'Draft' },
          new_values: { status: 'Active' },
        });
      }
    }

    const list = awardsByBeneficiary.get(a.nationalId) || [];
    list.push(award);
    awardsByBeneficiary.set(a.nationalId, list);
  }

  console.log(`Seeded ${created} awards`);
  return awardsByBeneficiary;
}

// ──────────────────────────────────────────────
// Disbursements
// ──────────────────────────────────────────────

interface DisbursementSeed {
  nationalId: string;
  awardIndex?: number;
  amount: number;
  category: string;
  academic_period: string;
  payee_type: 'school' | 'guardian' | 'vendor';
  payee_name: string;
  status: 'Requested' | 'Approved' | 'Paid' | 'Failed' | 'Reconciled';
  failure_reason?: string;
}

const DISBURSEMENTS: DisbursementSeed[] = [
  { nationalId: 'MW-CHB-001', amount: 25_000, category: 'fees', academic_period: '2026-T1', payee_type: 'school', payee_name: 'Lilongwe Secondary School', status: 'Requested' },
  { nationalId: 'MW-CHB-001', amount: 15_000, category: 'books', academic_period: '2026-T1', payee_type: 'vendor', payee_name: 'Malawi Book Suppliers', status: 'Approved' },
  { nationalId: 'MW-CHB-001', amount: 10_000, category: 'transport', academic_period: '2026-T1', payee_type: 'guardian', payee_name: 'John Banda', status: 'Paid' },
  { nationalId: 'MW-THP-002', amount: 150_000, category: 'fees', academic_period: '2026-T1', payee_type: 'school', payee_name: 'Blantyre Girls Secondary', status: 'Reconciled' },
  { nationalId: 'MW-THP-002', amount: 60_000, category: 'boarding', academic_period: '2026-T2', payee_type: 'school', payee_name: 'Blantyre Girls Secondary', status: 'Paid' },
  { nationalId: 'MW-MPN-005', amount: 150_000, category: 'fees', academic_period: '2026-T1', payee_type: 'school', payee_name: 'Kasungu Day Secondary', status: 'Reconciled' },
  { nationalId: 'MW-MPN-005', amount: 150_000, category: 'boarding', academic_period: '2026-T2', payee_type: 'school', payee_name: 'Kasungu Day Secondary', status: 'Paid' },
  { nationalId: 'MW-MPN-005', amount: 20_000, category: 'exam_fees', academic_period: '2026-T3', payee_type: 'school', payee_name: 'Kasungu Day Secondary', status: 'Requested' },
  { nationalId: 'MW-GRM-006', amount: 80_000, category: 'fees', academic_period: '2026-T1', payee_type: 'school', payee_name: 'Dedza Secondary School', status: 'Approved' },
  { nationalId: 'MW-GRM-006', amount: 25_000, category: 'uniform', academic_period: '2026-T1', payee_type: 'vendor', payee_name: 'Dedza School Outfitters', status: 'Requested' },
  { nationalId: 'MW-BLK-011', amount: 12_000, category: 'transport', academic_period: '2026-T2', payee_type: 'guardian', payee_name: 'Ellen Kaunda', status: 'Requested' },
  { nationalId: 'MW-ISC-007', amount: 80_000, category: 'fees', academic_period: '2026-T2', payee_type: 'school', payee_name: 'Mchinji Secondary', status: 'Failed', failure_reason: 'Bank account verification failed — guardian ID mismatch' },
  { nationalId: 'MW-PAZ-008', amount: 40_000, category: 'uniform', academic_period: '2026-T1', payee_type: 'vendor', payee_name: 'Mangochi School Outfitters', status: 'Reconciled' },
  { nationalId: 'MW-CHN-012', amount: 60_000, category: 'fees', academic_period: '2026-T1', payee_type: 'school', payee_name: 'Zomba Catholic Secondary', status: 'Reconciled' },
  { nationalId: 'MW-CHN-012', amount: 30_000, category: 'books', academic_period: '2026-T1', payee_type: 'vendor', payee_name: 'Zomba Book Suppliers', status: 'Reconciled' },
  { nationalId: 'MW-LVP-013', amount: 35_000, category: 'uniform', academic_period: '2026-T2', payee_type: 'vendor', payee_name: 'Kasungu School Outfitters', status: 'Reconciled' },
  { nationalId: 'MW-PRB-014', amount: 20_000, category: 'books', academic_period: '2026-T2', payee_type: 'vendor', payee_name: 'Dedza Book Suppliers', status: 'Approved' },
  { nationalId: 'MW-ESG-015', amount: 18_000, category: 'stationery', academic_period: '2026-T2', payee_type: 'vendor', payee_name: 'Mchinji Stationers', status: 'Paid' },
];

async function seedDisbursements(
  beneficiaryMap: Map<string, any>,
  awardsByBeneficiary: Map<string, any[]>,
  programs: { secondary: { id: string }; primary: { id: string } },
  makerId: string,
  checkerId: string
): Promise<any[]> {
  const createdDisbursements: any[] = [];
  let created = 0;

  for (const d of DISBURSEMENTS) {
    const beneficiary = beneficiaryMap.get(d.nationalId);
    const awards = awardsByBeneficiary.get(d.nationalId);
    if (!beneficiary || !awards || awards.length === 0) continue;
    const award = awards[d.awardIndex ?? 0];
    if (!award) continue;

    const existing = await prisma.disbursement.findFirst({
      where: { award_id: award.id, category: d.category, academic_period: d.academic_period, amount: d.amount },
    });
    if (existing) {
      createdDisbursements.push(existing);
      continue;
    }

    const seedBeneficiary = BENEFICIARIES.find((b) => b.national_id === d.nationalId)!;
    const programId = seedBeneficiary.program === 'secondary' ? programs.secondary.id : programs.primary.id;

    const isApproved = ['Approved', 'Paid', 'Reconciled'].includes(d.status);
    const isPaid = ['Paid', 'Reconciled'].includes(d.status);
    const isReconciled = d.status === 'Reconciled';

    const disbursement = await prisma.disbursement.create({
      data: {
        award_id: award.id,
        beneficiary_id: beneficiary.id,
        program_id: programId,
        amount: d.amount,
        category: d.category,
        academic_period: d.academic_period,
        payee_type: d.payee_type,
        payee_name: d.payee_name,
        status: d.status,
        failure_reason: d.failure_reason,
        created_by: makerId,
        approved_by: isApproved || d.status === 'Failed' ? checkerId : undefined,
        approved_at: isApproved ? new Date() : undefined,
        paid_at: isPaid ? new Date() : undefined,
        reconciled_at: isReconciled ? new Date() : undefined,
        reconciled_by: isReconciled ? checkerId : undefined,
      },
    });
    createdDisbursements.push(disbursement);
    created++;

    await logAudit({ user_id: makerId, action: 'create', entity_type: 'Disbursement', entity_id: disbursement.id, new_values: { amount: d.amount, category: d.category, status: 'Requested' } });
    if (isApproved) {
      await logAudit({ user_id: checkerId, action: 'approve', entity_type: 'Disbursement', entity_id: disbursement.id, old_values: { status: 'Requested' }, new_values: { status: 'Approved' } });
    }
    if (isPaid) {
      await logAudit({ user_id: makerId, action: 'pay', entity_type: 'Disbursement', entity_id: disbursement.id, old_values: { status: 'Approved' }, new_values: { status: 'Paid' } });
    }
    if (isReconciled) {
      await logAudit({ user_id: checkerId, action: 'reconcile', entity_type: 'Disbursement', entity_id: disbursement.id, old_values: { status: 'Paid' }, new_values: { status: 'Reconciled' } });
    }
    if (d.status === 'Failed') {
      await logAudit({ user_id: checkerId, action: 'fail', entity_type: 'Disbursement', entity_id: disbursement.id, old_values: { status: 'Requested' }, new_values: { status: 'Failed', failure_reason: d.failure_reason } });
    }
  }

  console.log(`Seeded ${created} disbursements`);
  return createdDisbursements;
}

async function seedReversalAndEvidence(
  disbursements: any[],
  documentIdByKey: Map<string, string>,
  checkerId: string,
  uploaderId: string
) {
  // Small partial reversal against Chisomo's Paid transport disbursement
  const transportDisbursement = disbursements.find((d) => d.category === 'transport' && d.amount === 10_000);
  if (transportDisbursement) {
    const existingReversal = await prisma.reversal.findFirst({ where: { disbursement_id: transportDisbursement.id } });
    if (!existingReversal) {
      const reversal = await prisma.reversal.create({
        data: {
          disbursement_id: transportDisbursement.id,
          type: 'partial_refund',
          amount: 2_000,
          reason: 'Overpayment correction — guardian returned excess transport allowance',
          created_by: checkerId,
        },
      });
      await logAudit({ user_id: checkerId, action: 'reverse', entity_type: 'Disbursement', entity_id: transportDisbursement.id, new_values: { reversal_id: reversal.id, amount: 2_000 } });
      console.log('Seeded 1 disbursement reversal');
    }
  }

  // Attach the "payment voucher" document as evidence for Thandiwe's reconciled fees disbursement
  const feesDisbursement = disbursements.find((d) => d.category === 'fees' && d.amount === 150_000 && d.status === 'Reconciled');
  if (feesDisbursement) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id: feesDisbursement.beneficiary_id } });
    if (beneficiary) {
      let voucherDocId = documentIdByKey.get(`${beneficiary.national_id}:payment_voucher`);
      if (!voucherDocId) {
        const existingVoucher = await prisma.document.findFirst({ where: { documentable_id: feesDisbursement.id, document_type: 'payment_voucher' } });
        if (existingVoucher) {
          voucherDocId = existingVoucher.id;
        } else {
          const filePath = await writeDummyFile(`seed_voucher_${feesDisbursement.id}.pdf`, `Payment voucher for disbursement ${feesDisbursement.id}`);
          const voucher = await prisma.document.create({
            data: {
              documentable_id: feesDisbursement.id,
              documentable_type: 'disbursement',
              file_path: filePath,
              original_name: `voucher_${feesDisbursement.id}.pdf`,
              mime_type: 'application/pdf',
              file_size: 64,
              document_type: 'payment_voucher',
              status: 'Verified',
              version: 1,
              virus_scan_status: 'clean',
              uploaded_by: uploaderId,
            },
          });
          voucherDocId = voucher.id;
        }
      }

      const existingEvidence = await prisma.disbursementEvidence.findFirst({ where: { disbursement_id: feesDisbursement.id, document_id: voucherDocId } });
      if (!existingEvidence) {
        await prisma.disbursementEvidence.create({
          data: { disbursement_id: feesDisbursement.id, document_id: voucherDocId, uploaded_by: uploaderId },
        });
        console.log('Seeded 1 disbursement evidence link');
      }
    }
  }
}

// ──────────────────────────────────────────────
// Monitoring & Evaluation
// ──────────────────────────────────────────────

async function seedPerformanceAndMe(
  beneficiaryMap: Map<string, any>,
  schoolMap: Map<string, string>,
  recorderId: string
) {
  const performanceRows: { nationalId: string; period: string; overall: number; attendance: number; progression: 'Promoted' | 'Repeated' | 'Completed' | 'Dropped'; notes?: string }[] = [
    { nationalId: 'MW-CHB-001', period: '2026-T1', overall: 78, attendance: 96, progression: 'Promoted', notes: 'Strong start to the year across all subjects' },
    { nationalId: 'MW-THP-002', period: '2026-T1', overall: 82, attendance: 98, progression: 'Promoted', notes: 'Consistently top of class' },
    { nationalId: 'MW-GRM-006', period: '2026-T1', overall: 70, attendance: 90, progression: 'Promoted' },
    { nationalId: 'MW-MPN-005', period: '2025-T3', overall: 45, attendance: 70, progression: 'Repeated', notes: 'Declining attendance, family circumstances cited' },
    { nationalId: 'MW-MPN-005', period: '2026-T1', overall: 41, attendance: 68, progression: 'Repeated', notes: 'Attendance continues to slip; home visit recommended' },
    { nationalId: 'MW-MPN-005', period: '2026-T2', overall: 38, attendance: 64, progression: 'Repeated', notes: 'Below continuation threshold for two consecutive terms' },
    { nationalId: 'MW-CHN-012', period: '2026-T1', overall: 88, attendance: 99, progression: 'Completed', notes: 'Completed Standard 8 with distinction' },
    { nationalId: 'MW-LVP-013', period: '2026-T1', overall: 75, attendance: 95, progression: 'Completed' },
  ];

  let created = 0;
  for (const p of performanceRows) {
    const beneficiary = beneficiaryMap.get(p.nationalId);
    if (!beneficiary) continue;
    const schoolId = beneficiary.school_id as string;

    const existing = await prisma.academicPerformance.findFirst({ where: { beneficiary_id: beneficiary.id, academic_period: p.period } });
    if (existing) continue;

    const perf = await prisma.academicPerformance.create({
      data: {
        beneficiary_id: beneficiary.id,
        school_id: schoolId,
        academic_period: p.period,
        subjects: { english: Math.max(0, p.overall - 5), math: Math.min(100, p.overall + 8), science: p.overall, social_studies: Math.max(0, p.overall - 2) } as any,
        overall_score: p.overall,
        attendance_percentage: p.attendance,
        progression: p.progression,
        notes: p.notes,
        created_by: recorderId,
      },
    });
    created++;

    await logAudit({ user_id: recorderId, action: 'record_performance', entity_type: 'AcademicPerformance', entity_id: perf.id, new_values: { academic_period: p.period, overall_score: p.overall } });
  }
  console.log(`Seeded ${created} academic performance records`);

  // At-risk: Mphatso — unresolved, auto-flagged from repeated poor performance
  const mphatso = beneficiaryMap.get('MW-MPN-005');
  if (mphatso) {
    const existingFlag = await prisma.atRiskFlag.findFirst({ where: { beneficiary_id: mphatso.id, resolved: false } });
    if (!existingFlag) {
      const flag = await prisma.atRiskFlag.create({
        data: {
          beneficiary_id: mphatso.id,
          reason: 'Average score 38% — below the 50% continuation threshold for two consecutive terms, with attendance also declining',
          flagged_by: recorderId,
        },
      });
      await logAudit({ user_id: recorderId, action: 'flag_at_risk', entity_type: 'AtRiskFlag', entity_id: flag.id, new_values: { reason: flag.reason } });
      console.log('Seeded 1 at-risk flag (unresolved)');
    }

    const existingIntervention = await prisma.intervention.findFirst({ where: { beneficiary_id: mphatso.id } });
    if (!existingIntervention) {
      const intervention = await prisma.intervention.create({
        data: {
          beneficiary_id: mphatso.id,
          action: 'Home visit to assess attendance barriers and household support needs following repeated poor performance',
          assigned_to: recorderId,
          due_date: new Date('2026-08-30'),
          status: 'InProgress',
          created_by: recorderId,
        },
      });
      await logAudit({ user_id: recorderId, action: 'create', entity_type: 'Intervention', entity_id: intervention.id, new_values: { action: intervention.action, status: 'InProgress' } });
      console.log('Seeded 1 intervention case (in progress)');
    }

    const existingVisit = await prisma.monitoringVisit.findFirst({ where: { entity_id: mphatso.id, entity_type: 'beneficiary' } });
    if (!existingVisit) {
      const visit = await prisma.monitoringVisit.create({
        data: {
          entity_type: 'beneficiary',
          entity_id: mphatso.id,
          visit_date: new Date('2026-06-20'),
          findings: 'Guardian reports beneficiary is assisting with farming after school, reducing study time. School confirms irregular attendance.',
          follow_up_actions: 'Discuss chore-sharing arrangement with guardian; recommend after-school study group.',
          conducted_by: recorderId,
        },
      });
      await logAudit({ user_id: recorderId, action: 'create', entity_type: 'MonitoringVisit', entity_id: visit.id, new_values: { entity_type: 'beneficiary', findings: visit.findings } });
      console.log('Seeded 1 monitoring visit (beneficiary)');
    }
  }

  // Resolved at-risk example: Isaac Chirwa — previously flagged, now resolved
  const isaac = beneficiaryMap.get('MW-ISC-007');
  if (isaac) {
    const existingFlag = await prisma.atRiskFlag.findFirst({ where: { beneficiary_id: isaac.id } });
    if (!existingFlag) {
      const flag = await prisma.atRiskFlag.create({
        data: {
          beneficiary_id: isaac.id,
          reason: 'Guardian contact details could not be verified, risking loss of communication for disbursement notices',
          flagged_by: recorderId,
          resolved: true,
          resolved_at: new Date('2026-07-01'),
          resolved_by: recorderId,
        },
      });
      await logAudit({ user_id: recorderId, action: 'resolve_at_risk', entity_type: 'AtRiskFlag', entity_id: flag.id, new_values: { resolved: true } });
      console.log('Seeded 1 at-risk flag (resolved)');
    }
  }

  // Monitoring visit at school level — general compliance check
  const lilongweSchoolId = schoolMap.get('Lilongwe Secondary School');
  if (lilongweSchoolId) {
    const existing = await prisma.monitoringVisit.findFirst({ where: { entity_id: lilongweSchoolId, entity_type: 'school' } });
    if (!existing) {
      const visit = await prisma.monitoringVisit.create({
        data: {
          entity_type: 'school',
          entity_id: lilongweSchoolId,
          visit_date: new Date('2026-05-14'),
          findings: 'General program compliance visit — beneficiary records and boarding facilities in order.',
          follow_up_actions: 'None required.',
          conducted_by: recorderId,
        },
      });
      await logAudit({ user_id: recorderId, action: 'create', entity_type: 'MonitoringVisit', entity_id: visit.id, new_values: { entity_type: 'school' } });
      console.log('Seeded 1 monitoring visit (school)');
    }
  }

  // Outcomes: completion + graduation
  const outcomeRows: { nationalId: string; outcome_type: 'Completion' | 'Graduation' | 'Exit'; date: string; reason: string; programId: string }[] = [];
  const chikondiNkhoma = beneficiaryMap.get('MW-CHN-012');
  const loveness = beneficiaryMap.get('MW-LVP-013');
  const patricia = beneficiaryMap.get('MW-PAZ-008');
  if (chikondiNkhoma) outcomeRows.push({ nationalId: 'MW-CHN-012', outcome_type: 'Completion', date: '2026-12-31', reason: 'Completed academic year successfully', programId: chikondiNkhoma.program_id });
  if (loveness) outcomeRows.push({ nationalId: 'MW-LVP-013', outcome_type: 'Graduation', date: '2026-12-15', reason: 'Graduated from the primary support program', programId: loveness.program_id });
  if (patricia) outcomeRows.push({ nationalId: 'MW-PAZ-008', outcome_type: 'Exit', date: '2026-07-10', reason: 'Withdrawn pending resolution of missing documentation', programId: patricia.program_id });

  let outcomesCreated = 0;
  for (const o of outcomeRows) {
    const beneficiary = beneficiaryMap.get(o.nationalId);
    if (!beneficiary) continue;
    const existing = await prisma.outcome.findFirst({ where: { beneficiary_id: beneficiary.id, outcome_type: o.outcome_type } });
    if (existing) continue;

    const outcome = await prisma.outcome.create({
      data: {
        beneficiary_id: beneficiary.id,
        program_id: o.programId,
        outcome_type: o.outcome_type,
        outcome_date: new Date(o.date),
        reason: o.reason,
        recorded_by: recorderId,
      },
    });
    outcomesCreated++;
    await logAudit({ user_id: recorderId, action: 'record_outcome', entity_type: 'Outcome', entity_id: outcome.id, new_values: { outcome_type: o.outcome_type } });
  }
  console.log(`Seeded ${outcomesCreated} outcomes`);
}

// ──────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────

async function seedNotifications(userMap: Map<string, any>) {
  const superAdmin = userMap.get('superadmin');
  if (!superAdmin) return;

  const templateDefs: { name: string; channel: 'email' | 'in_app'; subject: string; body: string; variables: string[] }[] = [
    { name: 'Submission Confirmation', channel: 'email', subject: 'Your application has been received', body: 'Dear {{guardian_name}}, we confirm receipt of {{beneficiary_name}}\'s application to {{program_name}}.', variables: ['guardian_name', 'beneficiary_name', 'program_name'] },
    { name: 'Decision Notification', channel: 'email', subject: 'Update on your Press Trust application', body: 'Dear {{guardian_name}}, the status of {{beneficiary_name}}\'s application is now {{status}}.', variables: ['guardian_name', 'beneficiary_name', 'status'] },
    { name: 'Missing Documents', channel: 'email', subject: 'Action required: missing documents', body: 'Dear {{guardian_name}}, please resubmit the following document(s) for {{beneficiary_name}}: {{document_list}}.', variables: ['guardian_name', 'beneficiary_name', 'document_list'] },
    { name: 'Renewal Reminder', channel: 'email', subject: 'Your Press Trust award is due for renewal', body: 'Dear {{guardian_name}}, {{beneficiary_name}}\'s award period ends on {{end_date}}. Renewal review is underway.', variables: ['guardian_name', 'beneficiary_name', 'end_date'] },
    { name: 'Payment Processed', channel: 'in_app', subject: 'Payment processed', body: 'A payment of {{amount}} for {{beneficiary_name}} has been processed.', variables: ['amount', 'beneficiary_name'] },
  ];

  const templateMap = new Map<string, any>();
  for (const t of templateDefs) {
    let template = await prisma.notificationTemplate.findFirst({ where: { name: t.name } });
    if (!template) {
      template = await prisma.notificationTemplate.create({
        data: { name: t.name, channel: t.channel, subject: t.subject, body: t.body, variables: t.variables as any, created_by: superAdmin.id },
      });
      console.log(`Seeded notification template: ${template.name}`);
    }
    templateMap.set(t.name, template);
  }

  const triggerDefs: { name: string; event_name: string; template: string }[] = [
    { name: 'Notify on Beneficiary Status Change', event_name: 'beneficiary.status_changed', template: 'Decision Notification' },
    { name: 'Notify on Award Activation', event_name: 'award.activated', template: 'Renewal Reminder' },
    { name: 'Notify on Disbursement Paid', event_name: 'disbursement.paid', template: 'Payment Processed' },
    { name: 'Notify on At-Risk Flag', event_name: 'me.at_risk_flagged', template: 'Missing Documents' },
  ];

  for (const t of triggerDefs) {
    const existing = await prisma.notificationTrigger.findFirst({ where: { name: t.name } });
    if (existing) continue;
    const template = templateMap.get(t.template);
    if (!template) continue;
    const trigger = await prisma.notificationTrigger.create({
      data: { name: t.name, event_name: t.event_name, template_id: template.id, enabled: true, created_by: superAdmin.id },
    });
    console.log(`Seeded notification trigger: ${trigger.name}`);
  }

  const logCount = await prisma.notificationLog.count();
  if (logCount === 0) {
    const decisionTemplate = templateMap.get('Decision Notification');
    const paymentTemplate = templateMap.get('Payment Processed');
    const missingDocsTemplate = templateMap.get('Missing Documents');
    const logs = [
      { recipient: 'esther.banda@example.mw', channel: 'email' as const, template: decisionTemplate, subject: 'Update on your Press Trust application', status: 'sent' },
      { recipient: 'grace.phiri@example.mw', channel: 'email' as const, template: decisionTemplate, subject: 'Update on your Press Trust application', status: 'sent' },
      { recipient: 'lilongwe-secondary@example.mw', channel: 'in_app' as const, template: paymentTemplate, subject: 'Payment processed', status: 'sent' },
      { recipient: 'susan.chirwa@example.mw', channel: 'email' as const, template: missingDocsTemplate, subject: 'Action required: missing documents', status: 'failed', error_message: 'SMTP connection timed out' },
    ];
    for (const l of logs) {
      await prisma.notificationLog.create({
        data: {
          user_id: superAdmin.id,
          recipient: l.recipient,
          channel: l.channel,
          template_id: l.template?.id,
          subject: l.subject,
          status: l.status,
          error_message: (l as any).error_message,
        },
      });
    }
    console.log(`Seeded ${logs.length} notification logs`);
  }

  const inAppCount = await prisma.inAppNotification.count();
  if (inAppCount === 0) {
    const notifDefs = [
      { userKey: 'opsManager', title: 'New beneficiaries imported', body: '16 beneficiaries were imported and are awaiting onboarding review.', read: true },
      { userKey: 'opsMaker', title: 'Onboarding pending your review', body: '3 beneficiaries are pending onboarding validation.', read: false },
      { userKey: 'financeManager', title: 'Disbursement approvals pending', body: 'Several disbursement requests are awaiting your approval.', read: false },
      { userKey: 'financeChecker', title: 'Reconciliation due', body: 'Term 1 disbursements are ready for reconciliation.', read: true },
      { userKey: 'meOfficer', title: 'At-risk beneficiary flagged', body: 'Mphatso Nyirenda has been auto-flagged as at-risk.', read: false },
      { userKey: 'superadmin', title: 'System health check', body: 'Weekly system audit summary is ready for review.', read: true },
    ];
    for (const n of notifDefs) {
      const user = userMap.get(n.userKey);
      if (!user) continue;
      await prisma.inAppNotification.create({ data: { user_id: user.id, title: n.title, body: n.body, read: n.read } });
    }
    console.log(`Seeded ${notifDefs.length} in-app notifications`);
  }
}

// ──────────────────────────────────────────────
// Reporting extras: report definitions, scheduled reports, export logs
// ──────────────────────────────────────────────

async function seedReportingExtras(userMap: Map<string, any>) {
  const financeChecker = userMap.get('financeChecker');
  const meOfficer = userMap.get('meOfficer');
  const auditor = userMap.get('auditorManager');
  if (!financeChecker || !meOfficer || !auditor) return;

  let disbursementReport = await prisma.reportDefinition.findFirst({ where: { name: 'Quarterly Disbursement Summary' } });
  if (!disbursementReport) {
    disbursementReport = await prisma.reportDefinition.create({
      data: {
        name: 'Quarterly Disbursement Summary',
        description: 'Disbursements by category and status for the current academic period',
        source: 'disbursements',
        fields: ['identifier', 'beneficiary', 'amount', 'category', 'status', 'academic_period'],
        filters: { period: '2026-T2' },
        sort_by: 'created_at',
        sort_order: 'desc',
        created_by: financeChecker.id,
      },
    });
    console.log(`Seeded report definition: ${disbursementReport.name}`);
  }

  let outcomesReport = await prisma.reportDefinition.findFirst({ where: { name: 'M&E Outcomes Register' } });
  if (!outcomesReport) {
    outcomesReport = await prisma.reportDefinition.create({
      data: {
        name: 'M&E Outcomes Register',
        description: 'All recorded completion, graduation and exit outcomes',
        source: 'me_outcomes',
        fields: ['identifier', 'beneficiary', 'program', 'outcome_type', 'outcome_date', 'reason'],
        sort_by: 'outcome_date',
        sort_order: 'desc',
        created_by: meOfficer.id,
      },
    });
    console.log(`Seeded report definition: ${outcomesReport.name}`);
  }

  let schedule = await prisma.scheduledReport.findFirst({ where: { name: 'Monthly Disbursement Email' } });
  if (!schedule) {
    schedule = await prisma.scheduledReport.create({
      data: {
        report_id: disbursementReport.id,
        name: 'Monthly Disbursement Email',
        cron_expression: '0 8 1 * *',
        format: 'pdf',
        recipients: ['finance@presstrust.mw', 'superadmin@presstrust.mw'] as any,
        enabled: true,
        last_run_at: new Date('2026-07-01T08:00:00'),
        next_run_at: new Date('2026-08-01T08:00:00'),
        created_by: financeChecker.id,
      },
    });
    console.log(`Seeded scheduled report: ${schedule.name}`);
  }

  const runCount = await prisma.reportRunLog.count({ where: { report_id: disbursementReport.id } });
  if (runCount === 0) {
    await prisma.reportRunLog.create({
      data: {
        schedule_id: schedule.id,
        report_id: disbursementReport.id,
        status: 'success',
        format: 'pdf',
        file_url: '/reports/generated/monthly-disbursement-2026-07.pdf',
        row_count: 18,
        started_at: new Date('2026-07-01T08:00:00'),
        completed_at: new Date('2026-07-01T08:00:12'),
        triggered_by: 'schedule',
      },
    });
    await prisma.reportRunLog.create({
      data: {
        report_id: outcomesReport.id,
        status: 'success',
        format: 'xlsx',
        file_url: '/reports/generated/me-outcomes-2026-07.xlsx',
        row_count: 3,
        started_at: new Date('2026-07-15T10:00:00'),
        completed_at: new Date('2026-07-15T10:00:05'),
        triggered_by: meOfficer.id,
      },
    });
    console.log('Seeded 2 report run logs');
  }

  const exportCount = await prisma.exportLog.count();
  if (exportCount === 0) {
    await prisma.exportLog.create({
      data: { user_id: financeChecker.id, export_type: 'disbursements', format: 'pdf', filters: { program: 'Press Trust Secondary School Scholarship 2026' } as any },
    });
    await prisma.exportLog.create({
      data: { user_id: auditor.id, export_type: 'audit_logs', format: 'csv', filters: { entity_type: 'Disbursement' } as any },
    });
    await prisma.exportLog.create({
      data: { user_id: meOfficer.id, export_type: 'me_outcomes', format: 'xlsx', filters: null as any },
    });
    console.log('Seeded 3 export logs');
  }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
  const password_hash = await bcrypt.hash(PASSWORD, ROUNDS);

  // Roles
  const roleMap: Record<string, string> = {};
  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description, permissions: r.permissions, status: 'active' },
      create: { name: r.name, description: r.description, permissions: r.permissions, status: 'active' },
    });
    roleMap[role.name] = role.id;
  }
  console.log(`Seeded ${ROLES.length} roles`);

  // Users
  const userMap = new Map<string, any>();
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
    userMap.set(u.key, user);
  }
  console.log(`Seeded ${SEED_USERS.length} users`);

  const superAdmin = userMap.get('superadmin');
  const opsMaker = userMap.get('opsMaker');
  const opsChecker = userMap.get('opsChecker');
  const financeMaker = userMap.get('financeMaker');
  const financeChecker = userMap.get('financeChecker');
  const meOfficer = userMap.get('meOfficer');

  // Reference data
  await seedReferenceData('district', DISTRICTS);
  await seedReferenceData('academic_period', ACADEMIC_PERIODS);
  await seedTypedReferenceData();

  // Master data
  const schoolMap = await seedSchools(SCHOOLS);
  await seedSchoolBankAccounts(schoolMap);
  await seedDisbursementItems(DISBURSEMENT_ITEMS);
  const fundingSourceMap = await seedFundingSources();
  const programs = await seedPrograms();

  // Beneficiary lifecycle
  const beneficiaryMap = await seedBeneficiaries(schoolMap, programs, opsMaker.id);
  const documentIdByKey = await seedDocuments(beneficiaryMap, opsMaker.id);
  const awardsByBeneficiary = await seedAwards(beneficiaryMap, programs, fundingSourceMap, opsChecker.id);
  const disbursements = await seedDisbursements(beneficiaryMap, awardsByBeneficiary, programs, financeMaker.id, financeChecker.id);
  await seedReversalAndEvidence(disbursements, documentIdByKey, financeChecker.id, financeMaker.id);

  // M&E
  await seedPerformanceAndMe(beneficiaryMap, schoolMap, meOfficer.id);

  // Notifications
  await seedNotifications(userMap);

  // Reporting extras
  await seedReportingExtras(userMap);

  console.log('\nAll Press Trust seed data seeded successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
