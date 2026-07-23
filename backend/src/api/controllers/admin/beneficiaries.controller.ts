import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { eventBus } from '../../../shared/events/event-bus';

// ── Zod schemas ──

const createBeneficiarySchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  gender: z.string().min(1),
  district: z.string().min(1),
  school_id: z.string().uuid(),
  program_id: z.string().uuid(),
  date_of_birth: z.string().optional(),
  national_id: z.string().optional(),
  exams_id: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  academic_year: z.string().optional(),
  guardian: z.object({
    name: z.string().min(1),
    relationship: z.string().min(1),
    contact_phone: z.string().min(1),
    contact_email: z.string().email().optional().or(z.literal('')),
  }).optional(),
});

const updateBeneficiarySchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  school_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  date_of_birth: z.string().optional(),
  national_id: z.string().optional(),
  exams_id: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  academic_year: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Imported', 'PendingOnboarding', 'Active', 'Suspended', 'Closed']),
  reason: z.string().optional(),
});

const createGuardianSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  contact_phone: z.string().min(1),
  contact_email: z.string().email().optional().or(z.literal('')),
});

const updateGuardianSchema = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  contact_phone: z.string().min(1).optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
});

// ── Helpers ──

function maskBeneficiary(b: any) {
  return {
    id: b.id,
    beneficiary_identifier: b.beneficiary_identifier,
    first_name: b.first_name,
    last_name: b.last_name,
    date_of_birth: b.date_of_birth,
    gender: b.gender,
    national_id: b.national_id,
    exams_id: b.exams_id,
    contact_email: b.contact_email,
    contact_phone: b.contact_phone,
    district: b.district,
    school: b.school ? { id: b.school.id, name: b.school.name, district: b.school.district } : undefined,
    program: b.program ? { id: b.program.id, name: b.program.name } : undefined,
    status: b.status,
    status_reason: b.status_reason,
    academic_year: b.academic_year,
    guardians: b.guardians || [],
    created_at: b.created_at,
    updated_at: b.updated_at,
  };
}

async function checkDuplicate(nationalId: string | undefined, examsId: string | undefined, programId: string, excludeId?: string) {
  if (nationalId) {
    const existing = await prisma.beneficiary.findFirst({ where: { national_id: nationalId, program_id: programId } });
    if (existing && existing.id !== excludeId) return existing;
  }
  if (examsId) {
    const existing = await prisma.beneficiary.findFirst({ where: { exams_id: examsId, program_id: programId } });
    if (existing && existing.id !== excludeId) return existing;
  }
  return null;
}

// ── List beneficiaries ──

/**
 * @openapi
 * /admin/beneficiaries:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: List beneficiaries with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Imported, PendingOnboarding, Active, Suspended, Closed] }
 *       - in: query
 *         name: school_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of beneficiaries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     beneficiary_identifier: PT-1768470000000-4821
 *                     first_name: Grace
 *                     last_name: Banda
 *                     date_of_birth: 2008-03-14T00:00:00.000Z
 *                     gender: Female
 *                     national_id: BM4501234
 *                     exams_id: EX-2023-88213
 *                     contact_email: grace.banda@presstrust.mw
 *                     contact_phone: "+265991234567"
 *                     district: Zomba
 *                     school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Zomba Girls Secondary School, district: Zomba }
 *                     program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                     status: Active
 *                     status_reason: null
 *                     academic_year: "2026"
 *                     guardians:
 *                       - id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                         name: Thoko Phiri
 *                         relationship: Aunt
 *                         contact_phone: "+265888654321"
 *                         contact_email: thoko.phiri@presstrust.mw
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-20T11:00:00.000Z
 *                   - id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                     beneficiary_identifier: PT-1768470500000-1122
 *                     first_name: Chikondi
 *                     last_name: Mwale
 *                     date_of_birth: 2009-07-02T00:00:00.000Z
 *                     gender: Male
 *                     national_id: BM4509981
 *                     exams_id: EX-2023-91045
 *                     contact_email: ''
 *                     contact_phone: "+265995551234"
 *                     district: Lilongwe
 *                     school: { id: 6a2c8e1b-7d4f-4b3a-9e0c-3f7b2d1a8c56, name: Lilongwe Boys Secondary School, district: Lilongwe }
 *                     program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                     status: Imported
 *                     status_reason: null
 *                     academic_year: "2026"
 *                     guardians: []
 *                     created_at: 2026-01-18T14:05:00.000Z
 *                     updated_at: 2026-01-18T14:05:00.000Z
 *                 meta: { page: 1, limit: 20, total: 47, totalPages: 3 }
 *               message: Beneficiaries retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 */
