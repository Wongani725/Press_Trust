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

export async function getReportSources(req: Request, res: Response): Promise<void> {
  const sources = getAllReportSources();
  res.json({ status: 'success', data: { sources }, message: 'Report sources retrieved successfully' });
}

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
