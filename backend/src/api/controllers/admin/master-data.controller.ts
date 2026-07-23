import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { roleHasPermission } from '../../../modules/roles/permissions';

// ── Schools ──

const createSchoolSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('secondary'),
  district: z.string().min(1),
  location: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  registration_status: z.string().optional(),
});

const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  district: z.string().min(1).optional(),
  location: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  registration_status: z.string().optional(),
});

const updateSchoolStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

// ── Bank Accounts ──

const createBankAccountSchema = z.object({
  bank_name: z.string().min(1),
  branch: z.string().optional(),
  account_number: z.string().min(1),
  account_holder_name: z.string().min(1),
});

const updateBankAccountSchema = z.object({
  bank_name: z.string().min(1).optional(),
  branch: z.string().optional(),
  account_number: z.string().min(1).optional(),
  account_holder_name: z.string().min(1).optional(),
});

// ── Funding Sources ──

const createFundingSourceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  total_allocation: z.number().min(0).optional(),
});

const updateFundingSourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  total_allocation: z.number().min(0).optional(),
});

const updateFundingSourceStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

// ── Disbursement Items ──

const createDisbursementItemSchema = z.object({
  name: z.string().min(1),
});

const updateDisbursementItemSchema = z.object({
  name: z.string().min(1).optional(),
});

const updateDisbursementItemStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

// ── Reference Data ──

const createReferenceDataSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

const updateReferenceDataSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

const updateReferenceDataStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

function maskAccountNumber(num: string | null): string {
  if (!num || num.length <= 4) return '****';
  return '****' + num.slice(-4);
}

async function canUnmaskBankAccounts(userId: string | undefined, roleName: string | undefined): Promise<boolean> {
  if (!userId) return false;
  // SuperAdmin / Finance remain permitted by role; also honour bank_accounts:unmask on Role.permissions
  if (roleName === 'SuperAdmin' || roleName === 'Finance') return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { select: { permissions: true } } },
  });
  return roleHasPermission(user?.role?.permissions, 'bank_accounts', 'unmask');
}

// ── Schools Controller ──

/**
 * @openapi
 * /admin/schools:
 *   get:
 *     tags: [Master Data]
 *     summary: List schools with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of schools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     name: Blantyre Secondary School
 *                     type: secondary
 *                     district: Blantyre
 *                     location: Blantyre City
 *                     contact_phone: "+265991234567"
 *                     contact_email: info@blantyresec.edu.mw
 *                     registration_status: registered
 *                     status: active
 *                     created_at: "2026-01-15T09:30:00.000Z"
 *                     updated_at: "2026-01-15T09:30:00.000Z"
 *                   - id: 6fa459ea-ee8a-3ca4-894e-db77e160355e
 *                     name: Zomba Urban Secondary School
 *                     type: secondary
 *                     district: Zomba
 *                     location: Zomba City
 *                     contact_phone: "+265991234568"
 *                     contact_email: info@zombausec.edu.mw
 *                     registration_status: registered
 *                     status: active
 *                     created_at: "2026-01-10T08:00:00.000Z"
 *                     updated_at: "2026-01-10T08:00:00.000Z"
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 2
 *                   totalPages: 1
 *               message: Schools retrieved successfully
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
export async function listSchools(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const district = req.query.district as string | undefined;
  const type = req.query.type as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (district) where.district = { contains: district, mode: 'insensitive' };
  if (type) where.type = type;
  if (status) where.status = status;

  const [schools, total] = await Promise.all([
    prisma.school.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
    prisma.school.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items: schools, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Schools retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/schools:
 *   post:
 *     tags: [Master Data]
 *     summary: Create a new school
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SchoolCreate'
 *     responses:
 *       201:
 *         description: School created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Blantyre Secondary School
 *                 type: secondary
 *                 district: Blantyre
 *                 location: Blantyre City
 *                 contact_phone: "+265991234567"
 *                 contact_email: info@blantyresec.edu.mw
 *                 registration_status: registered
 *                 status: active
 *                 created_at: "2026-01-15T09:30:00.000Z"
 *                 updated_at: "2026-01-15T09:30:00.000Z"
 *               message: School created successfully
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
 *                   - field: district
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
 */
