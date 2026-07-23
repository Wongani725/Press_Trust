import { Request, Response } from 'express';
import { z } from 'zod';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { eventBus } from '../../../shared/events/event-bus';

// ── Zod schemas ──

const createAwardSchema = z.object({
  beneficiary_id: z.string().uuid(),
  program_id: z.string().uuid(),
  funding_source_id: z.string().uuid().optional(),
  amount: z.number().min(0),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']),
});

const updateAwardSchema = z.object({
  amount: z.number().min(0).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']).optional(),
  funding_source_id: z.string().uuid().optional().or(z.literal('')),
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Active', 'Suspended', 'Completed', 'Closed']),
  reason: z.string().optional(),
});

// ── Helpers ──

function maskAward(a: any) {
  return {
    id: a.id,
    beneficiary_id: a.beneficiary_id,
    beneficiary: a.beneficiary ? {
      id: a.beneficiary.id,
      first_name: a.beneficiary.first_name,
      last_name: a.beneficiary.last_name,
      beneficiary_identifier: a.beneficiary.beneficiary_identifier,
    } : undefined,
    program_id: a.program_id,
    program: a.program ? { id: a.program.id, name: a.program.name } : undefined,
    funding_source_id: a.funding_source_id,
    funding_source: a.funding_source ? { id: a.funding_source.id, name: a.funding_source.name } : undefined,
    amount: a.amount ? parseFloat(a.amount.toString()) : 0,
    balance_remaining: a.balance_remaining ? parseFloat(a.balance_remaining.toString()) : 0,
    start_date: a.start_date,
    end_date: a.end_date,
    award_type: a.award_type,
    status: a.status,
    status_reason: a.status_reason,
    parent_award_id: a.parent_award_id,
    budget_utilization_updated: a.budget_utilization_updated,
    created_at: a.created_at,
    updated_at: a.updated_at,
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
    Draft: ['Active', 'Closed'],
    Active: ['Suspended', 'Completed', 'Closed'],
    Suspended: ['Active', 'Closed'],
    Completed: ['Closed'],
    Closed: [],
  };
  return transitions[current] || [];
}

async function checkBudgetConstraints(programId: string, amount: number, fundingSourceId?: string | null): Promise<{ ok: boolean; message?: string }> {
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program) return { ok: false, message: 'Program not found' };

  const ceiling = toDecimal(program.budget_ceiling);
  const utilized = toDecimal(program.budget_utilized);
  if (amount > ceiling - utilized) {
    return { ok: false, message: `Amount exceeds available program budget. Available: ${ceiling - utilized}` };
  }

  if (fundingSourceId) {
    const fs = await prisma.fundingSource.findUnique({ where: { id: fundingSourceId } });
    if (!fs) return { ok: false, message: 'Funding source not found' };
    const total = toDecimal(fs.total_allocation);
    const used = toDecimal(fs.utilized_amount);
    if (amount > total - used) {
      return { ok: false, message: `Amount exceeds available funding source allocation. Available: ${total - used}` };
    }
  }

  return { ok: true };
}

// ── List awards ──

/**
 * @openapi
 * /admin/awards:
 *   get:
 *     tags: [Awards]
 *     summary: List awards with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Draft, Active, Suspended, Completed, Closed] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of awards
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function listAwards(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const programId = req.query.program_id as string | undefined;
  const beneficiaryId = req.query.beneficiary_id as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (programId) where.program_id = programId;
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;
  if (status) where.status = status;

  const [awards, total] = await Promise.all([
    prisma.award.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        program: { select: { id: true, name: true } },
        funding_source: { select: { id: true, name: true } },
      },
    }),
    prisma.award.count({ where }),
  ]);

  const data = (awards as any[]).map(maskAward);

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Awards retrieved successfully',
  });
}

// ── Create award ──

/**
 * @openapi
 * /admin/awards:
 *   post:
 *     tags: [Awards]
 *     summary: Create a new award
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AwardCreate'
 *     responses:
 *       201:
 *         description: Award created
 *       400:
 *         description: Validation error or budget exceeded
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Beneficiary or program not found
 *       409:
 *         description: Beneficiary not active
 */
