import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { eventBus } from '../../../shared/events/event-bus';

// ── Zod schemas ──

const createPerformanceSchema = z.object({
  beneficiary_id: z.string().uuid(),
  school_id: z.string().uuid(),
  academic_period: z.string().min(1),
  subjects: z.record(z.string(), z.any()),
  overall_score: z.number().min(0).max(100).optional(),
  attendance_percentage: z.number().min(0).max(100).optional(),
  progression: z.enum(['Promoted', 'Repeated', 'Completed', 'Dropped']).optional(),
  notes: z.string().optional(),
});

const updatePerformanceSchema = z.object({
  subjects: z.record(z.string(), z.any()).optional(),
  overall_score: z.number().min(0).max(100).optional(),
  attendance_percentage: z.number().min(0).max(100).optional(),
  progression: z.enum(['Promoted', 'Repeated', 'Completed', 'Dropped']).optional(),
  notes: z.string().optional(),
});

const createAtRiskSchema = z.object({
  beneficiary_id: z.string().uuid(),
  reason: z.string().min(1),
});

const resolveAtRiskSchema = z.object({
  justification: z.string().min(1),
});

const autoFlagSchema = z.object({
  score_threshold: z.number().min(0).max(100).default(50),
  attendance_threshold: z.number().min(0).max(100).default(75),
  academic_period: z.string().optional(),
});

const createInterventionSchema = z.object({
  beneficiary_id: z.string().uuid(),
  action: z.string().min(1),
  assigned_to: z.string().uuid(),
  due_date: z.string(),
});

const updateInterventionSchema = z.object({
  action: z.string().min(1).optional(),
  assigned_to: z.string().uuid().optional(),
  due_date: z.string().optional(),
});

const updateInterventionStatusSchema = z.object({
  status: z.enum(['Open', 'InProgress', 'Closed']),
  resolution_notes: z.string().optional(),
});

// ── Helpers ──

async function isPerformanceImmutable(beneficiaryId: string, academicPeriod: string): Promise<boolean> {
  const linked = await prisma.disbursement.findFirst({
    where: {
      beneficiary_id: beneficiaryId,
      academic_period: academicPeriod,
      status: { in: ['Paid', 'Reconciled'] },
    },
  });
  return !!linked;
}

// ── Performance ──