export async function createSchool(req: Request, res: Response): Promise<void> {
  const body = createSchoolSchema.parse(req.body);

  const school = await prisma.school.create({
    data: { ...body, status: 'active' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'School',
    entity_id: school.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: school, message: 'School created successfully' });
}

/**
 * @openapi
 * /admin/schools/{id}:
 *   get:
 *     tags: [Master Data]
 *     summary: Get school details with bank accounts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: School details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Blantyre Secondary School
 *                 type: secondary
 *                 district: Blantyre
 *                 location: Blantyre City
 *                 contact_phone: "+265991234567"
 *                 contact_email: info@blantyresec.edu.mw
 *                 registration_status: registered
 *                 status: active
 *                 created_at: "2026-01-15T09:30:00.000Z"
 *                 updated_at: "2026-01-15T09:30:00.000Z"
 *                 bank_accounts:
 *                   - id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                     school_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     bank_name: National Bank of Malawi
 *                     branch: Blantyre Branch
 *                     account_number: "****7890"
 *                     account_holder_name: Blantyre Secondary School
 *                     status: active
 *                     approval_status: approved
 *                     created_at: "2026-01-15T09:35:00.000Z"
 *                     updated_at: "2026-01-15T09:35:00.000Z"
 *               message: School retrieved successfully
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
 *         description: School not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: School not found
 */
export async function getSchool(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const school = await prisma.school.findUnique({
    where: { id },
    include: { bank_accounts: true },
  });

  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const maskedAccounts = school.bank_accounts.map((ba: any) => ({
    ...ba,
    account_number: maskAccountNumber(ba.account_number),
  }));

  res.json({
    status: 'success',
    data: { ...school, bank_accounts: maskedAccounts },
    message: 'School retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/schools/{id}:
 *   put:
 *     tags: [Master Data]
 *     summary: Update school details
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
 *             $ref: '#/components/schemas/SchoolUpdate'
 *     responses:
 *       200:
 *         description: School updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Blantyre Secondary School
 *                 type: secondary
 *                 district: Blantyre
 *                 location: Blantyre City (Ndirande)
 *                 contact_phone: "+265991234567"
 *                 contact_email: info@blantyresec.edu.mw
 *                 registration_status: registered
 *                 status: active
 *                 created_at: "2026-01-15T09:30:00.000Z"
 *                 updated_at: "2026-07-20T11:12:00.000Z"
 *               message: School updated successfully
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
 *         description: School not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: School not found
 */
export async function updateSchool(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateSchoolSchema.parse(req.body);

  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const updated = await prisma.school.update({ where: { id }, data: body });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'School',
    entity_id: id,
    old_values: school,
    new_values: body,
  });

  res.json({ status: 'success', data: updated, message: 'School updated successfully' });
}

/**
 * @openapi
 * /admin/schools/{id}/status:
 *   patch:
 *     tags: [Master Data]
 *     summary: Activate or deactivate a school
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
 *             $ref: '#/components/schemas/SchoolStatusUpdate'
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
 *                 status: inactive
 *               message: School status updated to inactive
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
 *                   - field: status
 *                     message: Invalid enum value. Expected 'active' | 'inactive', received 'closed'
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
 *         description: School not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: School not found
 */
export async function updateSchoolStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status } = updateSchoolStatusSchema.parse(req.body);

  const school = await prisma.school.findUnique({ where: { id } });
  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const updated = await prisma.school.update({ where: { id }, data: { status } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'School',
    entity_id: id,
    old_values: { status: school.status },
    new_values: { status },
  });

  res.json({ status: 'success', data: { id: updated.id, status: updated.status }, message: `School status updated to ${status}` });
}