export async function listBeneficiaries(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const programId = req.query.program_id as string | undefined;
  const status = req.query.status as string | undefined;
  const schoolId = req.query.school_id as string | undefined;
  const district = req.query.district as string | undefined;
  const q = req.query.q as string | undefined;

  const where: Record<string, unknown> = {};
  if (programId) where.program_id = programId;
  if (status) where.status = status;
  if (schoolId) where.school_id = schoolId;
  if (district) where.district = { contains: district, mode: 'insensitive' };
  if (q) {
    where.OR = [
      { first_name: { contains: q, mode: 'insensitive' } },
      { last_name: { contains: q, mode: 'insensitive' } },
      { national_id: { contains: q, mode: 'insensitive' } },
      { exams_id: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [beneficiaries, total] = await Promise.all([
    prisma.beneficiary.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        school: { select: { id: true, name: true, district: true } },
        program: { select: { id: true, name: true } },
        guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
      },
    }),
    prisma.beneficiary.count({ where }),
  ]);

  const data = beneficiaries.map(maskBeneficiary);

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Beneficiaries retrieved successfully',
  });
}

// ── Create beneficiary ──

/**
 * @openapi
 * /admin/beneficiaries:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Create a new beneficiary
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BeneficiaryCreate'
 *     responses:
 *       201:
 *         description: Beneficiary created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 beneficiary_identifier: PT-1768470000000-4821
 *                 first_name: Grace
 *                 last_name: Banda
 *                 date_of_birth: 2008-03-14T00:00:00.000Z
 *                 gender: Female
 *                 national_id: BM4501234
 *                 exams_id: EX-2023-88213
 *                 contact_email: grace.banda@presstrust.mw
 *                 contact_phone: "+265991234567"
 *                 district: Zomba
 *                 school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Zomba Girls Secondary School, district: Zomba }
 *                 program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                 status: Imported
 *                 status_reason: null
 *                 academic_year: "2026"
 *                 guardians:
 *                   - id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                     name: Thoko Phiri
 *                     relationship: Aunt
 *                     contact_phone: "+265888654321"
 *                     contact_email: thoko.phiri@presstrust.mw
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Beneficiary created successfully
 *       400:
 *         description: Invalid date_of_birth format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid date_of_birth format
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: School or program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: School not found
 *       409:
 *         description: Duplicate beneficiary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Duplicate beneficiary found with same national_id or exams_id for this program
 */
