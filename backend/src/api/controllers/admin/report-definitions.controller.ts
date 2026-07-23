import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { getAllReportSources, executeReportDefinition, getReportSource } from '../../../modules/reporting';
import { logExport, sendExport, ExportFormat } from '../../../modules/reporting/export.service';
import { generateCsv, generatePdf, generateXlsx } from '../../../modules/reporting/export.service';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  source: z.enum(['beneficiaries', 'awards', 'disbursements', 'budget', 'payments_by_school', 'me_outcomes', 'reconciliation']),
  fields: z.array(z.string()).min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  source: z.enum(['beneficiaries', 'awards', 'disbursements', 'budget', 'payments_by_school', 'me_outcomes', 'reconciliation']).optional(),
  fields: z.array(z.string()).min(1).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  sort_by: z.string().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

/**
 * @openapi
 * /admin/report-definitions:
 *   get:
 *     tags: [Reports]
 *     summary: List report definitions with pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: source
 *         schema: { type: string, enum: [beneficiaries, awards, disbursements, budget, payments_by_school, me_outcomes, reconciliation] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of report definitions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     name: Quarterly Disbursement Summary
 *                     description: Disbursements by district and program for Q2 2026
 *                     source: disbursements
 *                     fields:
 *                       - identifier
 *                       - beneficiary
 *                       - amount
 *                       - status
 *                       - academic_period
 *                     filters:
 *                       period: 2026-T2
 *                     sort_by: created_at
 *                     sort_order: desc
 *                     created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                     creator:
 *                       id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                       name: Grace Mwale
 *                       email: grace.mwale@presstrust.org
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-15T09:30:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Report definitions retrieved successfully
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
export async function listReportDefinitions(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.source) where.source = req.query.source;

  const [items, total] = await Promise.all([
    prisma.reportDefinition.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { creator: { select: { id: true, name: true, email: true } } },
    }),
    prisma.reportDefinition.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Report definitions retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/report-definitions:
 *   post:
 *     tags: [Reports]
 *     summary: Create a new report definition
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, source, fields]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               description: { type: string, maxLength: 500 }
 *               source: { type: string, enum: [beneficiaries, awards, disbursements, budget, payments_by_school, me_outcomes, reconciliation] }
 *               fields:
 *                 type: array
 *                 items: { type: string }
 *               filters:
 *                 type: object
 *                 additionalProperties: true
 *               sort_by: { type: string }
 *               sort_order: { type: string, enum: [asc, desc] }
 *           example:
 *             name: Quarterly Disbursement Summary
 *             description: Disbursements by district and program for Q2 2026
 *             source: disbursements
 *             fields:
 *               - identifier
 *               - beneficiary
 *               - amount
 *               - status
 *               - academic_period
 *             filters:
 *               period: 2026-T2
 *             sort_by: created_at
 *             sort_order: desc
 *     responses:
 *       201:
 *         description: Report definition created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Quarterly Disbursement Summary
 *                 description: Disbursements by district and program for Q2 2026
 *                 source: disbursements
 *                 fields:
 *                   - identifier
 *                   - beneficiary
 *                   - amount
 *                   - status
 *                   - academic_period
 *                 filters:
 *                   period: 2026-T2
 *                 sort_by: created_at
 *                 sort_order: desc
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Report definition created successfully
 *       400:
 *         description: Unknown report source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid report source
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
 *       422:
 *         description: One or more requested fields are not valid columns for the chosen source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: 'Invalid fields: gpa_score, invalid_column'
 *       500:
 *         description: Unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: An unexpected error occurred
 */
export async function createReportDefinition(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);

  const source = getReportSource(body.source);
  if (!source) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid report source' });
    return;
  }

  const invalidFields = body.fields.filter((f) => !source.columns.find((c) => c.key === f));
  if (invalidFields.length > 0) {
    res.status(422).json({ status: 'error', data: null, message: `Invalid fields: ${invalidFields.join(', ')}` });
    return;
  }

  const record = await prisma.reportDefinition.create({
    data: {
      name: body.name,
      description: body.description || null,
      source: body.source,
      fields: body.fields as any,
      filters: (body.filters as any) || null,
      sort_by: body.sort_by || null,
      sort_order: body.sort_order || 'desc',
      created_by: req.user!.userId,
    },
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'CREATE_REPORT_DEFINITION',
    entity_type: 'ReportDefinition',
    entity_id: record.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: record, message: 'Report definition created successfully' });
}