// ── Bank Accounts Controller ──

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts:
 *   get:
 *     tags: [Master Data]
 *     summary: List bank accounts for a school (masked)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: List of bank accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                     school_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     bank_name: National Bank of Malawi
 *                     branch: Blantyre Branch
 *                     account_number: "****7890"
 *                     account_holder_name: Blantyre Secondary School
 *                     status: active
 *                     approval_status: approved
 *                     created_at: "2026-01-15T09:35:00.000Z"
 *                     updated_at: "2026-01-15T09:35:00.000Z"
 *               message: Bank accounts retrieved successfully
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
export async function listBankAccounts(req: Request, res: Response): Promise<void> {
  const schoolId = req.params.schoolId as string;

  const accounts = await prisma.schoolBankAccount.findMany({
    where: { school_id: schoolId },
    orderBy: { created_at: 'desc' },
  });

  // Always mask by default — only POST .../reveal returns the full number
  const masked = accounts.map((ba: any) => ({
    ...ba,
    account_number: maskAccountNumber(ba.account_number),
  }));

  res.json({ status: 'success', data: { items: masked }, message: 'Bank accounts retrieved successfully' });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts:
 *   post:
 *     tags: [Master Data]
 *     summary: Create a bank account for a school
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BankAccountCreate'
 *     responses:
 *       201:
 *         description: Bank account created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 school_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 bank_name: National Bank of Malawi
 *                 branch: Blantyre Branch
 *                 account_number: "1234567890"
 *                 account_holder_name: Blantyre Secondary School
 *                 status: active
 *                 approval_status: approved
 *                 created_at: "2026-01-15T09:35:00.000Z"
 *                 updated_at: "2026-01-15T09:35:00.000Z"
 *               message: Bank account created successfully
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
 *                   - field: account_number
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
 *         description: School not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: School not found
 */
export async function createBankAccount(req: Request, res: Response): Promise<void> {
  const schoolId = req.params.schoolId as string;
  const body = createBankAccountSchema.parse(req.body);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const account = await prisma.schoolBankAccount.create({
    data: { school_id: schoolId, ...body, status: 'active', approval_status: 'approved' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'SchoolBankAccount',
    entity_id: account.id,
    new_values: { school_id: schoolId, ...body },
  });

  res.status(201).json({ status: 'success', data: account, message: 'Bank account created successfully' });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}:
 *   get:
 *     tags: [Master Data]
 *     summary: Get bank account details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Bank account details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 school_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 bank_name: National Bank of Malawi
 *                 branch: Blantyre Branch
 *                 account_number: "****7890"
 *                 account_holder_name: Blantyre Secondary School
 *                 status: active
 *                 approval_status: approved
 *                 created_at: "2026-01-15T09:35:00.000Z"
 *                 updated_at: "2026-01-15T09:35:00.000Z"
 *               message: Bank account retrieved successfully
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
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function getBankAccount(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  // Always mask by default — only POST .../reveal returns the full number
  const masked = { ...account, account_number: maskAccountNumber(account.account_number) };

  res.json({ status: 'success', data: masked, message: 'Bank account retrieved successfully' });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}:
 *   put:
 *     tags: [Master Data]
 *     summary: Update bank account (triggers approval if active)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BankAccountUpdate'
 *     responses:
 *       200:
 *         description: Bank account updated or pending approval
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 school_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 bank_name: National Bank of Malawi
 *                 branch: Blantyre Branch
 *                 account_number: "9876543210"
 *                 account_holder_name: Blantyre Secondary School
 *                 status: active
 *                 approval_status: pending
 *                 created_at: "2026-01-15T09:35:00.000Z"
 *                 updated_at: "2026-07-20T13:05:00.000Z"
 *               message: Bank account updated and pending approval
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
 *                   - field: account_holder_name
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
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function updateBankAccount(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateBankAccountSchema.parse(req.body);

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  // If currently approved, change triggers pending approval (maker-checker)
  const needsApproval = account.approval_status === 'approved';
  const updateData: any = { ...body };
  if (needsApproval) {
    updateData.approval_status = 'pending';
  }

  const updated = await prisma.schoolBankAccount.update({ where: { id }, data: updateData });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'SchoolBankAccount',
    entity_id: id,
    old_values: account,
    new_values: body,
  });

  const message = needsApproval
    ? 'Bank account updated and pending approval'
    : 'Bank account updated successfully';

  res.json({ status: 'success', data: updated, message });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}/status:
 *   patch:
 *     tags: [Master Data]
 *     summary: Activate or deactivate a bank account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BankAccountStatusUpdate'
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
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 status: inactive
 *               message: Bank account status updated to inactive
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
 *                   - field: status
 *                     message: Invalid enum value. Expected 'active' | 'inactive', received 'closed'
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
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function updateBankAccountStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status } = z.object({ status: z.enum(['active', 'inactive']) }).parse(req.body);

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  const updated = await prisma.schoolBankAccount.update({ where: { id }, data: { status } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'SchoolBankAccount',
    entity_id: id,
    old_values: { status: account.status },
    new_values: { status },
  });

  res.json({ status: 'success', data: { id: updated.id, status: updated.status }, message: `Bank account status updated to ${status}` });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}/approve:
 *   post:
 *     tags: [Master Data]
 *     summary: Approve bank account changes (checker)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Bank account approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 approval_status: approved
 *               message: Bank account approved successfully
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
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function approveBankAccount(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  const updated = await prisma.schoolBankAccount.update({ where: { id }, data: { approval_status: 'approved' } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'approve',
    entity_type: 'SchoolBankAccount',
    entity_id: id,
    old_values: { approval_status: account.approval_status },
    new_values: { approval_status: 'approved' },
  });

  res.json({ status: 'success', data: { id: updated.id, approval_status: updated.approval_status }, message: 'Bank account approved successfully' });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}/reject:
 *   post:
 *     tags: [Master Data]
 *     summary: Reject bank account changes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string }
 *     responses:
 *       200:
 *         description: Bank account rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 approval_status: rejected
 *               message: Bank account rejected
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
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function rejectBankAccount(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  const updated = await prisma.schoolBankAccount.update({ where: { id }, data: { approval_status: 'rejected' } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reject',
    entity_type: 'SchoolBankAccount',
    entity_id: id,
    old_values: { approval_status: account.approval_status },
    new_values: { approval_status: 'rejected', reason: req.body?.reason },
  });

  res.json({ status: 'success', data: { id: updated.id, approval_status: updated.approval_status }, message: 'Bank account rejected' });
}

