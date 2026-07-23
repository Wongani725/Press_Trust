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
