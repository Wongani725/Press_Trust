import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import {
  generateCsv,
  generatePdf,
  generateXlsx,
  logExport as logExportAction,
  sendExport,
  ExportFormat,
  ColumnDef,
} from '../../../modules/reporting/export.service';

const AUDIT_COLUMNS: ColumnDef[] = [
  { key: 'timestamp', header: 'Timestamp' },
  { key: 'user', header: 'User' },
  { key: 'action', header: 'Action' },
  { key: 'entity_type', header: 'Entity Type' },
  { key: 'entity_id', header: 'Entity ID' },
  { key: 'ip_address', header: 'IP Address' },
  { key: 'old_values', header: 'Previous Values' },
  { key: 'new_values', header: 'New Values' },
];

function parseAuditFilters(req: Request): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (req.query.user_id) where.user_id = req.query.user_id;
  if (req.query.action) where.action = req.query.action;
  if (req.query.entity_type) where.entity_type = req.query.entity_type;
  if (req.query.entity_id) where.entity_id = req.query.entity_id;
  if (req.query.from_date || req.query.to_date) {
    where.created_at = {};
    if (req.query.from_date) (where.created_at as Record<string, unknown>).gte = new Date(req.query.from_date as string);
    if (req.query.to_date) (where.created_at as Record<string, unknown>).lte = new Date(req.query.to_date as string);
  }
  return where;
}

function formatAuditRow(entry: any): Record<string, unknown> {
  return {
    timestamp: entry.created_at,
    user: entry.user ? `${entry.user.name} (${entry.user.email})` : 'System',
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    ip_address: entry.ip_address || '',
    old_values: entry.old_values ? JSON.stringify(entry.old_values) : '',
    new_values: entry.new_values ? JSON.stringify(entry.new_values) : '',
  };
}

export async function listAuditLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const where = parseAuditFilters(req);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Audit logs retrieved successfully',
  });
}

export async function getAuditLog(req: Request, res: Response): Promise<void> {
  const record = await prisma.auditLog.findUnique({
    where: { id: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Audit log not found' });
    return;
  }

  res.json({ status: 'success', data: record, message: 'Audit log retrieved successfully' });
}

export async function exportAuditLogs(req: Request, res: Response): Promise<void> {
  const format = (req.query.format as string || 'csv') as ExportFormat;
  const where = parseAuditFilters(req);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: 10000,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  const data = rows.map(formatAuditRow);
  const validFormat = ['csv', 'pdf', 'xlsx'].includes(format) ? format : 'csv';

  await logExportAction(req.user!.userId, 'audit_logs', validFormat, where as Record<string, unknown> | null);

  if (validFormat === 'csv') {
    const csv = generateCsv(data, AUDIT_COLUMNS);
    sendExport(res, 'csv', 'audit_logs', csv, 'text/csv');
  } else if (validFormat === 'pdf') {
    const pdf = await generatePdf('Audit Logs', data, AUDIT_COLUMNS);
    sendExport(res, 'pdf', 'audit_logs', pdf, 'application/pdf');
  } else if (validFormat === 'xlsx') {
    const xlsx = generateXlsx('Audit Logs', data, AUDIT_COLUMNS);
    sendExport(res, 'xlsx', 'audit_logs', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
}
