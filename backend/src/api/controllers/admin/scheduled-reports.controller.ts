import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { executeReportDefinition } from '../../../modules/reporting';

const createSchema = z.object({
  report_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  cron_expression: z.string().min(1).max(100),
  format: z.enum(['csv', 'pdf', 'xlsx']).default('pdf'),
  recipients: z.array(z.string().email()).min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cron_expression: z.string().min(1).max(100).optional(),
  format: z.enum(['csv', 'pdf', 'xlsx']).optional(),
  recipients: z.array(z.string().email()).min(1).optional(),
});

/**
 * @openapi
 * /admin/scheduled-reports:
 *   get:
 *     tags: [Reports]
 *     summary: List scheduled reports with pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: report_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: enabled
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of scheduled reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                     report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     name: Monthly Disbursement Email
 *                     cron_expression: 0 8 1 * *
 *                     format: pdf
 *                     recipients:
 *                       - finance@presstrust.org
 *                       - director@presstrust.org
 *                     enabled: true
 *                     last_run_at: 2026-06-01T08:00:00.000Z
 *                     next_run_at: 2026-07-01T08:00:00.000Z
 *                     created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                     report:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Quarterly Disbursement Summary
 *                       source: disbursements
 *                     creator:
 *                       id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                       name: Grace Mwale
 *                       email: grace.mwale@presstrust.org
 *                     _count:
 *                       runs: 6
 *                     created_at: 2026-01-20T10:00:00.000Z
 *                     updated_at: 2026-06-01T08:05:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Scheduled reports retrieved successfully
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
export async function listScheduledReports(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.report_id) where.report_id = req.query.report_id;
  if (req.query.enabled !== undefined) where.enabled = req.query.enabled === 'true';

  const [items, total] = await Promise.all([
    prisma.scheduledReport.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        report: { select: { id: true, name: true, source: true } },
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { runs: true } },
      },
    }),
    prisma.scheduledReport.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Scheduled reports retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/scheduled-reports:
 *   post:
 *     tags: [Reports]
 *     summary: Create a new scheduled report
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [report_id, name, cron_expression, recipients]
 *             properties:
 *               report_id: { type: string, format: uuid }
 *               name: { type: string, maxLength: 200 }
 *               cron_expression: { type: string, maxLength: 100 }
 *               format: { type: string, enum: [csv, pdf, xlsx], default: pdf }
 *               recipients:
 *                 type: array
 *                 items: { type: string, format: email }
 *           example:
 *             report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *             name: Monthly Disbursement Email
 *             cron_expression: 0 8 1 * *
 *             format: pdf
 *             recipients:
 *               - finance@presstrust.org
 *               - director@presstrust.org
 *     responses:
 *       201:
 *         description: Scheduled report created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                 report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Monthly Disbursement Email
 *                 cron_expression: 0 8 1 * *
 *                 format: pdf
 *                 recipients:
 *                   - finance@presstrust.org
 *                   - director@presstrust.org
 *                 enabled: true
 *                 last_run_at: null
 *                 next_run_at: 2026-07-23T08:31:00.000Z
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 created_at: 2026-07-23T08:30:00.000Z
 *                 updated_at: 2026-07-23T08:30:00.000Z
 *               message: Scheduled report created successfully
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
export async function createScheduledReport(req: Request, res: Response): Promise<void> {
  const body = createSchema.parse(req.body);

  const report = await prisma.reportDefinition.findUnique({ where: { id: body.report_id } });
  if (!report) {
    res.status(404).json({ status: 'error', data: null, message: 'Report definition not found' });
    return;
  }

  const nextRun = computeNextRun(body.cron_expression);

  const record = await prisma.scheduledReport.create({
    data: {
      report_id: body.report_id,
      name: body.name,
      cron_expression: body.cron_expression,
      format: body.format,
      recipients: body.recipients as any,
      enabled: true,
      next_run_at: nextRun,
      created_by: req.user!.userId,
    },
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'CREATE_SCHEDULED_REPORT',
    entity_type: 'ScheduledReport',
    entity_id: record.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: record, message: 'Scheduled report created successfully' });
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}:
 *   get:
 *     tags: [Reports]
 *     summary: Get a scheduled report by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Scheduled report detail
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                 report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Monthly Disbursement Email
 *                 cron_expression: 0 8 1 * *
 *                 format: pdf
 *                 recipients:
 *                   - finance@presstrust.org
 *                   - director@presstrust.org
 *                 enabled: true
 *                 last_run_at: 2026-06-01T08:00:00.000Z
 *                 next_run_at: 2026-07-01T08:00:00.000Z
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 report:
 *                   id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Quarterly Disbursement Summary
 *                   source: disbursements
 *                   fields:
 *                     - identifier
 *                     - beneficiary
 *                     - amount
 *                     - status
 *                     - academic_period
 *                   filters:
 *                     period: 2026-T2
 *                 creator:
 *                   id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                   name: Grace Mwale
 *                   email: grace.mwale@presstrust.org
 *                 created_at: 2026-01-20T10:00:00.000Z
 *                 updated_at: 2026-06-01T08:05:00.000Z
 *               message: Scheduled report retrieved successfully
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
 *         description: Scheduled report not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Scheduled report not found
 */