export async function createAward(req: Request, res: Response): Promise<void> {
  const body = createAwardSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (beneficiary.status !== 'Active') {
    res.status(409).json({ status: 'error', data: null, message: `Beneficiary must be Active to receive an award. Current status: ${beneficiary.status}` });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: body.program_id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  if (body.funding_source_id) {
    const fs = await prisma.fundingSource.findUnique({ where: { id: body.funding_source_id } });
    if (!fs) {
      res.status(404).json({ status: 'error', data: null, message: 'Funding source not found' });
      return;
    }
  }

  const budgetCheck = await checkBudgetConstraints(body.program_id, body.amount, body.funding_source_id);
  if (!budgetCheck.ok) {
    res.status(400).json({ status: 'error', data: null, message: budgetCheck.message });
    return;
  }

  const startDate = body.start_date ? new Date(body.start_date) : undefined;
  const endDate = body.end_date ? new Date(body.end_date) : undefined;

  const award = await prisma.award.create({
    data: {
      beneficiary_id: body.beneficiary_id,
      program_id: body.program_id,
      funding_source_id: body.funding_source_id || null,
      amount: body.amount,
      balance_remaining: body.amount,
      start_date: startDate,
      end_date: endDate,
      award_type: body.award_type,
      status: 'Draft',
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Award',
    entity_id: award.id,
    new_values: body,
  });

  eventBus.emit('award.created', {
    awardId: award.id,
    userId: req.user?.userId,
    beneficiaryId: (award as any).beneficiary_id,
    amount: body.amount,
    programId: (award as any).program_id,
    awardType: body.award_type,
  });

  res.status(201).json({
    status: 'success',
    data: maskAward(award),
    message: 'Award created successfully',
  });
}

// ── Get award ──

/**
 * @openapi
 * /admin/awards/{id}:
 *   get:
 *     tags: [Awards]
 *     summary: Get award details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Award details
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 */
export async function getAward(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const award = await prisma.award.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true, contact_email: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
      parent_award: { select: { id: true, amount: true, status: true } },
      renewals: { select: { id: true, amount: true, status: true } },
    },
  });

  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  const a = award as any;
  res.json({
    status: 'success',
    data: {
      ...maskAward(a),
      parent_award: a.parent_award ? { id: a.parent_award.id, amount: toDecimal(a.parent_award.amount), status: a.parent_award.status } : undefined,
      renewals: a.renewals?.map((r: any) => ({ id: r.id, amount: toDecimal(r.amount), status: r.status })),
    },
    message: 'Award retrieved successfully',
  });
}

// ── Update award ──

/**
 * @openapi
 * /admin/awards/{id}:
 *   put:
 *     tags: [Awards]
 *     summary: Update award details (only Draft awards)
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
 *             $ref: '#/components/schemas/AwardUpdate'
 *     responses:
 *       200:
 *         description: Award updated
 *       400:
 *         description: Validation error or budget exceeded
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 *       409:
 *         description: Award is not in Draft status
 */
export async function updateAward(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateAwardSchema.parse(req.body);

  const award = await prisma.award.findUnique({ where: { id } });
  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  if (award.status !== 'Draft') {
    res.status(409).json({ status: 'error', data: null, message: 'Only Draft awards can be updated' });
    return;
  }

  const updateData: Record<string, unknown> = {};

  if (body.amount !== undefined) {
    updateData.amount = body.amount;
    updateData.balance_remaining = body.amount;
  }
  if (body.start_date !== undefined) updateData.start_date = body.start_date ? new Date(body.start_date) : null;
  if (body.end_date !== undefined) updateData.end_date = body.end_date ? new Date(body.end_date) : null;
  if (body.award_type) updateData.award_type = body.award_type;
  if (body.funding_source_id !== undefined) updateData.funding_source_id = body.funding_source_id || null;

  // Re-check budget if amount changed
  if (body.amount !== undefined) {
    const fundingSourceId = body.funding_source_id !== undefined ? (body.funding_source_id || null) : award.funding_source_id;
    const budgetCheck = await checkBudgetConstraints(award.program_id, body.amount, fundingSourceId);
    if (!budgetCheck.ok) {
      res.status(400).json({ status: 'error', data: null, message: budgetCheck.message });
      return;
    }
  }

  const updated = await prisma.award.update({
    where: { id },
    data: updateData,
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Award',
    entity_id: id,
    old_values: { amount: toDecimal(award.amount), start_date: award.start_date, end_date: award.end_date, award_type: award.award_type },
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: maskAward(updated),
    message: 'Award updated successfully',
  });
}

// ── Update status ──

/**
 * @openapi
 * /admin/awards/{id}/status:
 *   patch:
 *     tags: [Awards]
 *     summary: Update award status
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
 *             $ref: '#/components/schemas/AwardStatusUpdate'
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
 *         description: Award not found
 *       409:
 *         description: Invalid status transition
 */