/**
 * @openapi
 * /admin/schools/{schoolId}/bank-accounts/{id}/reveal:
 *   post:
 *     tags: [Master Data]
 *     summary: Reveal a full bank account number (audited; requires unmask permission)
 *     description: |
 *       List and detail endpoints always return a masked account number.
 *       Call this endpoint to obtain the real number. Access is granted to
 *       SuperAdmin / Finance roles, or any role whose permissions include
 *       `bank_accounts: ["unmask"]`. Every successful reveal is written to the audit log.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: schoolId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Full account number revealed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d
 *                 account_number: "1234567890123"
 *                 revealed_by:
 *                   id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Ruth Nkhoma
 *                 revealed_at: 2026-07-23T10:10:00.000Z
 *               message: Bank account number revealed
 *       403:
 *         description: Caller is not permitted to unmask
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: You do not have permission to view unmasked bank account numbers.
 *       404:
 *         description: Bank account not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Bank account not found
 */
export async function revealBankAccount(req: Request, res: Response): Promise<void> {
  const schoolId = req.params.schoolId as string;
  const id = req.params.id as string;

  const permitted = await canUnmaskBankAccounts(req.user?.userId, req.user?.role);
  if (!permitted) {
    res.status(403).json({
      status: 'error',
      data: null,
      message: 'You do not have permission to view unmasked bank account numbers.',
    });
    return;
  }

  const account = await prisma.schoolBankAccount.findFirst({ where: { id, school_id: schoolId } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  const revealedAt = new Date();
  const user = await prisma.user.findUnique({
    where: { id: req.user!.userId },
    select: { id: true, name: true },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reveal',
    entity_type: 'SchoolBankAccount',
    entity_id: id,
    new_values: { school_id: schoolId, revealed_at: revealedAt.toISOString() },
  });

  res.json({
    status: 'success',
    data: {
      id: account.id,
      account_number: account.account_number,
      revealed_by: user ? { id: user.id, name: user.name } : { id: req.user!.userId, name: null },
      revealed_at: revealedAt,
    },
    message: 'Bank account number revealed',
  });
}

// ── Funding Sources Controller ──

/**
 * @openapi
 * /admin/funding-sources:
 *   get:
 *     tags: [Master Data]
 *     summary: List funding sources
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of funding sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
 *                     name: USAID Education Grant 2026
 *                     description: Funding for secondary school scholarships in the Southern Region
 *                     total_allocation: 50000000
 *                     utilized_amount: 12500000
 *                     status: active
 *                     created_at: "2026-01-05T08:00:00.000Z"
 *                     updated_at: "2026-06-01T10:00:00.000Z"
 *                   - id: 16fd2706-8baf-433b-82eb-8c7fada847da
 *                     name: Press Trust Endowment Fund
 *                     description: Internal endowment supporting long-term scholarships
 *                     total_allocation: 20000000
 *                     utilized_amount: 4300000
 *                     status: active
 *                     created_at: "2026-02-01T08:00:00.000Z"
 *                     updated_at: "2026-05-15T10:00:00.000Z"
 *               message: Funding sources retrieved successfully
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
export async function listFundingSources(_req: Request, res: Response): Promise<void> {
  const sources = await prisma.fundingSource.findMany({ orderBy: { created_at: 'desc' } });
  res.json({ status: 'success', data: { items: sources }, message: 'Funding sources retrieved successfully' });
}

/**
 * @openapi
 * /admin/funding-sources:
 *   post:
 *     tags: [Master Data]
 *     summary: Create a funding source
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FundingSourceCreate'
 *     responses:
 *       201:
 *         description: Funding source created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 name: USAID Education Grant 2026
 *                 description: Funding for secondary school scholarships in the Southern Region
 *                 total_allocation: 50000000
 *                 utilized_amount: 0
 *                 status: active
 *                 created_at: "2026-01-05T08:00:00.000Z"
 *                 updated_at: "2026-01-05T08:00:00.000Z"
 *               message: Funding source created successfully
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
 *                   - field: name
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
 */
export async function createFundingSource(req: Request, res: Response): Promise<void> {
  const body = createFundingSourceSchema.parse(req.body);
  const source = await prisma.fundingSource.create({
    data: { ...body, status: 'active', utilized_amount: 0 },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'FundingSource',
    entity_id: source.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: source, message: 'Funding source created successfully' });
}

/**
 * @openapi
 * /admin/funding-sources/{id}:
 *   get:
 *     tags: [Master Data]
 *     summary: Get funding source details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Funding source details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 name: USAID Education Grant 2026
 *                 description: Funding for secondary school scholarships in the Southern Region
 *                 total_allocation: 50000000
 *                 utilized_amount: 12500000
 *                 status: active
 *                 created_at: "2026-01-05T08:00:00.000Z"
 *                 updated_at: "2026-06-01T10:00:00.000Z"
 *               message: Funding source retrieved successfully
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
 *         description: Funding source not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Funding source not found
 */
export async function getFundingSource(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const source = await prisma.fundingSource.findUnique({ where: { id } });
  if (!source) {
    res.status(404).json({ status: 'error', data: null, message: 'Funding source not found' });
    return;
  }
  res.json({ status: 'success', data: source, message: 'Funding source retrieved successfully' });
}

/**
 * @openapi
 * /admin/funding-sources/{id}:
 *   put:
 *     tags: [Master Data]
 *     summary: Update funding source
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
 *             $ref: '#/components/schemas/FundingSourceUpdate'
 *     responses:
 *       200:
 *         description: Funding source updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 name: USAID Education Grant 2026 (Extension)
 *                 description: Funding for secondary school scholarships in the Southern Region
 *                 total_allocation: 60000000
 *                 utilized_amount: 12500000
 *                 status: active
 *                 created_at: "2026-01-05T08:00:00.000Z"
 *                 updated_at: "2026-07-20T13:20:00.000Z"
 *               message: Funding source updated successfully
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
 *                   - field: total_allocation
 *                     message: Number must be greater than or equal to 0
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
 *         description: Funding source not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Funding source not found
 */
export async function updateFundingSource(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateFundingSourceSchema.parse(req.body);

  const source = await prisma.fundingSource.findUnique({ where: { id } });
  if (!source) {
    res.status(404).json({ status: 'error', data: null, message: 'Funding source not found' });
    return;
  }

  const updated = await prisma.fundingSource.update({ where: { id }, data: body });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'FundingSource',
    entity_id: id,
    old_values: source,
    new_values: body,
  });

  res.json({ status: 'success', data: updated, message: 'Funding source updated successfully' });
}