export async function getScheduledReport(req: Request, res: Response): Promise<void> {
  const record = await prisma.scheduledReport.findUnique({
    where: { id: req.params.id },
    include: {
      report: { select: { id: true, name: true, source: true, fields: true, filters: true } },
      creator: { select: { id: true, name: true, email: true } },
    },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Scheduled report not found' });
    return;
  }

  res.json({ status: 'success', data: record, message: 'Scheduled report retrieved successfully' });
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}:
 *   put:
 *     tags: [Reports]
 *     summary: Update a scheduled report
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
 *               cron_expression: { type: string, maxLength: 100 }
 *               format: { type: string, enum: [csv, pdf, xlsx] }
 *               recipients:
 *                 type: array
 *                 items: { type: string, format: email }
 *           example:
 *             cron_expression: 0 8 15 * *
 *             recipients:
 *               - finance@presstrust.org
 *     responses:
 *       200:
 *         description: Scheduled report updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                 report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Monthly Disbursement Email
 *                 cron_expression: 0 8 15 * *
 *                 format: pdf
 *                 recipients:
 *                   - finance@presstrust.org
 *                 enabled: true
 *                 last_run_at: 2026-06-01T08:00:00.000Z
 *                 next_run_at: 2026-07-23T08:31:00.000Z
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 created_at: 2026-01-20T10:00:00.000Z
 *                 updated_at: 2026-07-23T08:31:00.000Z
 *               message: Scheduled report updated successfully
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
 *         description: Scheduled report not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Scheduled report not found
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
export async function updateScheduledReport(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);

  const existing = await prisma.scheduledReport.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Scheduled report not found' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.cron_expression !== undefined) {
    data.cron_expression = body.cron_expression;
    data.next_run_at = computeNextRun(body.cron_expression);
  }
  if (body.format !== undefined) data.format = body.format;
  if (body.recipients !== undefined) data.recipients = body.recipients;

  const updated = await prisma.scheduledReport.update({
    where: { id: req.params.id },
    data,
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'UPDATE_SCHEDULED_REPORT',
    entity_type: 'ScheduledReport',
    entity_id: updated.id,
    old_values: existing,
    new_values: data,
  });

  res.json({ status: 'success', data: updated, message: 'Scheduled report updated successfully' });
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}:
 *   delete:
 *     tags: [Reports]
 *     summary: Delete a scheduled report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Scheduled report deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Scheduled report deleted successfully
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
 *         description: Scheduled report not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Scheduled report not found
 */
export async function deleteScheduledReport(req: Request, res: Response): Promise<void> {
  const existing = await prisma.scheduledReport.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Scheduled report not found' });
    return;
  }

  await prisma.scheduledReport.delete({ where: { id: req.params.id } });

  await logAudit({
    user_id: req.user!.userId,
    action: 'DELETE_SCHEDULED_REPORT',
    entity_type: 'ScheduledReport',
    entity_id: req.params.id,
    old_values: { name: existing.name },
  });

  res.json({ status: 'success', data: null, message: 'Scheduled report deleted successfully' });
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}/toggle:
 *   patch:
 *     tags: [Reports]
 *     summary: Enable or disable a scheduled report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Scheduled report enabled/disabled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                 report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Monthly Disbursement Email
 *                 cron_expression: 0 8 1 * *
 *                 format: pdf
 *                 recipients:
 *                   - finance@presstrust.org
 *                   - director@presstrust.org
 *                 enabled: false
 *                 last_run_at: 2026-06-01T08:00:00.000Z
 *                 next_run_at: 2026-07-01T08:00:00.000Z
 *                 created_by: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                 created_at: 2026-01-20T10:00:00.000Z
 *                 updated_at: 2026-07-23T08:32:00.000Z
 *               message: Scheduled report disabled successfully
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
 *         description: Scheduled report not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Scheduled report not found
 */