/**
 * @openapi
 * /admin/me/performance:
 *   get:
 *     tags: [M&E]
 *     summary: List academic performance records
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: academic_period
 *         schema: { type: string }
 *       - in: query
 *         name: school_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of performance records
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 */
export async function listPerformance(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const beneficiaryId = req.query.beneficiary_id as string | undefined;
  const academicPeriod = req.query.academic_period as string | undefined;
  const schoolId = req.query.school_id as string | undefined;

  const where: Record<string, unknown> = {};
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;
  if (academicPeriod) where.academic_period = academicPeriod;
  if (schoolId) where.school_id = schoolId;

  const [records, total] = await Promise.all([
    prisma.academicPerformance.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        school: { select: { id: true, name: true } },
        recorder: { select: { id: true, name: true } },
      },
    }),
    prisma.academicPerformance.count({ where }),
  ]);

  const data = (records as any[]).map((r) => ({
    id: r.id,
    beneficiary: r.beneficiary,
    school: r.school,
    academic_period: r.academic_period,
    subjects: r.subjects,
    overall_score: r.overall_score ? parseFloat(r.overall_score.toString()) : null,
    attendance_percentage: r.attendance_percentage ? parseFloat(r.attendance_percentage.toString()) : null,
    progression: r.progression,
    notes: r.notes,
    recorder: r.recorder,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Performance records retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/performance:
 *   post:
 *     tags: [M&E]
 *     summary: Record academic performance
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceCreate'
 *     responses:
 *       201:
 *         description: Performance recorded
 */
export async function createPerformance(req: Request, res: Response): Promise<void> {
  const body = createPerformanceSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const school = await prisma.school.findUnique({ where: { id: body.school_id } });
  if (!school) {
    res.status(404).json({ status: 'error', data: null, message: 'School not found' });
    return;
  }

  const record = await prisma.academicPerformance.create({
    data: {
      beneficiary_id: body.beneficiary_id,
      school_id: body.school_id,
      academic_period: body.academic_period,
      subjects: body.subjects as any,
      overall_score: body.overall_score,
      attendance_percentage: body.attendance_percentage,
      progression: body.progression,
      notes: body.notes,
      created_by: req.user!.userId,
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      school: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'AcademicPerformance',
    entity_id: record.id,
    new_values: body,
  });

  eventBus.emit('me.performance_recorded', {
    performanceId: record.id,
    userId: req.user?.userId,
    beneficiaryId: body.beneficiary_id,
    overallScore: body.overall_score,
    attendancePercentage: body.attendance_percentage,
    academicPeriod: body.academic_period,
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: record.id,
      beneficiary: record.beneficiary,
      school: record.school,
      academic_period: record.academic_period,
      subjects: record.subjects,
      overall_score: record.overall_score ? parseFloat(record.overall_score.toString()) : null,
      attendance_percentage: record.attendance_percentage ? parseFloat(record.attendance_percentage.toString()) : null,
      progression: record.progression,
      notes: record.notes,
      recorder: record.recorder,
      created_at: record.created_at,
    },
    message: 'Performance recorded successfully',
  });
}

/**
 * @openapi
 * /admin/me/performance/{id}:
 *   get:
 *     tags: [M&E]
 *     summary: Get performance record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Performance record details
 */
export async function getPerformance(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const record = await prisma.academicPerformance.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      school: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Performance record not found' });
    return;
  }

  res.json({
    status: 'success',
    data: {
      id: record.id,
      beneficiary: record.beneficiary,
      school: record.school,
      academic_period: record.academic_period,
      subjects: record.subjects,
      overall_score: record.overall_score ? parseFloat(record.overall_score.toString()) : null,
      attendance_percentage: record.attendance_percentage ? parseFloat(record.attendance_percentage.toString()) : null,
      progression: record.progression,
      notes: record.notes,
      recorder: record.recorder,
      created_at: record.created_at,
      updated_at: record.updated_at,
    },
    message: 'Performance record retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/performance/{id}:
 *   put:
 *     tags: [M&E]
 *     summary: Update performance record (blocked if linked to paid/reconciled disbursement)
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
 *             $ref: '#/components/schemas/PerformanceUpdate'
 *     responses:
 *       200:
 *         description: Performance updated
 *       409:
 *         description: Record is immutable due to linked disbursement
 */
export async function updatePerformance(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updatePerformanceSchema.parse(req.body);

  const record = await prisma.academicPerformance.findUnique({ where: { id } });
  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Performance record not found' });
    return;
  }

  const immutable = await isPerformanceImmutable(record.beneficiary_id, record.academic_period);
  if (immutable) {
    res.status(409).json({ status: 'error', data: null, message: 'Performance record is immutable because a disbursement has been paid or reconciled for this period' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.subjects !== undefined) updateData.subjects = body.subjects as any;
  if (body.overall_score !== undefined) updateData.overall_score = body.overall_score;
  if (body.attendance_percentage !== undefined) updateData.attendance_percentage = body.attendance_percentage;
  if (body.progression !== undefined) updateData.progression = body.progression;
  if (body.notes !== undefined) updateData.notes = body.notes;

  const updated = await prisma.academicPerformance.update({
    where: { id },
    data: updateData,
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      school: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'AcademicPerformance',
    entity_id: id,
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      beneficiary: updated.beneficiary,
      school: updated.school,
      academic_period: updated.academic_period,
      subjects: updated.subjects,
      overall_score: updated.overall_score ? parseFloat(updated.overall_score.toString()) : null,
      attendance_percentage: updated.attendance_percentage ? parseFloat(updated.attendance_percentage.toString()) : null,
      progression: updated.progression,
      notes: updated.notes,
      recorder: updated.recorder,
      updated_at: updated.updated_at,
    },
    message: 'Performance record updated successfully',
  });
}

/**
 * @openapi
 * /admin/me/performance/{id}:
 *   delete:
 *     tags: [M&E]
 *     summary: Delete performance record (blocked if linked to paid/reconciled disbursement)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Performance deleted
 *       409:
 *         description: Record is immutable
 */
export async function deletePerformance(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const record = await prisma.academicPerformance.findUnique({ where: { id } });
  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Performance record not found' });
    return;
  }

  const immutable = await isPerformanceImmutable(record.beneficiary_id, record.academic_period);
  if (immutable) {
    res.status(409).json({ status: 'error', data: null, message: 'Performance record is immutable because a disbursement has been paid or reconciled for this period' });
    return;
  }

  await prisma.academicPerformance.delete({ where: { id } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'AcademicPerformance',
    entity_id: id,
    old_values: { academic_period: record.academic_period, beneficiary_id: record.beneficiary_id },
  });

  res.json({
    status: 'success',
    data: { id, deleted: true },
    message: 'Performance record deleted successfully',
  });
}

// ── At-Risk Flags ──

/**
 * @openapi
 * /admin/me/at-risk:
 *   get:
 *     tags: [M&E]
 *     summary: List active at-risk flags
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of at-risk flags
 */
export async function listAtRiskFlags(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const beneficiaryId = req.query.beneficiary_id as string | undefined;

  const where: Record<string, unknown> = { resolved: false };
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;

  const [flags, total] = await Promise.all([
    prisma.atRiskFlag.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        flagger: { select: { id: true, name: true } },
        resolver: { select: { id: true, name: true } },
      },
    }),
    prisma.atRiskFlag.count({ where }),
  ]);

  const data = (flags as any[]).map((f) => ({
    id: f.id,
    beneficiary: f.beneficiary,
    reason: f.reason,
    flagged_by: f.flagger,
    resolved: f.resolved,
    resolved_at: f.resolved_at,
    resolved_by: f.resolver,
    created_at: f.created_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'At-risk flags retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/at-risk:
 *   post:
 *     tags: [M&E]
 *     summary: Manually flag a beneficiary as at-risk
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AtRiskFlagCreate'
 *     responses:
 *       201:
 *         description: Flag created
 *       409:
 *         description: Active flag already exists for beneficiary
 */
export async function createAtRiskFlag(req: Request, res: Response): Promise<void> {
  const body = createAtRiskSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  // One active flag per beneficiary
  const existing = await prisma.atRiskFlag.findFirst({
    where: { beneficiary_id: body.beneficiary_id, resolved: false },
  });

  if (existing) {
    res.status(409).json({ status: 'error', data: null, message: 'An active at-risk flag already exists for this beneficiary. Resolve it before creating a new one.' });
    return;
  }

  const flag = await prisma.atRiskFlag.create({
    data: {
      beneficiary_id: body.beneficiary_id,
      reason: body.reason,
      flagged_by: req.user!.userId,
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      flagger: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'AtRiskFlag',
    entity_id: flag.id,
    new_values: { beneficiary_id: body.beneficiary_id, reason: body.reason },
  });

  eventBus.emit('me.at_risk_flagged', {
    flagId: flag.id,
    userId: req.user?.userId,
    beneficiaryId: body.beneficiary_id,
    reason: body.reason,
    thresholdScore: body.threshold_score,
    attendanceThreshold: body.attendance_threshold,
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: flag.id,
      beneficiary: flag.beneficiary,
      reason: flag.reason,
      flagged_by: flag.flagger,
      resolved: flag.resolved,
      created_at: flag.created_at,
    },
    message: 'At-risk flag created successfully',
  });
}

/**
 * @openapi
 * /admin/me/at-risk/{id}/resolve:
 *   post:
 *     tags: [M&E]
 *     summary: Resolve an at-risk flag with justification
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
 *             $ref: '#/components/schemas/AtRiskFlagResolve'
 *     responses:
 *       200:
 *         description: Flag resolved
 */
export async function resolveAtRiskFlag(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { justification } = resolveAtRiskSchema.parse(req.body);

  const flag = await prisma.atRiskFlag.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      flagger: { select: { id: true, name: true } },
    },
  });

  if (!flag) {
    res.status(404).json({ status: 'error', data: null, message: 'At-risk flag not found' });
    return;
  }

  if (flag.resolved) {
    res.status(409).json({ status: 'error', data: null, message: 'At-risk flag is already resolved' });
    return;
  }

  const updated = await prisma.atRiskFlag.update({
    where: { id },
    data: { resolved: true, resolved_at: new Date(), resolved_by: req.user!.userId },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      flagger: { select: { id: true, name: true } },
      resolver: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'resolve',
    entity_type: 'AtRiskFlag',
    entity_id: id,
    old_values: { resolved: false },
    new_values: { resolved: true, justification },
  });

  eventBus.emit('me.at_risk_resolved', {
    flagId: id,
    userId: req.user?.userId,
    beneficiaryId: (updated as any).beneficiary_id,
    justification,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      beneficiary: updated.beneficiary,
      reason: updated.reason,
      flagged_by: updated.flagger,
      resolved: updated.resolved,
      resolved_at: updated.resolved_at,
      resolved_by: updated.resolver,
    },
    message: 'At-risk flag resolved successfully',
  });
}

// ── Auto-flagging ──

/**
 * @openapi
 * /admin/me/auto-flag:
 *   post:
 *     tags: [M&E]
 *     summary: Auto-flag beneficiaries based on performance thresholds
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AutoFlagRequest'
 *     responses:
 *       200:
 *         description: Auto-flagging results
 */
export async function autoFlagBeneficiaries(req: Request, res: Response): Promise<void> {
  const { score_threshold, attendance_threshold, academic_period } = autoFlagSchema.parse(req.body);

  const period = academic_period || '2026-T1';

  // Find performance records below thresholds
  const performances = await prisma.academicPerformance.findMany({
    where: {
      academic_period: period,
      OR: [
        { overall_score: { lt: score_threshold } },
        { attendance_percentage: { lt: attendance_threshold } },
      ],
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
    },
  });

  const flagged: any[] = [];
  const skipped: any[] = [];

  for (const perf of performances) {
    const existing = await prisma.atRiskFlag.findFirst({
      where: { beneficiary_id: perf.beneficiary_id, resolved: false },
    });

    if (existing) {
      skipped.push({ beneficiary_id: perf.beneficiary_id, reason: 'Already has active flag' });
      continue;
    }

    const reason = perf.overall_score && parseFloat(perf.overall_score.toString()) < score_threshold
      ? `Low overall score: ${parseFloat(perf.overall_score.toString())}% (threshold: ${score_threshold}%)`
      : `Low attendance: ${parseFloat(perf.attendance_percentage!.toString())}% (threshold: ${attendance_threshold}%)`;

    const flag = await prisma.atRiskFlag.create({
      data: {
        beneficiary_id: perf.beneficiary_id,
        reason,
        flagged_by: req.user!.userId,
      },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      },
    });

    flagged.push(flag);
  }

  await logAudit({
    user_id: req.user?.userId,
    action: 'auto_flag',
    entity_type: 'AtRiskFlag',
    entity_id: 'batch',
    new_values: { period, score_threshold, attendance_threshold, flagged: flagged.length, skipped: skipped.length },
  });

  res.json({
    status: 'success',
    data: { flagged, skipped },
    message: `Auto-flagging complete: ${flagged.length} flagged, ${skipped.length} skipped`,
  });
}