/**
 * @openapi
 * /admin/funding-sources/{id}/status:
 *   patch:
 *     tags: [Master Data]
 *     summary: Activate or deactivate a funding source
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
 *             $ref: '#/components/schemas/FundingSourceStatusUpdate'
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
 *                 id: 7c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 status: inactive
 *               message: Funding source status updated to inactive
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
 *                   - field: status
 *                     message: Invalid enum value. Expected 'active' | 'inactive', received 'closed'
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
 *         description: Funding source not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Funding source not found
 */
export async function updateFundingSourceStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status } = updateFundingSourceStatusSchema.parse(req.body);

  const source = await prisma.fundingSource.findUnique({ where: { id } });
  if (!source) {
    res.status(404).json({ status: 'error', data: null, message: 'Funding source not found' });
    return;
  }

  const updated = await prisma.fundingSource.update({ where: { id }, data: { status } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'FundingSource',
    entity_id: id,
    old_values: { status: source.status },
    new_values: { status },
  });

  res.json({ status: 'success', data: { id: updated.id, status: updated.status }, message: `Funding source status updated to ${status}` });
}

// ── Disbursement Items Controller ──

/**
 * @openapi
 * /admin/disbursement-items:
 *   get:
 *     tags: [Master Data]
 *     summary: List disbursement item catalog
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of disbursement items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 1
 *                     name: Tuition Fees
 *                     status: active
 *                   - id: 2
 *                     name: Boarding Fees
 *                     status: active
 *               message: Disbursement items retrieved successfully
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
export async function listDisbursementItems(_req: Request, res: Response): Promise<void> {
  const items = await prisma.disbursementItem.findMany({ orderBy: { id: 'asc' } });
  res.json({ status: 'success', data: { items }, message: 'Disbursement items retrieved successfully' });
}

/**
 * @openapi
 * /admin/disbursement-items:
 *   post:
 *     tags: [Master Data]
 *     summary: Create a disbursement item
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementItemCreate'
 *     responses:
 *       201:
 *         description: Disbursement item created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3
 *                 name: Examination Fees
 *                 status: active
 *               message: Disbursement item created successfully
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
 *                   - field: name
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
 *       409:
 *         description: Disbursement item name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Disbursement item name already exists
 */