export async function updateAwardStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, reason } = updateStatusSchema.parse(req.body);

  const award = await prisma.award.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true, budget_ceiling: true, budget_utilized: true } },
      funding_source: { select: { id: true, name: true, total_allocation: true, utilized_amount: true } },
    },
  });

  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  const currentStatus = award.status;
  if (!getValidTransitions(currentStatus).includes(status)) {
    res.status(409).json({ status: 'error', data: null, message: `Invalid status transition from ${currentStatus} to ${status}` });
    return;
  }

  // Reason required for Suspended/Completed/Closed
  if ((status === 'Suspended' || status === 'Completed' || status === 'Closed') && !reason) {
    res.status(400).json({ status: 'error', data: null, message: 'Reason is required for Suspended, Completed, or Closed status' });
    return;
  }

  const a = award as any;
  const amount = toDecimal(a.amount);
  const balanceRemaining = toDecimal(a.balance_remaining);

  // Budget operations
  if (status === 'Active' && currentStatus === 'Draft') {
    // Activation: consume budget
    const budgetCheck = await checkBudgetConstraints(a.program_id, amount, a.funding_source_id);
    if (!budgetCheck.ok) {
      res.status(400).json({ status: 'error', data: null, message: budgetCheck.message });
      return;
    }

    await prisma.program.update({
      where: { id: a.program_id },
      data: { budget_utilized: { increment: amount } },
    });

    if (a.funding_source_id) {
      await prisma.fundingSource.update({
        where: { id: a.funding_source_id },
        data: { utilized_amount: { increment: amount } },
      });
    }
  }

  if (status === 'Closed' && (currentStatus === 'Active' || currentStatus === 'Suspended')) {
    // Closure: restore remaining balance
    await prisma.program.update({
      where: { id: a.program_id },
      data: { budget_utilized: { decrement: balanceRemaining } },
    });

    if (a.funding_source_id) {
      await prisma.fundingSource.update({
        where: { id: a.funding_source_id },
        data: { utilized_amount: { decrement: balanceRemaining } },
      });
    }
  }

  const updated = await prisma.award.update({
    where: { id },
    data: { status, status_reason: reason || null, budget_utilization_updated: status === 'Active' ? true : a.budget_utilization_updated },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Award',
    entity_id: id,
    old_values: { status: currentStatus, status_reason: a.status_reason },
    new_values: { status, status_reason: reason || null },
  });

  if (status === 'Active') {
    eventBus.emit('award.activated', {
      awardId: id,
      userId: req.user?.userId,
      beneficiaryId: a.beneficiary_id,
      amount: a.amount,
      programId: a.program_id,
    });
  } else if (status === 'Closed') {
    eventBus.emit('award.closed', {
      awardId: id,
      userId: req.user?.userId,
      beneficiaryId: a.beneficiary_id,
      reason: reason || '',
    });
  }

  res.json({
    status: 'success',
    data: maskAward(updated),
    message: `Award status updated to ${status}`,
  });
}

// ── Reinstate ──

/**
 * @openapi
 * /admin/awards/{id}/reinstate:
 *   post:
 *     tags: [Awards]
 *     summary: Reinstate a suspended award to Active
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Award reinstated
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 *       409:
 *         description: Award is not Suspended
 */