/**
 * @openapi
 * /admin/report-definitions/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Get a report definition by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Report definition detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Quarterly Disbursement Summary
 *                 description: Disbursements by district and program for Q2 2026
 *                 source: disbursements
 *                 fields:
 *                   - identifier
 *                   - beneficiary
 *                   - amount
 *                   - status
 *                   - academic_period
 *                 filters:
 *                   period: 2026-T2
 *                 sort_by: created_at
 *                 sort_order: desc
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 creator:
 *                   id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                   name: Grace Mwale
 *                   email: grace.mwale@presstrust.org
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Report definition retrieved successfully
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
 *         description: Report definition not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Report definition not found
 */
export async function getReportDefinition(req: Request, res: Response): Promise<void> {
  const record = await prisma.reportDefinition.findUnique({
    where: { id: req.params.id },
    include: { creator: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Report definition not found' });
    return;
  }

  res.json({ status: 'success', data: record, message: 'Report definition retrieved successfully' });
}

/**
 * @openapi
 * /admin/report-definitions/{id}:
 *   put:
 *     tags: [Reports]
 *     summary: Update a report definition
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
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               description: { type: string, maxLength: 500 }
 *               source: { type: string, enum: [beneficiaries, awards, disbursements, budget, payments_by_school, me_outcomes, reconciliation] }
 *               fields:
 *                 type: array
 *                 items: { type: string }
 *               filters:
 *                 type: object
 *                 additionalProperties: true
 *               sort_by: { type: string }
 *               sort_order: { type: string, enum: [asc, desc] }
 *           example:
 *             name: Quarterly Disbursement Summary (Revised)
 *             sort_order: asc
 *     responses:
 *       200:
 *         description: Report definition updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Quarterly Disbursement Summary (Revised)
 *                 description: Disbursements by district and program for Q2 2026
 *                 source: disbursements
 *                 fields:
 *                   - identifier
 *                   - beneficiary
 *                   - amount
 *                   - status
 *                   - academic_period
 *                 filters:
 *                   period: 2026-T2
 *                 sort_by: created_at
 *                 sort_order: asc
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-07-23T08:00:00.000Z
 *               message: Report definition updated successfully
 *       400:
 *         description: Unknown report source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid report source
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
 *         description: Report definition not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Report definition not found
 *       422:
 *         description: One or more requested fields are not valid columns for the chosen source
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: 'Invalid fields: gpa_score, invalid_column'
 *       500:
 *         description: Unexpected error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: An unexpected error occurred
 */
export async function updateReportDefinition(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);

  const existing = await prisma.reportDefinition.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Report definition not found' });
    return;
  }

  if (body.source) {
    const source = getReportSource(body.source);
    if (!source) {
      res.status(400).json({ status: 'error', data: null, message: 'Invalid report source' });
      return;
    }
    const fieldsToCheck = body.fields || (existing.fields as string[]);
    const invalidFields = fieldsToCheck.filter((f) => !source.columns.find((c) => c.key === f));
    if (invalidFields.length > 0) {
      res.status(422).json({ status: 'error', data: null, message: `Invalid fields: ${invalidFields.join(', ')}` });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.source !== undefined) data.source = body.source;
  if (body.fields !== undefined) data.fields = body.fields;
  if (body.filters !== undefined) data.filters = body.filters;
  if (body.sort_by !== undefined) data.sort_by = body.sort_by;
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;

  const updated = await prisma.reportDefinition.update({
    where: { id: req.params.id },
    data,
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'UPDATE_REPORT_DEFINITION',
    entity_type: 'ReportDefinition',
    entity_id: updated.id,
    old_values: existing,
    new_values: data,
  });

  res.json({ status: 'success', data: updated, message: 'Report definition updated successfully' });
}

/**
 * @openapi
 * /admin/report-definitions/{id}:
 *   delete:
 *     tags: [Reports]
 *     summary: Delete a report definition (also removes its run logs and schedules)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Report definition deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Report definition deleted successfully
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
 *         description: Report definition not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Report definition not found
 */
export async function deleteReportDefinition(req: Request, res: Response): Promise<void> {
  const existing = await prisma.reportDefinition.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Report definition not found' });
    return;
  }

  await prisma.reportRunLog.deleteMany({ where: { report_id: req.params.id } });
  await prisma.scheduledReport.deleteMany({ where: { report_id: req.params.id } });
  await prisma.reportDefinition.delete({ where: { id: req.params.id } });

  await logAudit({
    user_id: req.user!.userId,
    action: 'DELETE_REPORT_DEFINITION',
    entity_type: 'ReportDefinition',
    entity_id: req.params.id,
    old_values: { name: existing.name, source: existing.source },
  });

  res.json({ status: 'success', data: null, message: 'Report definition deleted successfully' });
}