export async function createBeneficiary(req: Request, res: Response): Promise<void> {
  const body = createBeneficiarySchema.parse(req.body);

  const school = await prisma.school.findUnique({ where: { id: body.school_id } });
  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: body.program_id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  // Duplicate check
  const duplicate = await checkDuplicate(body.national_id, body.exams_id, body.program_id);
  if (duplicate) {
    res.status(409).json({ status: 'error', data: null, message: 'Duplicate beneficiary found with same national_id or exams_id for this program' });
    return;
  }

  const dob = body.date_of_birth ? new Date(body.date_of_birth) : undefined;
  if (body.date_of_birth && isNaN(dob?.getTime() || 0)) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid date_of_birth format' });
    return;
  }

  const identifier = `PT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  const beneficiary = await prisma.beneficiary.create({
    data: {
      beneficiary_identifier: identifier,
      first_name: body.first_name.trim(),
      last_name: body.last_name.trim(),
      gender: body.gender.trim(),
      district: body.district.trim(),
      school_id: body.school_id,
      program_id: body.program_id,
      date_of_birth: dob,
      national_id: body.national_id ? body.national_id.trim() : undefined,
      exams_id: body.exams_id ? body.exams_id.trim() : undefined,
      contact_email: body.contact_email || undefined,
      contact_phone: body.contact_phone ? body.contact_phone.trim() : undefined,
      academic_year: body.academic_year ? body.academic_year.trim() : undefined,
      status: 'Imported',
    },
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: true,
    },
  });

  // Create guardian if provided
  if (body.guardian) {
    await prisma.guardian.create({
      data: {
        beneficiary_id: beneficiary.id,
        name: body.guardian.name.trim(),
        relationship: body.guardian.relationship.trim(),
        contact_phone: body.guardian.contact_phone.trim(),
        contact_email: body.guardian.contact_email || undefined,
      },
    });
  }

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Beneficiary',
    entity_id: beneficiary.id,
    new_values: body,
  });

  const refreshed = await prisma.beneficiary.findUnique({
    where: { id: beneficiary.id },
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
    },
  });

  eventBus.emit('beneficiary.created', {
    beneficiaryId: refreshed?.id,
    userId: refreshed?.id,
    email: refreshed?.email,
    name: `${refreshed?.first_name} ${refreshed?.last_name}`,
    identifier: refreshed?.beneficiary_identifier,
    programId: refreshed?.program_id,
  });

  res.status(201).json({
    status: 'success',
    data: maskBeneficiary(refreshed),
    message: 'Beneficiary created successfully',
  });
}

// ── Get beneficiary ──

/**
 * @openapi
 * /admin/beneficiaries/{id}:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: Get beneficiary details by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Beneficiary details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 beneficiary_identifier: PT-1768470000000-4821
 *                 first_name: Grace
 *                 last_name: Banda
 *                 date_of_birth: 2008-03-14T00:00:00.000Z
 *                 gender: Female
 *                 national_id: BM4501234
 *                 exams_id: EX-2023-88213
 *                 contact_email: grace.banda@presstrust.mw
 *                 contact_phone: "+265991234567"
 *                 district: Zomba
 *                 school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Zomba Girls Secondary School, district: Zomba }
 *                 program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                 status: Active
 *                 status_reason: null
 *                 academic_year: "2026"
 *                 guardians:
 *                   - id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                     name: Thoko Phiri
 *                     relationship: Aunt
 *                     contact_phone: "+265888654321"
 *                     contact_email: thoko.phiri@presstrust.mw
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-20T11:00:00.000Z
 *               message: Beneficiary retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 */
export async function getBeneficiary(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const beneficiary = await prisma.beneficiary.findUnique({
    where: { id },
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
    },
  });

  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  res.json({
    status: 'success',
    data: maskBeneficiary(beneficiary),
    message: 'Beneficiary retrieved successfully',
  });
}

// ── Update beneficiary ──

/**
 * @openapi
 * /admin/beneficiaries/{id}:
 *   put:
 *     tags: [Beneficiaries]
 *     summary: Update beneficiary details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BeneficiaryUpdate'
 *     responses:
 *       200:
 *         description: Beneficiary updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 beneficiary_identifier: PT-1768470000000-4821
 *                 first_name: Grace
 *                 last_name: Banda
 *                 date_of_birth: 2008-03-14T00:00:00.000Z
 *                 gender: Female
 *                 national_id: BM4501234
 *                 exams_id: EX-2023-88213
 *                 contact_email: grace.banda@presstrust.mw
 *                 contact_phone: "+265991234567"
 *                 district: Blantyre
 *                 school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Blantyre Secondary School, district: Blantyre }
 *                 program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                 status: Active
 *                 status_reason: null
 *                 academic_year: "2026"
 *                 guardians:
 *                   - id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                     name: Thoko Phiri
 *                     relationship: Aunt
 *                     contact_phone: "+265888654321"
 *                     contact_email: thoko.phiri@presstrust.mw
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-21T08:15:00.000Z
 *               message: Beneficiary updated successfully
 *       400:
 *         description: Invalid date_of_birth format
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid date_of_birth format
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary, school, or program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 *       409:
 *         description: Duplicate beneficiary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Duplicate beneficiary found with same national_id or exams_id for this program
 */
export async function updateBeneficiary(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateBeneficiarySchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (body.school_id) {
    const school = await prisma.school.findUnique({ where: { id: body.school_id } });
    if (!school) {
      res.status(404).json({ status: 'error', data: null, message: 'School not found' });
      return;
    }
  }

  if (body.program_id) {
    const program = await prisma.program.findUnique({ where: { id: body.program_id } });
    if (!program) {
      res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
      return;
    }
  }

  // Duplicate check if national_id or exams_id changed
  if (body.national_id || body.exams_id) {
    const duplicate = await checkDuplicate(
      body.national_id || beneficiary.national_id || undefined,
      body.exams_id || beneficiary.exams_id || undefined,
      body.program_id || beneficiary.program_id,
      id
    );
    if (duplicate) {
      res.status(409).json({ status: 'error', data: null, message: 'Duplicate beneficiary found with same national_id or exams_id for this program' });
      return;
    }
  }

  const dob = body.date_of_birth ? new Date(body.date_of_birth) : undefined;
  if (body.date_of_birth && isNaN(dob?.getTime() || 0)) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid date_of_birth format' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.first_name) updateData.first_name = body.first_name.trim();
  if (body.last_name) updateData.last_name = body.last_name.trim();
  if (body.gender) updateData.gender = body.gender.trim();
  if (body.district) updateData.district = body.district.trim();
  if (body.school_id) updateData.school_id = body.school_id;
  if (body.program_id) updateData.program_id = body.program_id;
  if (body.date_of_birth !== undefined) updateData.date_of_birth = dob;
  if (body.national_id !== undefined) updateData.national_id = body.national_id ? body.national_id.trim() : null;
  if (body.exams_id !== undefined) updateData.exams_id = body.exams_id ? body.exams_id.trim() : null;
  if (body.contact_email !== undefined) updateData.contact_email = body.contact_email || null;
  if (body.contact_phone !== undefined) updateData.contact_phone = body.contact_phone ? body.contact_phone.trim() : null;
  if (body.academic_year !== undefined) updateData.academic_year = body.academic_year ? body.academic_year.trim() : null;

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: updateData,
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: {
      first_name: beneficiary.first_name,
      last_name: beneficiary.last_name,
      gender: beneficiary.gender,
      district: beneficiary.district,
      school_id: beneficiary.school_id,
      program_id: beneficiary.program_id,
      national_id: beneficiary.national_id,
      exams_id: beneficiary.exams_id,
      contact_email: beneficiary.contact_email,
      contact_phone: beneficiary.contact_phone,
      academic_year: beneficiary.academic_year,
    },
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: maskBeneficiary(updated),
    message: 'Beneficiary updated successfully',
  });
}

// ── Update status ──

/**
 * @openapi
 * /admin/beneficiaries/{id}/status:
 *   patch:
 *     tags: [Beneficiaries]
 *     summary: Update beneficiary status (suspension/closure requires reason)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BeneficiaryStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 beneficiary_identifier: PT-1768470000000-4821
 *                 first_name: Grace
 *                 last_name: Banda
 *                 date_of_birth: 2008-03-14T00:00:00.000Z
 *                 gender: Female
 *                 national_id: BM4501234
 *                 exams_id: EX-2023-88213
 *                 contact_email: grace.banda@presstrust.mw
 *                 contact_phone: "+265991234567"
 *                 district: Zomba
 *                 school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Zomba Girls Secondary School, district: Zomba }
 *                 program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                 status: Suspended
 *                 status_reason: Failed to submit required academic report
 *                 academic_year: "2026"
 *                 guardians: []
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-22T10:00:00.000Z
 *               message: Beneficiary status updated to Suspended
 *       400:
 *         description: Reason is required for Suspended or Closed status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Reason is required for Suspended or Closed status
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 *       409:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid status transition from Active to Imported
 */
export async function updateBeneficiaryStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, reason } = updateStatusSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  // Mandatory reason for suspension/closure
  if ((status === 'Suspended' || status === 'Closed') && !reason) {
    res.status(400).json({ status: 'error', data: null, message: 'Reason is required for Suspended or Closed status' });
    return;
  }

  const validTransitions: Record<string, string[]> = {
    Imported: ['PendingOnboarding', 'Suspended', 'Closed'],
    PendingOnboarding: ['Active', 'Suspended', 'Closed'],
    Active: ['Suspended', 'Closed'],
    Suspended: ['Active', 'Closed'],
    Closed: ['Suspended'],
  };

  if (!validTransitions[beneficiary.status].includes(status)) {
    res.status(409).json({ status: 'error', data: null, message: `Invalid status transition from ${beneficiary.status} to ${status}` });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status, status_reason: reason || null },
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status, status_reason: beneficiary.status_reason },
    new_values: { status, status_reason: reason || null },
  });

  eventBus.emit('beneficiary.status_changed', {
    beneficiaryId: id,
    userId: req.user?.userId,
    name: `${(beneficiary as any).first_name} ${(beneficiary as any).last_name}`,
    oldStatus: beneficiary.status,
    newStatus: status,
  });

  res.json({
    status: 'success',
    data: maskBeneficiary(updated),
    message: `Beneficiary status updated to ${status}`,
  });
}

// ── Reinstate ──

/**
 * @openapi
 * /admin/beneficiaries/{id}/reinstate:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Reinstate a beneficiary to Active status
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Beneficiary reinstated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 beneficiary_identifier: PT-1768470000000-4821
 *                 first_name: Grace
 *                 last_name: Banda
 *                 date_of_birth: 2008-03-14T00:00:00.000Z
 *                 gender: Female
 *                 national_id: BM4501234
 *                 exams_id: EX-2023-88213
 *                 contact_email: grace.banda@presstrust.mw
 *                 contact_phone: "+265991234567"
 *                 district: Zomba
 *                 school: { id: 5b1b9e0a-6c3d-4a2e-9f8b-2d6a1e7c4f30, name: Zomba Girls Secondary School, district: Zomba }
 *                 program: { id: 9d3e2f1a-4b5c-6d7e-8f9a-0b1c2d3e4f5a, name: Press Trust Scholarship Program }
 *                 status: Active
 *                 status_reason: null
 *                 academic_year: "2026"
 *                 guardians: []
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-23T13:45:00.000Z
 *               message: Beneficiary reinstated to Active
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 *       409:
 *         description: Beneficiary is already Active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary is already Active
 */
export async function reinstateBeneficiary(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (beneficiary.status === 'Active') {
    res.status(409).json({ status: 'error', data: null, message: 'Beneficiary is already Active' });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status: 'Active', status_reason: null },
    include: {
      school: { select: { id: true, name: true, district: true } },
      program: { select: { id: true, name: true } },
      guardians: { select: { id: true, name: true, relationship: true, contact_phone: true, contact_email: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reinstate',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status, status_reason: beneficiary.status_reason },
    new_values: { status: 'Active', status_reason: null },
  });

  eventBus.emit('beneficiary.status_changed', {
    beneficiaryId: id,
    userId: req.user?.userId,
    name: `${(beneficiary as any).first_name} ${(beneficiary as any).last_name}`,
    oldStatus: beneficiary.status,
    newStatus: 'Active',
  });

  res.json({
    status: 'success',
    data: maskBeneficiary(updated),
    message: 'Beneficiary reinstated to Active',
  });
}

// ── Guardian sub-resource ──

/**
 * @openapi
 * /admin/beneficiaries/{id}/guardians:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: List guardians for a beneficiary
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of guardians
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 - id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                   beneficiary_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Thoko Phiri
 *                   relationship: Aunt
 *                   contact_phone: "+265888654321"
 *                   contact_email: thoko.phiri@presstrust.mw
 *                   consent_provided: true
 *                   created_at: 2026-01-15T09:35:00.000Z
 *                   updated_at: 2026-01-15T09:35:00.000Z
 *               message: Guardians retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 */
export async function listGuardians(req: Request, res: Response): Promise<void> {
  const beneficiaryId = req.params.id as string;

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: beneficiaryId } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const guardians = await prisma.guardian.findMany({
    where: { beneficiary_id: beneficiaryId },
    orderBy: { created_at: 'desc' },
  });

  res.json({
    status: 'success',
    data: guardians,
    message: 'Guardians retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/beneficiaries/{id}/guardians:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Add a guardian to a beneficiary
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GuardianCreate'
 *     responses:
 *       201:
 *         description: Guardian created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                 beneficiary_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Thoko Phiri
 *                 relationship: Aunt
 *                 contact_phone: "+265888654321"
 *                 contact_email: thoko.phiri@presstrust.mw
 *                 consent_provided: false
 *                 created_at: 2026-01-23T13:45:00.000Z
 *                 updated_at: 2026-01-23T13:45:00.000Z
 *               message: Guardian created successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 details:
 *                   - field: contact_phone
 *                     message: String must contain at least 1 character(s)
 *               message: Request validation failed
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Beneficiary not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Beneficiary not found
 */
export async function createGuardian(req: Request, res: Response): Promise<void> {
  const beneficiaryId = req.params.id as string;
  const body = createGuardianSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: beneficiaryId } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const guardian = await prisma.guardian.create({
    data: {
      beneficiary_id: beneficiaryId,
      name: body.name.trim(),
      relationship: body.relationship.trim(),
      contact_phone: body.contact_phone.trim(),
      contact_email: body.contact_email || undefined,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Guardian',
    entity_id: guardian.id,
    new_values: { beneficiary_id: beneficiaryId, ...body },
  });

  res.status(201).json({
    status: 'success',
    data: guardian,
    message: 'Guardian created successfully',
  });
}

/**
 * @openapi
 * /admin/beneficiaries/{id}/guardians/{guardianId}:
 *   put:
 *     tags: [Beneficiaries]
 *     summary: Update a guardian
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: guardianId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GuardianUpdate'
 *     responses:
 *       200:
 *         description: Guardian updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                 beneficiary_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Thoko Phiri
 *                 relationship: Grandmother
 *                 contact_phone: "+265888654321"
 *                 contact_email: thoko.phiri@presstrust.mw
 *                 consent_provided: false
 *                 created_at: 2026-01-23T13:45:00.000Z
 *                 updated_at: 2026-01-24T09:10:00.000Z
 *               message: Guardian updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 details:
 *                   - field: contact_email
 *                     message: Invalid email
 *               message: Request validation failed
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Guardian not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Guardian not found
 */
export async function updateGuardian(req: Request, res: Response): Promise<void> {
  const beneficiaryId = req.params.id as string;
  const guardianId = req.params.guardianId as string;
  const body = updateGuardianSchema.parse(req.body);

  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, beneficiary_id: beneficiaryId },
  });
  if (!guardian) {
    res.status(404).json({ status: 'error', data: null, message: 'Guardian not found' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.name) updateData.name = body.name.trim();
  if (body.relationship) updateData.relationship = body.relationship.trim();
  if (body.contact_phone) updateData.contact_phone = body.contact_phone.trim();
  if (body.contact_email !== undefined) updateData.contact_email = body.contact_email || null;

  const updated = await prisma.guardian.update({
    where: { id: guardianId },
    data: updateData,
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Guardian',
    entity_id: guardianId,
    old_values: { name: guardian.name, relationship: guardian.relationship, contact_phone: guardian.contact_phone, contact_email: guardian.contact_email },
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: updated,
    message: 'Guardian updated successfully',
  });
}

/**
 * @openapi
 * /admin/beneficiaries/{id}/guardians/{guardianId}:
 *   delete:
 *     tags: [Beneficiaries]
 *     summary: Delete a guardian
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: guardianId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Guardian deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1a2b3c4d-5e6f-7890-abcd-ef1234567890
 *                 deleted: true
 *               message: Guardian deleted successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Guardian not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Guardian not found
 */
export async function deleteGuardian(req: Request, res: Response): Promise<void> {
  const beneficiaryId = req.params.id as string;
  const guardianId = req.params.guardianId as string;

  const guardian = await prisma.guardian.findFirst({
    where: { id: guardianId, beneficiary_id: beneficiaryId },
  });
  if (!guardian) {
    res.status(404).json({ status: 'error', data: null, message: 'Guardian not found' });
    return;
  }

  await prisma.guardian.delete({ where: { id: guardianId } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'Guardian',
    entity_id: guardianId,
    old_values: { name: guardian.name, relationship: guardian.relationship },
  });

  res.json({
    status: 'success',
    data: { id: guardianId, deleted: true },
    message: 'Guardian deleted successfully',
  });
}
