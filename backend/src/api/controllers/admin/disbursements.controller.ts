import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { eventBus } from '../../../shared/events/event-bus';

// ── Zod schemas ──

const createDisbursementSchema = z.object({
  award_id: z.string().uuid(),
  amount: z.number().min(0.01),
  category: z.string().min(1),
  academic_period: z.string().min(1),
  payee_type: z.enum(['school', 'guardian', 'vendor']),
  payee_id: z.string().uuid().optional(),
  payee_name: z.string().min(1),
  payee_bank_account: z.string().min(1).optional(),
});

const updateDisbursementSchema = z.object({
  amount: z.number().min(0.01).optional(),
  category: z.string().min(1).optional(),
  academic_period: z.string().min(1).optional(),
  payee_type: z.enum(['school', 'guardian', 'vendor']).optional(),
  payee_id: z.string().uuid().optional().or(z.literal('')),
  payee_name: z.string().min(1).optional(),
  payee_bank_account: z.string().min(1).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

const evidenceSchema = z.object({
  document_id: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Requested', 'Approved', 'Paid', 'Failed', 'Reconciled']),
  failure_reason: z.string().optional(),
});

// ── Helpers ──

function maskDisbursement(d: any) {
  return {
    id: d.id,
    award_id: d.award_id,
    award: d.award ? {
      id: d.award.id,
      amount: toDecimal(d.award.amount),
      balance_remaining: toDecimal(d.award.balance_remaining),
      status: d.award.status,
    } : undefined,
    beneficiary_id: d.beneficiary_id,
    beneficiary: d.beneficiary ? {
      id: d.beneficiary.id,
      first_name: d.beneficiary.first_name,
      last_name: d.beneficiary.last_name,
      beneficiary_identifier: d.beneficiary.beneficiary_identifier,
    } : undefined,
    program_id: d.program_id,
    program: d.program ? { id: d.program.id, name: d.program.name } : undefined,
    amount: toDecimal(d.amount),
    category: d.category,
    academic_period: d.academic_period,
    payee_type: d.payee_type,
    payee_id: d.payee_id,
    payee_name: d.payee_name,
    payee_bank_account: d.payee_bank_account,
    status: d.status,
    failure_reason: d.failure_reason,
    created_by: d.maker ? { id: d.maker.id, name: d.maker.name } : undefined,
    approved_by: d.checker ? { id: d.checker.id, name: d.checker.name } : undefined,
    approved_at: d.approved_at,
    paid_at: d.paid_at,
    reconciled_at: d.reconciled_at,
    reconciled_by: d.reconciler ? { id: d.reconciler.id, name: d.reconciler.name } : undefined,
    evidence_count: d.evidence ? d.evidence.length : 0,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

function toDecimal(val: number | string | any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val);
  if (val && typeof val.toString === 'function') return parseFloat(val.toString());
  return 0;
}

function getValidTransitions(current: string): string[] {
  const transitions: Record<string, string[]> = {
    Requested: ['Approved', 'Failed'],
    Approved: ['Paid', 'Failed'],
    Paid: ['Reconciled', 'Failed'],
    Failed: ['Requested'],
    Reconciled: [],
  };
  return transitions[current] || [];
}

async function validateDisbursementCreation(awardId: string, amount: number, category: string, period: string, beneficiaryId: string, programId: string): Promise<{ ok: boolean; message?: string }> {
  const award = await prisma.award.findUnique({
    where: { id: awardId },
    include: { beneficiary: { select: { status: true } }, program: true },
  });

  if (!award) return { ok: false, message: 'Award not found' };

  if ((award as any).beneficiary.status !== 'Active') {
    return { ok: false, message: 'Beneficiary must be Active to receive disbursements' };
  }

  if (award.status !== 'Active') {
    return { ok: false, message: `Award must be Active. Current status: ${award.status}` };
  }

  const balance = toDecimal(award.balance_remaining);
  if (amount > balance) {
    return { ok: false, message: `Amount exceeds award balance remaining. Available: ${balance}` };
  }

  // Duplicate check
  const duplicate = await prisma.disbursement.findFirst({
    where: {
      beneficiary_id: beneficiaryId,
      category,
      academic_period: period,
      status: { in: ['Requested', 'Approved', 'Paid', 'Reconciled'] },
    },
  });

  if (duplicate) {
    return { ok: false, message: 'Duplicate disbursement exists for this beneficiary, category, and academic period' };
  }

  return { ok: true };
}

// ── List disbursements ──

/**
 * @openapi
 * /admin/disbursements:
 *   get:
 *     tags: [Disbursements]
 *     summary: List disbursements with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Requested, Approved, Paid, Failed, Reconciled] }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: academic_period
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of disbursements
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function listDisbursements(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const status = req.query.status as string | undefined;
  const programId = req.query.program_id as string | undefined;
  const beneficiaryId = req.query.beneficiary_id as string | undefined;
  const academicPeriod = req.query.academic_period as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (programId) where.program_id = programId;
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;
  if (academicPeriod) where.academic_period = academicPeriod;

  const [disbursements, total] = await Promise.all([
    prisma.disbursement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        program: { select: { id: true, name: true } },
        maker: { select: { id: true, name: true } },
        checker: { select: { id: true, name: true } },
        reconciler: { select: { id: true, name: true } },
        evidence: { select: { id: true, document_id: true } },
      },
    }),
    prisma.disbursement.count({ where }),
  ]);

  const data = (disbursements as any[]).map(maskDisbursement);

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Disbursements retrieved successfully',
  });
}

// ── Create single disbursement ──

/**
 * @openapi
 * /admin/disbursements:
 *   post:
 *     tags: [Disbursements]
 *     summary: Create a disbursement request
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementCreate'
 *     responses:
 *       201:
 *         description: Disbursement created
 *       400:
 *         description: Validation error or constraint violation
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 *       409:
 *         description: Duplicate or insufficient balance
 */
export async function createDisbursement(req: Request, res: Response): Promise<void> {
  const body = createDisbursementSchema.parse(req.body);

  const award = await prisma.award.findUnique({
    where: { id: body.award_id },
    include: { beneficiary: true, program: true },
  });

  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  const a = award as any;

  const validation = await validateDisbursementCreation(
    body.award_id,
    body.amount,
    body.category,
    body.academic_period,
    a.beneficiary_id,
    a.program_id
  );

  if (!validation.ok) {
    res.status(409).json({ status: 'error', data: null, message: validation.message });
    return;
  }

  const disbursement = await prisma.disbursement.create({
    data: {
      award_id: body.award_id,
      beneficiary_id: a.beneficiary_id,
      program_id: a.program_id,
      amount: body.amount,
      category: body.category,
      academic_period: body.academic_period,
      payee_type: body.payee_type,
      payee_id: body.payee_id || null,
      payee_name: body.payee_name,
      payee_bank_account: body.payee_bank_account || null,
      status: 'Requested',
      created_by: req.user!.userId,
    },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Disbursement',
    entity_id: disbursement.id,
    new_values: body,
  });

  res.status(201).json({
    status: 'success',
    data: maskDisbursement(disbursement),
    message: 'Disbursement request created successfully',
  });
}

// ── Batch create ──

const batchDisbursementSchema = z.object({
  items: z.array(createDisbursementSchema).min(1).max(50),
});

/**
 * @openapi
 * /admin/disbursements/batch:
 *   post:
 *     tags: [Disbursements]
 *     summary: Batch create disbursement requests
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DisbursementBatchCreate'
 *     responses:
 *       201:
 *         description: Batch results with successes and errors
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function batchCreateDisbursements(req: Request, res: Response): Promise<void> {
  const { items } = batchDisbursementSchema.parse(req.body);

  const created: any[] = [];
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const award = await prisma.award.findUnique({
      where: { id: item.award_id },
      include: { beneficiary: true, program: true },
    });

    if (!award) {
      errors.push({ index: i, message: 'Award not found' });
      continue;
    }

    const a = award as any;
    const validation = await validateDisbursementCreation(
      item.award_id,
      item.amount,
      item.category,
      item.academic_period,
      a.beneficiary_id,
      a.program_id
    );

    if (!validation.ok) {
      errors.push({ index: i, message: validation.message! });
      continue;
    }

    try {
      const disbursement = await prisma.disbursement.create({
        data: {
          award_id: item.award_id,
          beneficiary_id: a.beneficiary_id,
          program_id: a.program_id,
          amount: item.amount,
          category: item.category,
          academic_period: item.academic_period,
          payee_type: item.payee_type,
          payee_id: item.payee_id || null,
          payee_name: item.payee_name,
          payee_bank_account: item.payee_bank_account || null,
          status: 'Requested',
          created_by: req.user!.userId,
        },
        include: {
          award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
          beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
          program: { select: { id: true, name: true } },
          maker: { select: { id: true, name: true } },
          evidence: true,
        },
      });
      created.push(maskDisbursement(disbursement));
    } catch (e: any) {
      errors.push({ index: i, message: e.message || 'Database error' });
    }
  }

  await logAudit({
    user_id: req.user?.userId,
    action: 'batch_create',
    entity_type: 'Disbursement',
    entity_id: 'batch',
    new_values: { total: items.length, created: created.length, errors: errors.length },
  });

  res.status(201).json({
    status: 'success',
    data: { created, errors: errors.length > 0 ? errors : undefined },
    message: `Batch completed: ${created.length} created, ${errors.length} errors`,
  });
}

// ── Get disbursement ──

/**
 * @openapi
 * /admin/disbursements/{id}:
 *   get:
 *     tags: [Disbursements]
 *     summary: Get disbursement details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Disbursement details
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 */
export async function getDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: { include: { uploader: { select: { id: true, name: true } } } },
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  const d = disbursement as any;
  res.json({
    status: 'success',
    data: {
      ...maskDisbursement(d),
      evidence: d.evidence?.map((e: any) => ({
        id: e.id,
        document_id: e.document_id,
        uploader: e.uploader,
        created_at: e.created_at,
      })),
    },
    message: 'Disbursement retrieved successfully',
  });
}

// ── Update disbursement ──

/**
 * @openapi
 * /admin/disbursements/{id}:
 *   put:
 *     tags: [Disbursements]
 *     summary: Update disbursement details (only when Requested)
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
 *             $ref: '#/components/schemas/DisbursementUpdate'
 *     responses:
 *       200:
 *         description: Disbursement updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Disbursement is not in Requested status
 */
export async function updateDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateDisbursementSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({ where: { id } });
  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (disbursement.status === 'Reconciled') {
    res.status(409).json({ status: 'error', data: null, message: 'Reconciled disbursements are immutable and cannot be updated' });
    return;
  }

  if (disbursement.status !== 'Requested') {
    res.status(409).json({ status: 'error', data: null, message: 'Only Requested disbursements can be updated' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.amount !== undefined) updateData.amount = body.amount;
  if (body.category !== undefined) updateData.category = body.category;
  if (body.academic_period !== undefined) updateData.academic_period = body.academic_period;
  if (body.payee_type !== undefined) updateData.payee_type = body.payee_type;
  if (body.payee_id !== undefined) updateData.payee_id = body.payee_id || null;
  if (body.payee_name !== undefined) updateData.payee_name = body.payee_name;
  if (body.payee_bank_account !== undefined) updateData.payee_bank_account = body.payee_bank_account || null;

  const updated = await prisma.disbursement.update({
    where: { id },
    data: updateData,
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Disbursement',
    entity_id: id,
    old_values: {
      amount: toDecimal(disbursement.amount),
      category: disbursement.category,
      academic_period: disbursement.academic_period,
      payee_type: disbursement.payee_type,
      payee_name: disbursement.payee_name,
    },
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: maskDisbursement(updated),
    message: 'Disbursement updated successfully',
  });
}

// ── Approve ──

/**
 * @openapi
 * /admin/disbursements/{id}/approve:
 *   post:
 *     tags: [Disbursements]
 *     summary: Approve a disbursement request (maker-checker)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Disbursement approved
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Self-approval blocked or insufficient permissions
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Disbursement is not in Requested status
 */
export async function approveDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (disbursement.status === 'Reconciled') {
    res.status(409).json({ status: 'error', data: null, message: 'Reconciled disbursements are immutable' });
    return;
  }

  if (disbursement.status !== 'Requested') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot approve disbursement in status ${disbursement.status}` });
    return;
  }

  // Self-approval block
  if (disbursement.created_by === req.user!.userId) {
    res.status(403).json({ status: 'error', data: null, message: 'Self-approval is not permitted' });
    return;
  }

  const updated = await prisma.disbursement.update({
    where: { id },
    data: { status: 'Approved', approved_by: req.user!.userId, approved_at: new Date() },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'approve',
    entity_type: 'Disbursement',
    entity_id: id,
    old_values: { status: disbursement.status, approved_by: disbursement.approved_by },
    new_values: { status: 'Approved', approved_by: req.user!.userId },
  });

  eventBus.emit('disbursement.approved', {
    disbursementId: id,
    userId: req.user?.userId,
    beneficiaryId: (disbursement as any).beneficiary_id,
    amount: (disbursement as any).amount,
    awardId: (disbursement as any).award_id,
  });

  res.json({
    status: 'success',
    data: maskDisbursement(updated),
    message: 'Disbursement approved successfully',
  });
}

// ── Reject ──

/**
 * @openapi
 * /admin/disbursements/{id}/reject:
 *   post:
 *     tags: [Disbursements]
 *     summary: Reject a disbursement request
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
 *             $ref: '#/components/schemas/DisbursementReject'
 *     responses:
 *       200:
 *         description: Disbursement rejected
 *       400:
 *         description: Reason is required
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Self-rejection blocked or insufficient permissions
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Invalid status for rejection
 */
export async function rejectDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { reason } = rejectSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (disbursement.status === 'Reconciled') {
    res.status(409).json({ status: 'error', data: null, message: 'Reconciled disbursements are immutable' });
    return;
  }

  if (disbursement.status !== 'Requested') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot reject disbursement in status ${disbursement.status}` });
    return;
  }

  // Self-rejection block
  if (disbursement.created_by === req.user!.userId) {
    res.status(403).json({ status: 'error', data: null, message: 'Self-rejection is not permitted' });
    return;
  }

  const updated = await prisma.disbursement.update({
    where: { id },
    data: { status: 'Failed', failure_reason: reason },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reject',
    entity_type: 'Disbursement',
    entity_id: id,
    old_values: { status: disbursement.status },
    new_values: { status: 'Failed', failure_reason: reason },
  });

  res.json({
    status: 'success',
    data: maskDisbursement(updated),
    message: 'Disbursement rejected successfully',
  });
}