export async function createDisbursementItem(req: Request, res: Response): Promise<void> {
  const body = createDisbursementItemSchema.parse(req.body);

  try {
    const item = await prisma.disbursementItem.create({
      data: { name: body.name, status: 'active' },
    });

    await logAudit({
      user_id: req.user?.userId,
      action: 'create',
      entity_type: 'DisbursementItem',
      entity_id: String(item.id),
      new_values: body,
    });

    res.status(201).json({ status: 'success', data: item, message: 'Disbursement item created successfully' });
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ status: 'error', data: null, message: 'Disbursement item name already exists' });
      return;
    }
    throw e;
  }
}

/**
 * @openapi
 * /admin/disbursement-items/{id}:
 *   put:
 *     tags: [Master Data]
 *     summary: Update a disbursement item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementItemUpdate'
 *     responses:
 *       200:
 *         description: Disbursement item updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1
 *                 name: Tuition and Boarding Fees
 *                 status: active
 *               message: Disbursement item updated successfully
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
 *                   - field: name
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
 *         description: Disbursement item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Disbursement item not found
 *       409:
 *         description: Name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Disbursement item name already exists
 */
export async function updateDisbursementItem(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string, 10);
  const body = updateDisbursementItemSchema.parse(req.body);

  const item = await prisma.disbursementItem.findUnique({ where: { id } });
  if (!item) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement item not found' });
    return;
  }

  try {
    const updated = await prisma.disbursementItem.update({ where: { id }, data: body });

    await logAudit({
      user_id: req.user?.userId,
      action: 'update',
      entity_type: 'DisbursementItem',
      entity_id: String(id),
      old_values: item,
      new_values: body,
    });

    res.json({ status: 'success', data: updated, message: 'Disbursement item updated successfully' });
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ status: 'error', data: null, message: 'Disbursement item name already exists' });
      return;
    }
    throw e;
  }
}

