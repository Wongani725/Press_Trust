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

/**
 * @openapi
 * /admin/audit-logs:
 *   get:
 *     tags: [Audit]
 *     summary: List audit log entries with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: user_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: entity_type
 *         schema: { type: string }
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
 *         description: Paginated list of audit log entries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 9c8b7a6f-5e4d-3c2b-1a09-8f7e6d5c4b3a
 *                     user_id: e5f60718-2b3c-4d5e-6f70-8192a3b4c5d6
 *                     action: approve
 *                     entity_type: Disbursement
 *                     entity_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     old_values:
 *                       status: Requested
 *                     new_values:
 *                       status: Approved
 *                     ip_address: 196.216.223.10
 *                     created_at: 2026-01-16T08:00:00.000Z
 *                     user:
 *                       id: e5f60718-2b3c-4d5e-6f70-8192a3b4c5d6
 *                       name: Grace Mwale
 *                       email: grace.mwale@presstrust.mw
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 312
 *                   totalPages: 16
 *               message: Audit logs retrieved successfully
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

/**
 * @openapi
 * /admin/audit-logs/{id}:
 *   get:
 *     tags: [Audit]
 *     summary: Get a single audit log entry by id
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Audit log entry retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9c8b7a6f-5e4d-3c2b-1a09-8f7e6d5c4b3a
 *                 user_id: e5f60718-2b3c-4d5e-6f70-8192a3b4c5d6
 *                 action: approve
 *                 entity_type: Disbursement
 *                 entity_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 old_values:
 *                   status: Requested
 *                 new_values:
 *                   status: Approved
 *                 ip_address: 196.216.223.10
 *                 created_at: 2026-01-16T08:00:00.000Z
 *                 user:
 *                   id: e5f60718-2b3c-4d5e-6f70-8192a3b4c5d6
 *                   name: Grace Mwale
 *                   email: grace.mwale@presstrust.mw
 *               message: Audit log retrieved successfully
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
 *         description: Audit log not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Audit log not found
 */
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

/**
 * @openapi
 * /admin/audit-logs/export:
 *   get:
 *     tags: [Audit]
 *     summary: Export audit log entries as CSV, PDF, or XLSX
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, pdf, xlsx], default: csv }
 *       - in: query
 *         name: user_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: entity_type
 *         schema: { type: string }
 *       - in: query
 *         name: entity_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Exported audit log file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *             example: "Timestamp,User,Action,Entity Type,Entity ID,IP Address,Previous Values,New Values\n2026-01-16T08:00:00.000Z,Grace Mwale (grace.mwale@presstrust.mw),approve,Disbursement,3fa85f64-5717-4562-b3fc-2c963f66afa6,196.216.223.10,\"{\"\"status\"\":\"\"Requested\"\"}\",\"{\"\"status\"\":\"\"Approved\"\"}\""
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
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
