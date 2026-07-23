import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';

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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: School not found
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

  const canViewUnmasked = req.user?.role === 'SuperAdmin' || req.user?.role === 'Finance';
  const maskedAccounts = school.bank_accounts.map((ba: any) => ({
    ...ba,
    account_number: canViewUnmasked ? ba.account_number : maskAccountNumber(ba.account_number),
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: School not found
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: School not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function listBankAccounts(req: Request, res: Response): Promise<void> {
  const schoolId = req.params.schoolId as string;

  const accounts = await prisma.schoolBankAccount.findMany({
    where: { school_id: schoolId },
    orderBy: { created_at: 'desc' },
  });

  const canViewUnmasked = req.user?.role === 'SuperAdmin' || req.user?.role === 'Finance';
  const masked = accounts.map((ba: any) => ({
    ...ba,
    account_number: canViewUnmasked ? ba.account_number : maskAccountNumber(ba.account_number),
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Bank account not found
 */
export async function getBankAccount(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const account = await prisma.schoolBankAccount.findUnique({ where: { id } });
  if (!account) {
    res.status(404).json({ status: 'error', data: null, message: 'Bank account not found' });
    return;
  }

  const canViewUnmasked = req.user?.role === 'SuperAdmin' || req.user?.role === 'Finance';
  const masked = { ...account, account_number: canViewUnmasked ? account.account_number : maskAccountNumber(account.account_number) };

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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Bank account not found
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Bank account not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Bank account not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Bank account not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Funding source not found
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Funding source not found
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Funding source not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement item not found
 *       409:
 *         description: Name already exists
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement item not found
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
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Duplicate code for this type
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Reference data not found
 *       409:
 *         description: Duplicate code for this type
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
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Reference data not found
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