/**
 * @openapi
 * /admin/disbursement-items/{id}/status:
 *   patch:
 *     tags: [Master Data]
 *     summary: Activate or deactivate a disbursement item
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementItemStatusUpdate'
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
 *                 id: 1
 *                 status: inactive
 *               message: Disbursement item status updated to inactive
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
 *                   - field: status
 *                     message: Invalid enum value. Expected 'active' | 'inactive', received 'closed'
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
 *         description: Disbursement item not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Disbursement item not found
 */
export async function updateDisbursementItemStatus(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string, 10);
  const { status } = updateDisbursementItemStatusSchema.parse(req.body);

  const item = await prisma.disbursementItem.findUnique({ where: { id } });
  if (!item) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement item not found' });
    return;
  }

  const updated = await prisma.disbursementItem.update({ where: { id }, data: { status } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'DisbursementItem',
    entity_id: String(id),
    old_values: { status: item.status },
    new_values: { status },
  });

  res.json({ status: 'success', data: { id: updated.id, status: updated.status }, message: `Disbursement item status updated to ${status}` });
}

// ── Reference Data Controller ──

/**
 * @openapi
 * /admin/reference-data/{type}:
 *   get:
 *     tags: [Master Data]
 *     summary: List reference data entries by type
 *     description: |
 *       Supported `type` values seeded by default:
 *       `district`, `academic_period`, `school_type`, `relationship`,
 *       `document_type`, `disbursement_category`, `program_type`.
 *       `academic_period` values (e.g. `2026-T1`) are the recommended source for
 *       dropdowns; disbursement/performance `academic_period` fields remain free-text
 *       for flexibility but should typically match these codes.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of reference data entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 5
 *                     type: district
 *                     code: BT
 *                     name: Blantyre
 *                     status: active
 *                   - id: 6
 *                     type: district
 *                     code: ZA
 *                     name: Zomba
 *                     status: active
 *               message: Reference data retrieved successfully
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
export async function listReferenceData(req: Request, res: Response): Promise<void> {
  const type = req.params.type as string;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = { type };
  if (status) where.status = status;

  const items = await prisma.referenceData.findMany({ where, orderBy: { code: 'asc' } });
  res.json({ status: 'success', data: { items }, message: 'Reference data retrieved successfully' });
}

/**
 * @openapi
 * /admin/reference-data/{type}:
 *   post:
 *     tags: [Master Data]
 *     summary: Create a reference data entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReferenceDataCreate'
 *     responses:
 *       201:
 *         description: Reference data created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 7
 *                 type: district
 *                 code: MZ
 *                 name: Mzuzu
 *                 status: active
 *               message: Reference data created successfully
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
 *                   - field: code
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
 *       409:
 *         description: Duplicate code for this type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Code already exists for this type
 */