export async function reinstateAward(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const award = await prisma.award.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  if (award.status !== 'Suspended') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot reinstate award in status ${award.status}` });
    return;
  }

  const updated = await prisma.award.update({
    where: { id },
    data: { status: 'Active', status_reason: null },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'reinstate',
    entity_type: 'Award',
    entity_id: id,
    old_values: { status: award.status, status_reason: (award as any).status_reason },
    new_values: { status: 'Active', status_reason: null },
  });

  eventBus.emit('award.activated', {
    awardId: id,
    userId: req.user?.userId,
    beneficiaryId: (award as any).beneficiary_id,
    amount: (award as any).amount,
    programId: (award as any).program_id,
  });

  res.json({
    status: 'success',
    data: maskAward(updated),
    message: 'Award reinstated to Active',
  });
}

// ── Renew ──

const renewAwardSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  amount: z.number().min(0).optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']).optional(),
});

/**
 * @openapi
 * /admin/awards/{id}/renew:
 *   post:
 *     tags: [Awards]
 *     summary: Renew an award
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
 *             $ref: '#/components/schemas/AwardRenew'
 *     responses:
 *       201:
 *         description: Renewal award created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 *       409:
 *         description: Parent award is not eligible for renewal
 */
export async function renewAward(req: Request, res: Response): Promise<void> {
  const parentId = req.params.id as string;
  const body = renewAwardSchema.parse(req.body);

  const parent = await prisma.award.findUnique({
    where: { id: parentId },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, status: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
    },
  });

  if (!parent) {
    res.status(404).json({ status: 'error', data: null, message: 'Parent award not found' });
    return;
  }

  const p = parent as any;
  if (p.beneficiary.status !== 'Active') {
    res.status(409).json({ status: 'error', data: null, message: 'Beneficiary must be Active for renewal' });
    return;
  }

  // Only allow renewal from Active, Completed, or Closed awards
  if (!['Active', 'Completed', 'Closed'].includes(p.status)) {
    res.status(409).json({ status: 'error', data: null, message: `Cannot renew award in status ${p.status}` });
    return;
  }

  const amount = body.amount !== undefined ? body.amount : toDecimal(p.amount);
  const awardType = body.award_type || p.award_type;
  const startDate = body.start_date ? new Date(body.start_date) : undefined;
  const endDate = body.end_date ? new Date(body.end_date) : undefined;

  const budgetCheck = await checkBudgetConstraints(p.program_id, amount, p.funding_source_id);
  if (!budgetCheck.ok) {
    res.status(400).json({ status: 'error', data: null, message: budgetCheck.message });
    return;
  }

  const renewal = await prisma.award.create({
    data: {
      beneficiary_id: p.beneficiary_id,
      program_id: p.program_id,
      funding_source_id: p.funding_source_id,
      amount,
      balance_remaining: amount,
      start_date: startDate,
      end_date: endDate,
      award_type: awardType,
      status: 'Draft',
      parent_award_id: parentId,
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      funding_source: { select: { id: true, name: true } },
      parent_award: { select: { id: true, amount: true, status: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'renew',
    entity_type: 'Award',
    entity_id: renewal.id,
    new_values: { parent_award_id: parentId, amount, award_type: awardType, start_date: startDate, end_date: endDate },
  });

  res.status(201).json({
    status: 'success',
    data: maskAward(renewal),
    message: 'Award renewal created successfully',
  });
}

// ── Generate award letter PDF ──

/**
 * @openapi
 * /admin/awards/{id}/letter/generate:
 *   post:
 *     tags: [Awards]
 *     summary: Generate award letter PDF
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: PDF file stream
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Award not found
 */
export async function generateAwardLetter(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const award = await prisma.award.findUnique({
    where: { id },
    include: {
      beneficiary: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          beneficiary_identifier: true,
          school: { select: { name: true } },
        },
      },
      program: { select: { id: true, name: true } },
    },
  });

  if (!award) {
    res.status(404).json({ status: 'error', data: null, message: 'Award not found' });
    return;
  }

  const a = award as any;
  const beneficiaryName = `${a.beneficiary.first_name} ${a.beneficiary.last_name}`;
  const schoolName = a.beneficiary.school?.name || 'your school';
  const programName = a.program.name;
  const amount = toDecimal(a.amount);
  const startDate = a.start_date ? new Date(a.start_date).toLocaleDateString() : 'N/A';
  const endDate = a.end_date ? new Date(a.end_date).toLocaleDateString() : 'N/A';

  const doc = new PDFDocument();
  const chunks: Buffer[] = [];

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => {
    const pdfBuffer = Buffer.concat(chunks);

    logAudit({
      user_id: req.user?.userId,
      action: 'generate_letter',
      entity_type: 'Award',
      entity_id: id,
      new_values: { beneficiary_name: beneficiaryName, program_name: programName },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="award_letter_${a.beneficiary.beneficiary_identifier}.pdf"`);
    res.send(pdfBuffer);
  });

  // Brand header with logo
  const logoPath = path.resolve(__dirname, '../../../assets/press_logo.jpg');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 40, { width: 50 });
  }
  doc.fillColor('#715E26').fontSize(18).font('Helvetica-Bold').text('Press Trust Scholarship Management System', 115, 48);
  doc.fillColor('#C19B38').fontSize(13).font('Helvetica').text('Scholarship Award Letter', 115, 74);
  doc.moveDown(3);

  // Accent line
  doc.fillColor('#715E26').rect(50, doc.y, 500, 2).fill();
  doc.moveDown(1.5);

  doc.fillColor('#000000').fontSize(11).font('Helvetica');
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 50, doc.y + 5);
  doc.moveDown();

  doc.text(`To: ${beneficiaryName}`, 50, doc.y + 3);
  doc.text(`School: ${schoolName}`);
  doc.moveDown(2);

  doc.text(`Dear ${a.beneficiary.first_name},`);
  doc.moveDown();

  doc.text(
    `We are pleased to inform you that you have been selected to receive a scholarship under the ${programName}. ` +
    `This award is valued at MWK ${amount.toLocaleString()} and covers the period from ${startDate} to ${endDate}.`,
    { width: 500, align: 'justify' }
  );
  doc.moveDown();

  doc.text(
    'This scholarship is awarded in recognition of your academic potential and commitment to education. ' +
    'We encourage you to continue working hard and making the most of this opportunity.',
    { width: 500, align: 'justify' }
  );
  doc.moveDown(2);

  doc.fillColor('#000000').text('Yours sincerely,');
  doc.moveDown();
  doc.fillColor('#715E26').font('Helvetica-Bold').text('Press Trust Scholarship Committee');
  doc.moveDown();
  doc.fillColor('#000000').font('Helvetica').text(`Award Reference: ${a.beneficiary.beneficiary_identifier}`);

  doc.end();
}