// ── Link evidence ──

/**
 * @openapi
 * /admin/disbursements/{id}/evidence:
 *   post:
 *     tags: [Disbursements]
 *     summary: Link a document as evidence for a disbursement
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
 *             $ref: '#/components/schemas/DisbursementEvidenceLink'
 *     responses:
 *       201:
 *         description: Evidence linked
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement or document not found
 */
export async function linkEvidence(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { document_id } = evidenceSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({ where: { id } });
  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (disbursement.status === 'Reconciled') {
    res.status(409).json({ status: 'error', data: null, message: 'Reconciled disbursements are immutable. Evidence cannot be linked.' });
    return;
  }

  const document = await prisma.document.findUnique({ where: { id: document_id } });
  if (!document) {
    res.status(404).json({ status: 'error', data: null, message: 'Document not found' });
    return;
  }

  const evidence = await prisma.disbursementEvidence.create({
    data: {
      disbursement_id: id,
      document_id,
      uploaded_by: req.user!.userId,
    },
    include: {
      uploader: { select: { id: true, name: true } },
      disbursement: { select: { id: true, status: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'link_evidence',
    entity_type: 'Disbursement',
    entity_id: id,
    new_values: { document_id, evidence_id: evidence.id },
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: evidence.id,
      disbursement_id: evidence.disbursement_id,
      document_id: evidence.document_id,
      uploader: evidence.uploader,
      created_at: evidence.created_at,
    },
    message: 'Evidence linked successfully',
  });
}

// ── Update status ──

/**
 * @openapi
 * /admin/disbursements/{id}/status:
 *   patch:
 *     tags: [Disbursements]
 *     summary: Update disbursement status (state machine enforced)
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
 *             $ref: '#/components/schemas/DisbursementStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error or evidence required
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Invalid status transition
 *       422:
 *         description: Invalid status value
 */
export async function updateDisbursementStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, failure_reason } = updateStatusSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  const currentStatus = disbursement.status;

  if (!getValidTransitions(currentStatus).includes(status)) {
    res.status(422).json({ status: 'error', data: null, message: `Invalid status transition from ${currentStatus} to ${status}` });
    return;
  }

  // Evidence required before Paid
  if (status === 'Paid' && disbursement.evidence.length === 0) {
    res.status(400).json({ status: 'error', data: null, message: 'Payment evidence is required before marking as Paid' });
    return;
  }

  const updateData: Record<string, unknown> = { status };
  if (status === 'Paid') {
    updateData.paid_at = new Date();
    // Deduct from award balance on payment
    await prisma.award.update({
      where: { id: disbursement.award_id },
      data: { balance_remaining: { decrement: toDecimal(disbursement.amount) } },
    });
  }
  if (status === 'Reconciled') {
    updateData.reconciled_at = new Date();
    updateData.reconciled_by = req.user!.userId;
  }
  if (status === 'Failed' && failure_reason) {
    updateData.failure_reason = failure_reason;
  }

  const updated = await prisma.disbursement.update({
    where: { id },
    data: updateData,
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Disbursement',
    entity_id: id,
    old_values: { status: currentStatus },
    new_values: updateData,
  });

  if (status === 'Paid') {
    eventBus.emit('disbursement.paid', {
      disbursementId: id,
      userId: req.user?.userId,
      beneficiaryId: (disbursement as any).beneficiary_id,
      beneficiaryName: `${(disbursement as any).beneficiary?.first_name || ''} ${(disbursement as any).beneficiary?.last_name || ''}`.trim(),
      amount: (disbursement as any).amount,
      awardId: (disbursement as any).award_id,
      period: (disbursement as any).academic_period,
    });
  } else if (status === 'Failed') {
    eventBus.emit('disbursement.failed', {
      disbursementId: id,
      userId: req.user?.userId,
      beneficiaryId: (disbursement as any).beneficiary_id,
      amount: (disbursement as any).amount,
      failureReason: failure_reason || '',
    });
  }

  res.json({
    status: 'success',
    data: maskDisbursement(updated),
    message: `Disbursement status updated to ${status}`,
  });
}