// ── Interventions ──

/**
 * @openapi
 * /admin/me/interventions:
 *   get:
 *     tags: [M&E]
 *     summary: List interventions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Open, InProgress, Closed] }
 *       - in: query
 *         name: assigned_to
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of interventions
 */
export async function listInterventions(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const beneficiaryId = req.query.beneficiary_id as string | undefined;
  const status = req.query.status as string | undefined;
  const assignedTo = req.query.assigned_to as string | undefined;

  const where: Record<string, unknown> = {};
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;
  if (status) where.status = status;
  if (assignedTo) where.assigned_to = assignedTo;

  const [interventions, total] = await Promise.all([
    prisma.intervention.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        assignee: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
      },
    }),
    prisma.intervention.count({ where }),
  ]);

  const data = (interventions as any[]).map((i) => ({
    id: i.id,
    beneficiary: i.beneficiary,
    action: i.action,
    assigned_to: i.assignee,
    due_date: i.due_date,
    status: i.status,
    resolution_notes: i.resolution_notes,
    creator: i.creator,
    created_at: i.created_at,
    updated_at: i.updated_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Interventions retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/interventions:
 *   post:
 *     tags: [M&E]
 *     summary: Create an intervention
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InterventionCreate'
 *     responses:
 *       201:
 *         description: Intervention created
 */
export async function createIntervention(req: Request, res: Response): Promise<void> {
  const body = createInterventionSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const assignee = await prisma.user.findUnique({ where: { id: body.assigned_to } });
  if (!assignee) {
    res.status(404).json({ status: 'error', data: null, message: 'Assigned user not found' });
    return;
  }

  const dueDate = new Date(body.due_date);
  if (isNaN(dueDate.getTime())) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid due_date format' });
    return;
  }

  const intervention = await prisma.intervention.create({
    data: {
      beneficiary_id: body.beneficiary_id,
      action: body.action,
      assigned_to: body.assigned_to,
      due_date: dueDate,
      created_by: req.user!.userId,
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Intervention',
    entity_id: intervention.id,
    new_values: body,
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: intervention.id,
      beneficiary: intervention.beneficiary,
      action: intervention.action,
      assigned_to: intervention.assignee,
      due_date: intervention.due_date,
      status: intervention.status,
      creator: intervention.creator,
      created_at: intervention.created_at,
    },
    message: 'Intervention created successfully',
  });
}

/**
 * @openapi
 * /admin/me/interventions/{id}:
 *   get:
 *     tags: [M&E]
 *     summary: Get intervention details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Intervention details
 */
export async function getIntervention(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const intervention = await prisma.intervention.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!intervention) {
    res.status(404).json({ status: 'error', data: null, message: 'Intervention not found' });
    return;
  }

  res.json({
    status: 'success',
    data: {
      id: intervention.id,
      beneficiary: intervention.beneficiary,
      action: intervention.action,
      assigned_to: intervention.assignee,
      due_date: intervention.due_date,
      status: intervention.status,
      resolution_notes: intervention.resolution_notes,
      creator: intervention.creator,
      created_at: intervention.created_at,
      updated_at: intervention.updated_at,
    },
    message: 'Intervention retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/interventions/{id}:
 *   put:
 *     tags: [M&E]
 *     summary: Update intervention details
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
 *             $ref: '#/components/schemas/InterventionUpdate'
 *     responses:
 *       200:
 *         description: Intervention updated
 */
export async function updateIntervention(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateInterventionSchema.parse(req.body);

  const intervention = await prisma.intervention.findUnique({ where: { id } });
  if (!intervention) {
    res.status(404).json({ status: 'error', data: null, message: 'Intervention not found' });
    return;
  }

  if (intervention.status === 'Closed') {
    res.status(409).json({ status: 'error', data: null, message: 'Closed interventions cannot be updated' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.action !== undefined) updateData.action = body.action;
  if (body.assigned_to !== undefined) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assigned_to } });
    if (!assignee) {
      res.status(404).json({ status: 'error', data: null, message: 'Assigned user not found' });
      return;
    }
    updateData.assigned_to = body.assigned_to;
  }
  if (body.due_date !== undefined) {
    const dueDate = new Date(body.due_date);
    if (isNaN(dueDate.getTime())) {
      res.status(400).json({ status: 'error', data: null, message: 'Invalid due_date format' });
      return;
    }
    updateData.due_date = dueDate;
  }

  const updated = await prisma.intervention.update({
    where: { id },
    data: updateData,
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Intervention',
    entity_id: id,
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      beneficiary: updated.beneficiary,
      action: updated.action,
      assigned_to: updated.assignee,
      due_date: updated.due_date,
      status: updated.status,
      creator: updated.creator,
      updated_at: updated.updated_at,
    },
    message: 'Intervention updated successfully',
  });
}

/**
 * @openapi
 * /admin/me/interventions/{id}/status:
 *   patch:
 *     tags: [M&E]
 *     summary: Update intervention status
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
 *             $ref: '#/components/schemas/InterventionStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Invalid status transition
 */
export async function updateInterventionStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, resolution_notes } = updateInterventionStatusSchema.parse(req.body);

  const intervention = await prisma.intervention.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!intervention) {
    res.status(404).json({ status: 'error', data: null, message: 'Intervention not found' });
    return;
  }

  const validTransitions: Record<string, string[]> = {
    Open: ['InProgress', 'Closed'],
    InProgress: ['Closed'],
    Closed: [],
  };

  if (!validTransitions[intervention.status].includes(status)) {
    res.status(409).json({ status: 'error', data: null, message: `Invalid status transition from ${intervention.status} to ${status}` });
    return;
  }

  // Resolution notes required for Closed
  if (status === 'Closed' && !resolution_notes) {
    res.status(400).json({ status: 'error', data: null, message: 'resolution_notes is required when closing an intervention' });
    return;
  }

  const updateData: Record<string, unknown> = { status };
  if (resolution_notes !== undefined) updateData.resolution_notes = resolution_notes;

  const updated = await prisma.intervention.update({
    where: { id },
    data: updateData,
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      assignee: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Intervention',
    entity_id: id,
    old_values: { status: intervention.status },
    new_values: { status, resolution_notes },
  });

  if (status === 'Closed') {
    eventBus.emit('me.intervention_closed', {
      interventionId: id,
      userId: req.user?.userId,
      beneficiaryId: (updated as any).beneficiary_id,
      resolutionNotes: resolution_notes || '',
    });
  }

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      beneficiary: updated.beneficiary,
      action: updated.action,
      assigned_to: updated.assignee,
      due_date: updated.due_date,
      status: updated.status,
      resolution_notes: updated.resolution_notes,
      creator: updated.creator,
      updated_at: updated.updated_at,
    },
    message: `Intervention status updated to ${status}`,
  });
}