export async function createReferenceData(req: Request, res: Response): Promise<void> {
  const type = req.params.type as string;
  const body = createReferenceDataSchema.parse(req.body);

  try {
    const item = await prisma.referenceData.create({
      data: { type, code: body.code, name: body.name, status: 'active' },
    });

    await logAudit({
      user_id: req.user?.userId,
      action: 'create',
      entity_type: 'ReferenceData',
      entity_id: String(item.id),
      new_values: { type, ...body },
    });

    res.status(201).json({ status: 'success', data: item, message: 'Reference data created successfully' });
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ status: 'error', data: null, message: 'Code already exists for this type' });
      return;
    }
    throw e;
  }
}

/**
 * @openapi
 * /admin/reference-data/{type}/{id}:
 *   put:
 *     tags: [Master Data]
 *     summary: Update a reference data entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReferenceDataUpdate'
 *     responses:
 *       200:
 *         description: Reference data updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 5
 *                 type: district
 *                 code: BT
 *                 name: Blantyre City
 *                 status: active
 *               message: Reference data updated successfully
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
 *                   - field: name
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
 *         description: Reference data not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Reference data not found
 *       409:
 *         description: Duplicate code for this type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Code already exists for this type
 */
export async function updateReferenceData(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string, 10);
  const body = updateReferenceDataSchema.parse(req.body);

  const item = await prisma.referenceData.findUnique({ where: { id } });
  if (!item) {
    res.status(404).json({ status: 'error', data: null, message: 'Reference data not found' });
    return;
  }

  try {
    const updated = await prisma.referenceData.update({ where: { id }, data: body });

    await logAudit({
      user_id: req.user?.userId,
      action: 'update',
      entity_type: 'ReferenceData',
      entity_id: String(id),
      old_values: item,
      new_values: body,
    });

    res.json({ status: 'success', data: updated, message: 'Reference data updated successfully' });
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ status: 'error', data: null, message: 'Code already exists for this type' });
      return;
    }
    throw e;
  }
}

/**
 * @openapi
 * /admin/reference-data/{type}/{id}/status:
 *   patch:
 *     tags: [Master Data]
 *     summary: Activate or deactivate a reference data entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReferenceDataStatusUpdate'
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
 *                 id: 5
 *                 status: inactive
 *               message: Reference data status updated to inactive
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
 *                   - field: status
 *                     message: Invalid enum value. Expected 'active' | 'inactive', received 'closed'
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
 *         description: Reference data not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Reference data not found
 */
export async function updateReferenceDataStatus(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id as string, 10);
  const { status } = updateReferenceDataStatusSchema.parse(req.body);

  const item = await prisma.referenceData.findUnique({ where: { id } });
  if (!item) {
    res.status(404).json({ status: 'error', data: null, message: 'Reference data not found' });
    return;
  }

  const updated = await prisma.referenceData.update({ where: { id }, data: { status } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'ReferenceData',
    entity_id: String(id),
    old_values: { status: item.status },
    new_values: { status },
  });

  res.json({ status: 'success', data: { id: updated.id, status: updated.status }, message: `Reference data status updated to ${status}` });
}
