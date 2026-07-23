import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';

const createProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  application_open_date: z.string().datetime().optional(),
  application_close_date: z.string().datetime().optional(),
  budget_ceiling: z.number().min(0).optional(),
  award_types: z.array(z.enum(['one_off', 'recurring', 'renewable'])).optional(),
});

const updateProgramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  application_open_date: z.string().datetime().optional(),
  application_close_date: z.string().datetime().optional(),
  award_types: z.array(z.enum(['one_off', 'recurring', 'renewable'])).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Open', 'Closed', 'Archived']),
  reason: z.string().optional(),
});

const updateBudgetSchema = z.object({
  budget_ceiling: z.number().min(0),
});

const updateConfigSchema = z.object({
  eligibility_rules: z.object({}).passthrough().optional(),
  evaluation_rubric: z.object({}).passthrough().optional(),
  workflow_config: z.object({}).passthrough().optional(),
  form_config: z.object({}).passthrough().optional(),
});

const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Open'],
  Open: ['Closed'],
  Closed: ['Archived', 'Open'],
  Archived: [],
};

/**
 * @openapi
 * /admin/programs:
 *   get:
 *     tags: [Programs]
 *     summary: List programs with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: fundingSourceId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of programs
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function listPrograms(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const status = req.query.status as string | undefined;
  const fundingSourceId = req.query.fundingSourceId as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (fundingSourceId) {
    where.awards = { some: { funding_source_id: fundingSourceId } };
  }

  const [programs, total] = await Promise.all([
    prisma.program.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { beneficiaries: true, awards: true } },
      },
    }),
    prisma.program.count({ where }),
  ]);

  const data = programs.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    application_open_date: p.application_open_date,
    application_close_date: p.application_close_date,
    budget_ceiling: p.budget_ceiling,
    budget_utilized: p.budget_utilized,
    award_types: p.award_types,
    beneficiary_count: p._count.beneficiaries,
    award_count: p._count.awards,
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Programs retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/programs:
 *   post:
 *     tags: [Programs]
 *     summary: Create a new scholarship program
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProgramCreate'
 *     responses:
 *       201:
 *         description: Program created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function createProgram(req: Request, res: Response): Promise<void> {
  const body = createProgramSchema.parse(req.body);

  const program = await prisma.program.create({
    data: {
      name: body.name,
      description: body.description,
      application_open_date: body.application_open_date ? new Date(body.application_open_date) : null,
      application_close_date: body.application_close_date ? new Date(body.application_close_date) : null,
      budget_ceiling: body.budget_ceiling ?? 0,
      award_types: body.award_types ?? [],
      status: 'Draft',
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Program',
    entity_id: program.id,
    new_values: body,
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: program.id,
      name: program.name,
      description: program.description,
      status: program.status,
      budget_ceiling: program.budget_ceiling,
      award_types: program.award_types,
      created_at: program.created_at,
    },
    message: 'Program created successfully',
  });
}

/**
 * @openapi
 * /admin/programs/{id}:
 *   get:
 *     tags: [Programs]
 *     summary: Get program details by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Program details
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Program not found
 */
export async function getProgram(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      _count: { select: { beneficiaries: true, awards: true, disbursements: true } },
    },
  });

  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  const p = program as any;
  res.json({
    status: 'success',
    data: {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      application_open_date: p.application_open_date,
      application_close_date: p.application_close_date,
      budget_ceiling: p.budget_ceiling,
      budget_utilized: p.budget_utilized,
      award_types: p.award_types,
      eligibility_rules: p.eligibility_rules,
      evaluation_rubric: p.evaluation_rubric,
      workflow_config: p.workflow_config,
      form_config: p.form_config,
      beneficiary_count: p._count.beneficiaries,
      award_count: p._count.awards,
      disbursement_count: p._count.disbursements,
      created_at: p.created_at,
      updated_at: p.updated_at,
    },
    message: 'Program retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/programs/{id}:
 *   put:
 *     tags: [Programs]
 *     summary: Update program details
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
 *             $ref: '#/components/schemas/ProgramUpdate'
 *     responses:
 *       200:
 *         description: Program updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Program not found
 *       422:
 *         description: Cannot modify archived program
 */
export async function updateProgram(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateProgramSchema.parse(req.body);

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  if (program.status === 'Archived') {
    res.status(422).json({ status: 'error', data: null, message: 'Cannot modify archived program' });
    return;
  }

  const oldValues = {
    name: program.name,
    description: program.description,
    application_open_date: program.application_open_date,
    application_close_date: program.application_close_date,
    award_types: program.award_types,
  };

  const updated = await prisma.program.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      application_open_date: body.application_open_date ? new Date(body.application_open_date) : undefined,
      application_close_date: body.application_close_date ? new Date(body.application_close_date) : undefined,
      award_types: body.award_types,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Program',
    entity_id: id,
    old_values: oldValues,
    new_values: body,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      status: updated.status,
      updated_at: updated.updated_at,
    },
    message: 'Program updated successfully',
  });
}

