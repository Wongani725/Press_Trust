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
  funding_source_ids: z.array(z.string().uuid()).optional(),
  required_documents: z.array(z.string().min(1)).optional(),
});

const updateProgramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  application_open_date: z.string().datetime().optional(),
  application_close_date: z.string().datetime().optional(),
  award_types: z.array(z.enum(['one_off', 'recurring', 'renewable'])).optional(),
  funding_source_ids: z.array(z.string().uuid()).optional(),
  required_documents: z.array(z.string().min(1)).optional(),
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

async function syncProgramFundingSources(programId: string, fundingSourceIds: string[]): Promise<void> {
  if (fundingSourceIds.length > 0) {
    const sources = await prisma.fundingSource.findMany({ where: { id: { in: fundingSourceIds } } });
    if (sources.length !== fundingSourceIds.length) {
      const found = new Set(sources.map((s) => s.id));
      const missing = fundingSourceIds.filter((id) => !found.has(id));
      throw Object.assign(new Error(`Unknown funding source id(s): ${missing.join(', ')}`), { statusCode: 400 });
    }
  }

  await prisma.programFundingSource.deleteMany({ where: { program_id: programId } });
  if (fundingSourceIds.length > 0) {
    await prisma.programFundingSource.createMany({
      data: fundingSourceIds.map((funding_source_id) => ({ program_id: programId, funding_source_id })),
    });
  }
}

function mapFundingSources(program: any) {
  return (program.funding_sources || []).map((link: any) => ({
    id: link.funding_source.id,
    name: link.funding_source.name,
  }));
}

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
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                     name: Secondary School Bursary 2026
 *                     description: Bursary support for secondary school students in Blantyre, Zomba, and Mzuzu districts
 *                     status: Open
 *                     application_open_date: '2026-01-05T00:00:00.000Z'
 *                     application_close_date: '2026-02-28T00:00:00.000Z'
 *                     budget_ceiling: 50000000
 *                     budget_utilized: 12500000
 *                     award_types: [recurring, renewable]
 *                     beneficiary_count: 34
 *                     award_count: 34
 *                     created_at: '2025-12-01T08:00:00.000Z'
 *                     updated_at: '2026-01-15T09:30:00.000Z'
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Programs retrieved successfully
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
export async function listPrograms(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const status = req.query.status as string | undefined;
  const fundingSourceId = req.query.fundingSourceId as string | undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (fundingSourceId) {
    where.OR = [
      { awards: { some: { funding_source_id: fundingSourceId } } },
      { funding_sources: { some: { funding_source_id: fundingSourceId } } },
    ];
  }

  const [programs, total] = await Promise.all([
    prisma.program.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { beneficiaries: true, awards: true } },
        funding_sources: { include: { funding_source: { select: { id: true, name: true } } } },
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
    funding_sources: mapFundingSources(p),
    required_documents: p.required_documents || [],
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 name: Secondary School Bursary 2026
 *                 description: Bursary support for secondary school students in Blantyre, Zomba, and Mzuzu districts
 *                 status: Draft
 *                 budget_ceiling: 50000000
 *                 award_types: [recurring, renewable]
 *                 created_at: '2025-12-01T08:00:00.000Z'
 *               message: Program created successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: { details: [{ field: name, message: String must contain at least 1 character(s) }] }
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
      required_documents: body.required_documents ?? [],
      status: 'Draft',
    },
  });

  if (body.funding_source_ids) {
    try {
      await syncProgramFundingSources(program.id, body.funding_source_ids);
    } catch (e: any) {
      await prisma.program.delete({ where: { id: program.id } });
      res.status(e.statusCode || 400).json({ status: 'error', data: null, message: e.message });
      return;
    }
  }

  const withSources = await prisma.program.findUnique({
    where: { id: program.id },
    include: { funding_sources: { include: { funding_source: { select: { id: true, name: true } } } } },
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
      funding_sources: mapFundingSources(withSources),
      required_documents: program.required_documents || [],
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 name: Secondary School Bursary 2026
 *                 description: Bursary support for secondary school students in Blantyre, Zomba, and Mzuzu districts
 *                 status: Open
 *                 application_open_date: '2026-01-05T00:00:00.000Z'
 *                 application_close_date: '2026-02-28T00:00:00.000Z'
 *                 budget_ceiling: 50000000
 *                 budget_utilized: 12500000
 *                 award_types: [recurring, renewable]
 *                 eligibility_rules: { min_age: 12, max_age: 20, max_household_income: 300000 }
 *                 evaluation_rubric: { academic_performance: 40, financial_need: 40, interview: 20 }
 *                 workflow_config: { requires_interview: true, approval_levels: 2 }
 *                 form_config: { fields: [national_id, school_id, guardian_contact] }
 *                 beneficiary_count: 34
 *                 award_count: 34
 *                 disbursement_count: 68
 *                 created_at: '2025-12-01T08:00:00.000Z'
 *                 updated_at: '2026-01-15T09:30:00.000Z'
 *               message: Program retrieved successfully
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
 *         description: Program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Program not found
 */
export async function getProgram(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const program = await prisma.program.findUnique({
    where: { id },
    include: {
      _count: { select: { beneficiaries: true, awards: true, disbursements: true } },
      funding_sources: { include: { funding_source: { select: { id: true, name: true } } } },
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
      funding_sources: mapFundingSources(p),
      required_documents: p.required_documents || [],
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 name: Secondary School Bursary 2026 (Revised)
 *                 description: Bursary support for secondary school students in Blantyre, Zomba, Lilongwe, and Mzuzu districts
 *                 status: Open
 *                 updated_at: '2026-01-20T14:00:00.000Z'
 *               message: Program updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Validation error
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
 *         description: Program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Program not found
 *       422:
 *         description: Cannot modify archived program
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Cannot modify archived program
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
      ...(body.required_documents !== undefined ? { required_documents: body.required_documents } : {}),
    },
  });

  if (body.funding_source_ids) {
    try {
      await syncProgramFundingSources(id, body.funding_source_ids);
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ status: 'error', data: null, message: e.message });
      return;
    }
  }

  const withSources = await prisma.program.findUnique({
    where: { id },
    include: { funding_sources: { include: { funding_source: { select: { id: true, name: true } } } } },
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
      funding_sources: mapFundingSources(withSources),
      required_documents: updated.required_documents || [],
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 status: Open
 *               message: Program status updated to Open
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Validation error
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
 *         description: Program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Program not found
 *       422:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 currentStatus: Draft
 *                 requestedStatus: Closed
 *                 allowedTransitions: [Open]
 *               message: Invalid status transition from Draft to Closed
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 budget_ceiling: 60000000
 *               message: Program budget updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Validation error
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
 *         description: Program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Program not found
 *       422:
 *         description: Cannot modify archived program
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Cannot modify archived program
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 1b2c3d4e-5f60-4718-9a2b-c3d4e5f60718
 *                 eligibility_rules: { min_age: 12, max_age: 20, max_household_income: 300000 }
 *                 evaluation_rubric: { academic_performance: 40, financial_need: 40, interview: 20 }
 *                 workflow_config: { requires_interview: true, approval_levels: 2 }
 *                 form_config: { fields: [national_id, school_id, guardian_contact] }
 *               message: Program configuration updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Validation error
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
 *         description: Program not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Program not found
 *       422:
 *         description: Cannot modify archived program
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Cannot modify archived program
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