export async function toggleScheduledReport(req: Request, res: Response): Promise<void> {
  const existing = await prisma.scheduledReport.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Scheduled report not found' });
    return;
  }

  const updated = await prisma.scheduledReport.update({
    where: { id: req.params.id },
    data: { enabled: !existing.enabled },
  });

  await logAudit({
    user_id: req.user!.userId,
    action: updated.enabled ? 'ENABLE_SCHEDULED_REPORT' : 'DISABLE_SCHEDULED_REPORT',
    entity_type: 'ScheduledReport',
    entity_id: req.params.id,
    old_values: { enabled: existing.enabled },
    new_values: { enabled: updated.enabled },
  });

  res.json({ status: 'success', data: updated, message: `Scheduled report ${updated.enabled ? 'enabled' : 'disabled'} successfully` });
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}/run-now:
 *   post:
 *     tags: [Reports]
 *     summary: Execute a scheduled report immediately (writes the file to storage instead of streaming it)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Report executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 format: pdf
 *                 rows: 214
 *                 file_url: uploads/reports/Quarterly_Disbursement_Summary_2026-07-23T08-32-00.pdf
 *                 file_name: Quarterly_Disbursement_Summary_2026-07-23T08-32-00.pdf
 *               message: Report executed successfully
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
 *         description: Scheduled report not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Scheduled report not found
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
export async function runNowScheduledReport(req: Request, res: Response): Promise<void> {
  const schedule = await prisma.scheduledReport.findUnique({
    where: { id: req.params.id },
    include: { report: true },
  });

  if (!schedule) {
    res.status(404).json({ status: 'error', data: null, message: 'Scheduled report not found' });
    return;
  }

  try {
    const result = await executeReportDefinition({
      reportDefinitionId: schedule.report_id,
      format: schedule.format as any,
      triggeredBy: 'manual',
      scheduleId: schedule.id,
    });

    res.json({
      status: 'success',
      data: {
        format: result.format,
        rows: result.rows,
        file_url: result.fileUrl,
        file_name: result.fileName,
      },
      message: 'Report executed successfully',
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', data: null, message: err.message });
  }
}

/**
 * @openapi
 * /admin/scheduled-reports/{id}/runs:
 *   get:
 *     tags: [Reports]
 *     summary: List run logs for a scheduled report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of run logs for the schedule
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 9d2b7e4a-1234-4a5b-9c8d-7e6f5a4b3c2d
 *                     schedule_id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                     report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     status: completed
 *                     format: pdf
 *                     error_message: null
 *                     file_url: uploads/reports/Quarterly_Disbursement_Summary_2026-06-01T08-00-00.pdf
 *                     row_count: 214
 *                     started_at: 2026-06-01T08:00:00.000Z
 *                     completed_at: 2026-06-01T08:00:12.000Z
 *                     triggered_by: scheduled
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Schedule run logs retrieved successfully
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
export async function getScheduleRuns(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = { schedule_id: req.params.id };

  const [items, total] = await Promise.all([
    prisma.reportRunLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { started_at: 'desc' },
    }),
    prisma.reportRunLog.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Schedule run logs retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/report-runs:
 *   get:
 *     tags: [Reports]
 *     summary: List all report run logs across all schedules
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [completed, failed, running] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of report run logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 9d2b7e4a-1234-4a5b-9c8d-7e6f5a4b3c2d
 *                     schedule_id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                     report_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     status: completed
 *                     format: pdf
 *                     error_message: null
 *                     file_url: uploads/reports/Quarterly_Disbursement_Summary_2026-06-01T08-00-00.pdf
 *                     row_count: 214
 *                     started_at: 2026-06-01T08:00:00.000Z
 *                     completed_at: 2026-06-01T08:00:12.000Z
 *                     triggered_by: scheduled
 *                     report:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Quarterly Disbursement Summary
 *                       source: disbursements
 *                     schedule:
 *                       id: 5b1c9f2e-3a4d-4e6f-8b2a-1c2d3e4f5a6b
 *                       name: Monthly Disbursement Email
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Report run logs retrieved successfully
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
export async function getAllReportRuns(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;

  const [items, total] = await Promise.all([
    prisma.reportRunLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { started_at: 'desc' },
      include: {
        report: { select: { id: true, name: true, source: true } },
        schedule: { select: { id: true, name: true } },
      },
    }),
    prisma.reportRunLog.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Report run logs retrieved successfully',
  });
}

function computeNextRun(cronExpression: string): Date {
  const next = new Date();
  next.setMinutes(next.getMinutes() + 1);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}