/**
 * @openapi
 * /admin/programs/{id}/status:
 *   patch:
 *     tags: [Programs]
 *     summary: Change program status with state machine validation
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
 *             $ref: '#/components/schemas/ProgramStatusUpdate'
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
 *         description: Program not found
 *       422:
 *         description: Invalid status transition
 */
export async function updateProgramStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, reason } = updateStatusSchema.parse(req.body);

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  const currentStatus = program.status;
  const allowedTransitions = VALID_STATUS_TRANSITIONS[currentStatus] || [];
  if (!allowedTransitions.includes(status)) {
    res.status(422).json({
      status: 'error',
      data: { currentStatus, requestedStatus: status, allowedTransitions },
      message: `Invalid status transition from ${currentStatus} to ${status}`,
    });
    return;
  }

  const updated = await prisma.program.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Program',
    entity_id: id,
    old_values: { status: currentStatus },
    new_values: { status, reason },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
    message: `Program status updated to ${status}`,
  });
}

/**
 * @openapi
 * /admin/programs/{id}/budget:
 *   put:
 *     tags: [Programs]
 *     summary: Update program budget ceiling
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
 *             $ref: '#/components/schemas/ProgramBudgetUpdate'
 *     responses:
 *       200:
 *         description: Budget updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Program not found
 *       422:
 *         description: Cannot modify archived program
 */
export async function updateProgramBudget(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { budget_ceiling } = updateBudgetSchema.parse(req.body);

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  if (program.status === 'Archived') {
    res.status(422).json({ status: 'error', data: null, message: 'Cannot modify archived program' });
    return;
  }

  const oldBudget = program.budget_ceiling;
  const updated = await prisma.program.update({
    where: { id },
    data: { budget_ceiling: budget_ceiling },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'budget_update',
    entity_type: 'Program',
    entity_id: id,
    old_values: { budget_ceiling: oldBudget },
    new_values: { budget_ceiling },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, budget_ceiling: updated.budget_ceiling },
    message: 'Program budget updated successfully',
  });
}

/**
 * @openapi
 * /admin/programs/{id}/config:
 *   put:
 *     tags: [Programs]
 *     summary: Update program configuration (eligibility, rubric, workflow, form)
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
 *             $ref: '#/components/schemas/ProgramConfigUpdate'
 *     responses:
 *       200:
 *         description: Configuration updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Program not found
 *       422:
 *         description: Cannot modify archived program
 */
export async function updateProgramConfig(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateConfigSchema.parse(req.body);

  const program = await prisma.program.findUnique({ where: { id } });
  if (!program) {
    res.status(404).json({ status: 'error', data: null, message: 'Program not found' });
    return;
  }

  if (program.status === 'Archived') {
    res.status(422).json({ status: 'error', data: null, message: 'Cannot modify archived program' });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (body.eligibility_rules !== undefined) updateData.eligibility_rules = body.eligibility_rules as any;
  if (body.evaluation_rubric !== undefined) updateData.evaluation_rubric = body.evaluation_rubric as any;
  if (body.workflow_config !== undefined) updateData.workflow_config = body.workflow_config as any;
  if (body.form_config !== undefined) updateData.form_config = body.form_config as any;

  const updated = await prisma.program.update({
    where: { id },
    data: updateData,
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'config_update',
    entity_type: 'Program',
    entity_id: id,
    old_values: {
      eligibility_rules: program.eligibility_rules,
      evaluation_rubric: program.evaluation_rubric,
      workflow_config: program.workflow_config,
      form_config: program.form_config,
    },
    new_values: body,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      eligibility_rules: updated.eligibility_rules,
      evaluation_rubric: updated.evaluation_rubric,
      workflow_config: updated.workflow_config,
      form_config: updated.form_config,
    },
    message: 'Program configuration updated successfully',
  });
}