// ── Zod schemas for MonitoringVisit ──

const createVisitSchema = z.object({
  entity_type: z.enum(['beneficiary', 'school']),
  entity_id: z.string().uuid(),
  visit_date: z.string(),
  findings: z.string().min(1),
  follow_up_actions: z.string().optional(),
});

const updateVisitSchema = z.object({
  entity_type: z.enum(['beneficiary', 'school']).optional(),
  entity_id: z.string().uuid().optional(),
  visit_date: z.string().optional(),
  findings: z.string().min(1).optional(),
  follow_up_actions: z.string().optional(),
});

// ── Monitoring Visit ──

/**
 * @openapi
 * /admin/me/visits:
 *   get:
 *     tags: [M&E]
 *     summary: List monitoring visits
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entity_type
 *         schema: { type: string, enum: [beneficiary, school] }
 *       - in: query
 *         name: entity_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of visits
 */
export async function listVisits(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const entityType = req.query.entity_type as string | undefined;
  const entityId = req.query.entity_id as string | undefined;
  const fromDate = req.query.from_date as string | undefined;
  const toDate = req.query.to_date as string | undefined;

  const where: Record<string, unknown> = {};
  if (entityType) where.entity_type = entityType;
  if (entityId) where.entity_id = entityId;
  if (fromDate || toDate) {
    where.visit_date = {};
    if (fromDate) (where.visit_date as Record<string, unknown>).gte = new Date(fromDate);
    if (toDate) (where.visit_date as Record<string, unknown>).lte = new Date(toDate);
  }

  const [visits, total] = await Promise.all([
    prisma.monitoringVisit.findMany({
      where,
      skip,
      take: limit,
      orderBy: { visit_date: 'desc' },
      include: {
        conductor: { select: { id: true, name: true } },
      },
    }),
    prisma.monitoringVisit.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items: visits, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Monitoring visits retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/visits:
 *   post:
 *     tags: [M&E]
 *     summary: Record a monitoring visit
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MonitoringVisitCreate'
 *     responses:
 *       201:
 *         description: Visit recorded
 */
export async function createVisit(req: Request, res: Response): Promise<void> {
  const body = createVisitSchema.parse(req.body);

  const visitDate = new Date(body.visit_date);
  if (isNaN(visitDate.getTime())) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid visit_date format' });
    return;
  }

  const visit = await prisma.monitoringVisit.create({
    data: {
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      visit_date: visitDate,
      findings: body.findings,
      follow_up_actions: body.follow_up_actions,
      conducted_by: req.user!.userId,
    },
    include: {
      conductor: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'MonitoringVisit',
    entity_id: visit.id,
    new_values: body,
  });

  res.status(201).json({
    status: 'success',
    data: visit,
    message: 'Monitoring visit recorded successfully',
  });
}

/**
 * @openapi
 * /admin/me/visits/{id}:
 *   get:
 *     tags: [M&E]
 *     summary: Get monitoring visit details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Visit details
 */
export async function getVisit(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const visit = await prisma.monitoringVisit.findUnique({
    where: { id },
    include: {
      conductor: { select: { id: true, name: true } },
    },
  });

  if (!visit) {
    res.status(404).json({ status: 'error', data: null, message: 'Monitoring visit not found' });
    return;
  }

  res.json({
    status: 'success',
    data: visit,
    message: 'Monitoring visit retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/visits/{id}:
 *   put:
 *     tags: [M&E]
 *     summary: Update monitoring visit
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
 *             $ref: '#/components/schemas/MonitoringVisitUpdate'
 *     responses:
 *       200:
 *         description: Visit updated
 */
export async function updateVisit(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateVisitSchema.parse(req.body);

  const visit = await prisma.monitoringVisit.findUnique({ where: { id } });
  if (!visit) {
    res.status(404).json({ status: 'error', data: null, message: 'Monitoring visit not found' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.entity_type !== undefined) updateData.entity_type = body.entity_type;
  if (body.entity_id !== undefined) updateData.entity_id = body.entity_id;
  if (body.visit_date !== undefined) {
    const d = new Date(body.visit_date);
    if (isNaN(d.getTime())) {
      res.status(400).json({ status: 'error', data: null, message: 'Invalid visit_date format' });
      return;
    }
    updateData.visit_date = d;
  }
  if (body.findings !== undefined) updateData.findings = body.findings;
  if (body.follow_up_actions !== undefined) updateData.follow_up_actions = body.follow_up_actions;

  const updated = await prisma.monitoringVisit.update({
    where: { id },
    data: updateData,
    include: {
      conductor: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'MonitoringVisit',
    entity_id: id,
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: updated,
    message: 'Monitoring visit updated successfully',
  });
}

/**
 * @openapi
 * /admin/me/visits/{id}:
 *   delete:
 *     tags: [M&E]
 *     summary: Delete a monitoring visit
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Visit deleted
 */
export async function deleteVisit(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const visit = await prisma.monitoringVisit.findUnique({ where: { id } });
  if (!visit) {
    res.status(404).json({ status: 'error', data: null, message: 'Monitoring visit not found' });
    return;
  }

  await prisma.monitoringVisit.delete({ where: { id } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'MonitoringVisit',
    entity_id: id,
    old_values: { findings: visit.findings, visit_date: visit.visit_date },
  });

  res.json({
    status: 'success',
    data: { id, deleted: true },
    message: 'Monitoring visit deleted successfully',
  });
}

// ── Zod schemas for Outcome ──

const createOutcomeSchema = z.object({
  beneficiary_id: z.string().uuid(),
  program_id: z.string().uuid(),
  outcome_type: z.enum(['Completion', 'Graduation', 'Exit']),
  outcome_date: z.string(),
  reason: z.string().optional(),
});

const updateOutcomeSchema = z.object({
  beneficiary_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  outcome_type: z.enum(['Completion', 'Graduation', 'Exit']).optional(),
  outcome_date: z.string().optional(),
  reason: z.string().optional(),
});

// ── Outcome ──

/**
 * @openapi
 * /admin/me/outcomes:
 *   get:
 *     tags: [M&E]
 *     summary: List outcomes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: beneficiary_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: outcome_type
 *         schema: { type: string, enum: [Completion, Graduation, Exit] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of outcomes
 */
export async function listOutcomes(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const beneficiaryId = req.query.beneficiary_id as string | undefined;
  const programId = req.query.program_id as string | undefined;
  const outcomeType = req.query.outcome_type as string | undefined;

  const where: Record<string, unknown> = {};
  if (beneficiaryId) where.beneficiary_id = beneficiaryId;
  if (programId) where.program_id = programId;
  if (outcomeType) where.outcome_type = outcomeType;

  const [outcomes, total] = await Promise.all([
    prisma.outcome.findMany({
      where,
      skip,
      take: limit,
      orderBy: { outcome_date: 'desc' },
      include: {
        beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
        program: { select: { id: true, name: true } },
        recorder: { select: { id: true, name: true } },
      },
    }),
    prisma.outcome.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items: outcomes, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Outcomes retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/outcomes:
 *   post:
 *     tags: [M&E]
 *     summary: Record an outcome
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OutcomeCreate'
 *     responses:
 *       201:
 *         description: Outcome recorded
 */
export async function createOutcome(req: Request, res: Response): Promise<void> {
  const body = createOutcomeSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const program = await prisma.program.findUnique({ where: { id: body.program_id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  const outcomeDate = new Date(body.outcome_date);
  if (isNaN(outcomeDate.getTime())) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid outcome_date format' });
    return;
  }

  const outcome = await prisma.outcome.create({
    data: {
      beneficiary_id: body.beneficiary_id,
      program_id: body.program_id,
      outcome_type: body.outcome_type,
      outcome_date: outcomeDate,
      reason: body.reason,
      recorded_by: req.user!.userId,
    },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Outcome',
    entity_id: outcome.id,
    new_values: body,
  });

  res.status(201).json({
    status: 'success',
    data: outcome,
    message: 'Outcome recorded successfully',
  });
}

/**
 * @openapi
 * /admin/me/outcomes/{id}:
 *   get:
 *     tags: [M&E]
 *     summary: Get outcome details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Outcome details
 */
export async function getOutcome(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const outcome = await prisma.outcome.findUnique({
    where: { id },
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  if (!outcome) {
    res.status(404).json({ status: 'error', data: null, message: 'Outcome not found' });
    return;
  }

  res.json({
    status: 'success',
    data: outcome,
    message: 'Outcome retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/me/outcomes/{id}:
 *   put:
 *     tags: [M&E]
 *     summary: Update outcome
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
 *             $ref: '#/components/schemas/OutcomeUpdate'
 *     responses:
 *       200:
 *         description: Outcome updated
 */
export async function updateOutcome(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateOutcomeSchema.parse(req.body);

  const outcome = await prisma.outcome.findUnique({ where: { id } });
  if (!outcome) {
    res.status(404).json({ status: 'error', data: null, message: 'Outcome not found' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.beneficiary_id !== undefined) {
    const beneficiary = await prisma.beneficiary.findUnique({ where: { id: body.beneficiary_id } });
    if (!beneficiary) {
      res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
      return;
    }
    updateData.beneficiary_id = body.beneficiary_id;
  }
  if (body.program_id !== undefined) {
    const program = await prisma.program.findUnique({ where: { id: body.program_id } });
    if (!program) {
      res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
      return;
    }
    updateData.program_id = body.program_id;
  }
  if (body.outcome_type !== undefined) updateData.outcome_type = body.outcome_type;
  if (body.outcome_date !== undefined) {
    const d = new Date(body.outcome_date);
    if (isNaN(d.getTime())) {
      res.status(400).json({ status: 'error', data: null, message: 'Invalid outcome_date format' });
      return;
    }
    updateData.outcome_date = d;
  }
  if (body.reason !== undefined) updateData.reason = body.reason;

  const updated = await prisma.outcome.update({
    where: { id },
    data: updateData,
    include: {
      beneficiary: { select: { id: true, first_name: true, last_name: true, beneficiary_identifier: true } },
      program: { select: { id: true, name: true } },
      recorder: { select: { id: true, name: true } },
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Outcome',
    entity_id: id,
    new_values: updateData,
  });

  res.json({
    status: 'success',
    data: updated,
    message: 'Outcome updated successfully',
  });
}

/**
 * @openapi
 * /admin/me/outcomes/{id}:
 *   delete:
 *     tags: [M&E]
 *     summary: Delete an outcome
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Outcome deleted
 */
export async function deleteOutcome(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const outcome = await prisma.outcome.findUnique({ where: { id } });
  if (!outcome) {
    res.status(404).json({ status: 'error', data: null, message: 'Outcome not found' });
    return;
  }

  await prisma.outcome.delete({ where: { id } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'Outcome',
    entity_id: id,
    old_values: { outcome_type: outcome.outcome_type, beneficiary_id: outcome.beneficiary_id },
  });

  res.json({
    status: 'success',
    data: { id, deleted: true },
    message: 'Outcome deleted successfully',
  });
}

// ── Program Metrics ──

/**
 * @openapi
 * /admin/me/metrics:
 *   get:
 *     tags: [M&E]
 *     summary: Get program outcome metrics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: academic_period
 *         schema: { type: string }
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *       - in: query
 *         name: school_id
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Aggregated metrics
 */
export async function getMetrics(req: Request, res: Response): Promise<void> {
  const programId = req.query.program_id as string | undefined;
  const academicPeriod = req.query.academic_period as string | undefined;
  const district = req.query.district as string | undefined;
  const schoolId = req.query.school_id as string | undefined;

  // Build filters for beneficiaries
  const beneficiaryWhere: Record<string, unknown> = { status: 'Active' };
  if (programId) beneficiaryWhere.program_id = programId;
  if (district) beneficiaryWhere.district = district;
  if (schoolId) beneficiaryWhere.school_id = schoolId;

  const totalActiveBeneficiaries = await prisma.beneficiary.count({ where: beneficiaryWhere });

  // Build filters for outcomes (via beneficiary relation)
  const outcomeWhere: Record<string, unknown> = {};
  if (programId) outcomeWhere.program_id = programId;

  const [completionCount, graduationCount, exitCount, promotedCount] = await Promise.all([
    prisma.outcome.count({ where: { ...outcomeWhere, outcome_type: 'Completion' } }),
    prisma.outcome.count({ where: { ...outcomeWhere, outcome_type: 'Graduation' } }),
    prisma.outcome.count({ where: { ...outcomeWhere, outcome_type: 'Exit' } }),
    prisma.academicPerformance.count({
      where: {
        progression: 'Promoted',
        ...(academicPeriod ? { academic_period: academicPeriod } : {}),
        ...(programId ? { beneficiary: { program_id: programId } } : {}),
        ...(district ? { beneficiary: { district } } : {}),
        ...(schoolId ? { beneficiary: { school_id: schoolId } } : {}),
      },
    }),
  ]);

  // Total performance records for progression denominator
  const totalPerformanceRecords = await prisma.academicPerformance.count({
    where: {
      ...(academicPeriod ? { academic_period: academicPeriod } : {}),
      ...(programId ? { beneficiary: { program_id: programId } } : {}),
      ...(district ? { beneficiary: { district } } : {}),
      ...(schoolId ? { beneficiary: { school_id: schoolId } } : {}),
    },
  });

  const safeRate = (count: number, total: number) =>
    total > 0 ? parseFloat(((count / total) * 100).toFixed(2)) : 0;

  res.json({
    status: 'success',
    data: {
      total_active_beneficiaries: totalActiveBeneficiaries,
      completion: { count: completionCount, rate: safeRate(completionCount, totalActiveBeneficiaries) },
      graduation: { count: graduationCount, rate: safeRate(graduationCount, totalActiveBeneficiaries) },
      dropout: { count: exitCount, rate: safeRate(exitCount, totalActiveBeneficiaries) },
      progression: { count: promotedCount, rate: safeRate(promotedCount, totalPerformanceRecords) },
      filters: { program_id: programId || null, academic_period: academicPeriod || null, district: district || null, school_id: schoolId || null },
    },
    message: 'Program metrics retrieved successfully',
  });
}