/**
 * @openapi
 * /admin/report-definitions/sources:
 *   get:
 *     tags: [Reports]
 *     summary: List available report data sources and their selectable fields
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available report sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 sources:
 *                   - key: beneficiaries
 *                     name: Beneficiaries
 *                     description: Beneficiary register with demographic and program details
 *                     columns:
 *                       - { key: identifier, header: Beneficiary ID }
 *                       - { key: name, header: Full Name }
 *                       - { key: district, header: District }
 *                     filterFields:
 *                       - { key: program_id, label: Program, type: string }
 *                       - { key: district, label: District, type: string }
 *                   - key: budget
 *                     name: Budget Utilization
 *                     description: Program budget ceilings, utilized amounts, and remaining balances
 *                     columns:
 *                       - { key: name, header: Program }
 *                       - { key: budget_ceiling, header: Budget Ceiling }
 *                       - { key: percentage, header: Utilization % }
 *                     filterFields: []
 *               message: Report sources retrieved successfully
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
export async function getReportSources(req: Request, res: Response): Promise<void> {
  const sources = getAllReportSources();
  res.json({ status: 'success', data: { sources }, message: 'Report sources retrieved successfully' });
}

/**
 * @openapi
 * /admin/report-definitions/{id}/execute:
 *   post:
 *     tags: [Reports]
 *     summary: Execute a report definition immediately and download the generated file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, pdf, xlsx], default: csv }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filters:
 *                 type: object
 *                 additionalProperties: true
 *           example:
 *             filters:
 *               period: 2026-T3
 *     responses:
 *       200:
 *         description: Generated report file in the requested format
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
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
 *         description: Report definition not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Report definition not found
 *       500:
 *         description: Report generation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: 'Unknown report source: invalid_source'
 */
export async function executeReportDefinitionHandler(req: Request, res: Response): Promise<void> {
  const format = (req.query.format as string || 'csv') as ExportFormat;
  const filtersOverride = req.body?.filters || undefined;

  try {
    const result = await executeReportDefinition({
      reportDefinitionId: req.params.id,
      format: ['csv', 'pdf', 'xlsx'].includes(format) ? format : 'csv',
      filtersOverride,
      triggeredBy: 'manual',
    });

    await logExport(req.user!.userId, 'report_definition_execute', result.format, { reportId: req.params.id });

    const extension = result.format === 'xlsx' ? 'xlsx' : result.format;
    const contentTypeMap: Record<string, string> = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    sendExport(res, result.format as any, result.fileName.replace(`.${extension}`, ''), result.buffer, contentTypeMap[result.format] || 'application/octet-stream');
  } catch (err: any) {
    if (err.message === 'Report definition not found') {
      res.status(404).json({ status: 'error', data: null, message: err.message });
      return;
    }
    res.status(500).json({ status: 'error', data: null, message: err.message });
  }
}