// ── Reconcile ──

const reconcileSchema = z.object({
  notes: z.string().optional(),
});

/**
 * @openapi
 * /admin/disbursements/{id}/reconcile:
 *   post:
 *     tags: [Disbursements]
 *     summary: Reconcile a paid disbursement (locks record)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Disbursement reconciled
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Disbursement is not in Paid status
 */
export async function reconcileDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (disbursement.status !== 'Paid') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot reconcile disbursement in status ${disbursement.status}. Must be Paid.` });
    return;
  }

  const updated = await prisma.disbursement.update({
    where: { id },
    data: { status: 'Reconciled', reconciled_by: req.user!.userId, reconciled_at: new Date() },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reconcile',
    entity_type: 'Disbursement',
    entity_id: id,
    old_values: { status: disbursement.status },
    new_values: { status: 'Reconciled', reconciled_by: req.user!.userId },
  });

  eventBus.emit('disbursement.reconciled', {
    disbursementId: id,
    userId: req.user?.userId,
    beneficiaryId: (disbursement as any).beneficiary_id,
    amount: (disbursement as any).amount,
    awardId: (disbursement as any).award_id,
  });

  res.json({
    status: 'success',
    data: maskDisbursement(updated),
    message: 'Disbursement reconciled successfully. Record is now immutable.',
  });
}

// ── Reverse ──

const reverseSchema = z.object({
  amount: z.number().min(0.01).optional(),
  reason: z.string().min(1),
});

/**
 * @openapi
 * /admin/disbursements/{id}/reverse:
 *   post:
 *     tags: [Disbursements]
 *     summary: Reverse a disbursement (creates Reversal record, restores award balance)
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
 *             $ref: '#/components/schemas/DisbursementReverse'
 *     responses:
 *       200:
 *         description: Disbursement reversed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Disbursement is not eligible for reversal
 */
export async function reverseDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { amount, reason } = reverseSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (!['Paid', 'Reconciled'].includes(disbursement.status)) {
    res.status(409).json({ status: 'error', data: null, message: `Cannot reverse disbursement in status ${disbursement.status}. Must be Paid or Reconciled.` });
    return;
  }

  const d = disbursement as any;
  const reversalAmount = amount || toDecimal(d.amount);

  // Create reversal record
  const reversal = await prisma.reversal.create({
    data: {
      disbursement_id: id,
      type: 'reverse',
      amount: reversalAmount,
      reason,
      created_by: req.user!.userId,
    },
  });

  // Restore award balance
  await prisma.award.update({
    where: { id: d.award_id },
    data: { balance_remaining: { increment: reversalAmount } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reverse',
    entity_type: 'Disbursement',
    entity_id: id,
    new_values: { reversal_id: reversal.id, amount: reversalAmount, reason, type: 'reverse' },
  });

  res.json({
    status: 'success',
    data: {
      disbursement: maskDisbursement(d),
      reversal: { id: reversal.id, amount: reversalAmount, reason, type: 'reverse' },
    },
    message: `Disbursement reversed. MWK ${reversalAmount} restored to award balance.`,
  });
}

// ── Return ──

const returnSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1),
});

/**
 * @openapi
 * /admin/disbursements/{id}/return:
 *   post:
 *     tags: [Disbursements]
 *     summary: Record returned funds for a disbursement (creates Reversal record, restores award balance)
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
 *             $ref: '#/components/schemas/DisbursementReturn'
 *     responses:
 *       200:
 *         description: Returned funds recorded
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Disbursement not found
 *       409:
 *         description: Disbursement is not eligible for return
 */
export async function returnDisbursement(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { amount, reason } = returnSchema.parse(req.body);

  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    include: {
      award: { select: { id: true, amount: true, balance_remaining: true, status: true } },
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      maker: { select: { id: true, name: true } },
      checker: { select: { id: true, name: true } },
      reconciler: { select: { id: true, name: true } },
      evidence: true,
    },
  });

  if (!disbursement) {
    res.status(404).json({ status: 'error', data: null, message: 'Disbursement not found' });
    return;
  }

  if (!['Paid', 'Reconciled'].includes(disbursement.status)) {
    res.status(409).json({ status: 'error', data: null, message: `Cannot record return for disbursement in status ${disbursement.status}. Must be Paid or Reconciled.` });
    return;
  }

  const d = disbursement as any;

  // Create reversal record
  const reversal = await prisma.reversal.create({
    data: {
      disbursement_id: id,
      type: 'return',
      amount,
      reason,
      created_by: req.user!.userId,
    },
  });

  // Restore award balance
  await prisma.award.update({
    where: { id: d.award_id },
    data: { balance_remaining: { increment: amount } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'return',
    entity_type: 'Disbursement',
    entity_id: id,
    new_values: { reversal_id: reversal.id, amount, reason, type: 'return' },
  });

  res.json({
    status: 'success',
    data: {
      disbursement: maskDisbursement(d),
      reversal: { id: reversal.id, amount, reason, type: 'return' },
    },
    message: `Returned funds recorded. MWK ${amount} restored to award balance.`,
  });
}
