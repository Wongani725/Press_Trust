import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import {
  generateCsv,
  generatePdf,
  generateXlsx,
  logExport,
  sendExport,
  ExportFormat,
  ColumnDef,
} from '../../../modules/reporting/export.service';

// ── Shared filter parser ──

function parseReportFilters(req: Request): {
  programId?: string;
  period?: string;
  district?: string;
  schoolId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  format: ExportFormat;
} {
  const format = (req.query.format as string || 'json') as ExportFormat;
  return {
    programId: req.query.program_id as string | undefined,
    period: req.query.period as string | undefined,
    district: req.query.district as string | undefined,
    schoolId: req.query.school_id as string | undefined,
    status: req.query.status as string | undefined,
    fromDate: req.query.from_date as string | undefined,
    toDate: req.query.to_date as string | undefined,
    format: ['csv', 'pdf', 'xlsx'].includes(format) ? format : 'json',
  };
}

function applyCommonFilters(
  where: Record<string, unknown>,
  filters: ReturnType<typeof parseReportFilters>,
  dateField = 'created_at'
): void {
  if (filters.programId) where.program_id = filters.programId;
  if (filters.district) where.district = filters.district;
  if (filters.schoolId) where.school_id = filters.schoolId;
  if (filters.status) where.status = filters.status;
  if (filters.period && where.academic_period === undefined) {
    // Only add if not already specialized
    where.academic_period = filters.period;
  }
  if (filters.fromDate || filters.toDate) {
    where[dateField] = {};
    if (filters.fromDate) (where[dateField] as Record<string, unknown>).gte = new Date(filters.fromDate);
    if (filters.toDate) (where[dateField] as Record<string, unknown>).lte = new Date(filters.toDate);
  }
}

// ── Dashboard ──

/**
 * @openapi
 * /admin/dashboard:
 *   get:
 *     tags: [Dashboard]
 *     summary: Get dashboard KPIs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard KPIs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 active_beneficiaries: 1240
 *                 pending_onboarding: 38
 *                 programs:
 *                   total: 6
 *                   active: 4
 *                 at_risk_count: 52
 *                 disbursements:
 *                   requested: 120
 *                   approved: 340
 *                   paid: 890
 *                   reconciled: 760
 *                 budget:
 *                   utilized: 182500000
 *                   ceiling: 250000000
 *                   percentage: 73
 *               message: Dashboard KPIs retrieved successfully
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
export async function getDashboard(req: Request, res: Response): Promise<void> {
  const [
    activeBeneficiaries,
    pendingOnboarding,
    totalPrograms,
    activePrograms,
    atRiskCount,
    requestedDisbursements,
    approvedDisbursements,
    paidDisbursements,
    reconciledDisbursements,
    budgetUtilized,
    budgetCeiling,
  ] = await Promise.all([
    prisma.beneficiary.count({ where: { status: 'Active' } }),
    prisma.beneficiary.count({ where: { status: 'PendingOnboarding' } }),
    prisma.program.count(),
    prisma.program.count({ where: { status: 'Open' } }),
    prisma.atRiskFlag.count({ where: { resolved: false } }),
    prisma.disbursement.count({ where: { status: 'Requested' } }),
    prisma.disbursement.count({ where: { status: 'Approved' } }),
    prisma.disbursement.count({ where: { status: 'Paid' } }),
    prisma.disbursement.count({ where: { status: 'Reconciled' } }),
    prisma.program.aggregate({ _sum: { budget_utilized: true } }),
    prisma.program.aggregate({ _sum: { budget_ceiling: true } }),
  ]);

  const utilized = parseFloat(budgetUtilized._sum.budget_utilized?.toString() || '0');
  const ceiling = parseFloat(budgetCeiling._sum.budget_ceiling?.toString() || '0');

  res.json({
    status: 'success',
    data: {
      active_beneficiaries: activeBeneficiaries,
      pending_onboarding: pendingOnboarding,
      programs: { total: totalPrograms, active: activePrograms },
      at_risk_count: atRiskCount,
      disbursements: {
        requested: requestedDisbursements,
        approved: approvedDisbursements,
        paid: paidDisbursements,
        reconciled: reconciledDisbursements,
      },
      budget: {
        utilized,
        ceiling,
        percentage: ceiling > 0 ? parseFloat(((utilized / ceiling) * 100).toFixed(2)) : 0,
      },
    },
    message: 'Dashboard KPIs retrieved successfully',
  });
}

// ── Shared export helper ──

async function handleExport(
  res: Response,
  req: Request,
  exportType: string,
  format: ExportFormat,
  filename: string,
  rows: Record<string, unknown>[],
  columns: ColumnDef[],
  filters: Record<string, unknown> | null
): Promise<void> {
  if (format === 'json') {
    res.json({ status: 'success', data: { items: rows }, message: 'Report data retrieved successfully' });
    return;
  }

  await logExport(req.user!.userId, exportType, format, filters);

  if (format === 'csv') {
    const csv = generateCsv(rows, columns);
    sendExport(res, 'csv', filename, csv, 'text/csv');
  } else if (format === 'pdf') {
    const pdf = await generatePdf(filename, rows, columns);
    sendExport(res, 'pdf', filename, pdf, 'application/pdf');
  } else if (format === 'xlsx') {
    const xlsx = generateXlsx(filename, rows, columns);
    sendExport(res, 'xlsx', filename, xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
}

// ── Beneficiary Report ──

/**
 * @openapi
 * /admin/reports/beneficiaries:
 *   get:
 *     tags: [Reports]
 *     summary: Beneficiary register report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: district
 *         schema: { type: string }
 *       - in: query
 *         name: school_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     identifier: PT-2024-00123
 *                     name: Chikondi Banda
 *                     gender: Female
 *                     district: Zomba
 *                     school: Zomba Community Day Secondary School
 *                     program: Girls Education Support Program
 *                     status: Active
 *                     national_id: MW1234567
 *                     academic_year: '2026'
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Beneficiary report retrieved successfully
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
 */
export async function reportBeneficiaries(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  applyCommonFilters(where, filters);

  const [rows, total] = await Promise.all([
    prisma.beneficiary.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        school: { select: { name: true } },
        program: { select: { name: true } },
      },
    }),
    prisma.beneficiary.count({ where }),
  ]);

  const data = (rows as any[]).map((b) => ({
    id: b.id,
    identifier: b.beneficiary_identifier,
    name: `${b.first_name} ${b.last_name}`,
    gender: b.gender,
    district: b.district,
    school: b.school?.name || '',
    program: b.program?.name || '',
    status: b.status,
    national_id: b.national_id || '',
    academic_year: b.academic_year || '',
    created_at: b.created_at,
  }));

  const columns: ColumnDef[] = [
    { key: 'identifier', header: 'Identifier' },
    { key: 'name', header: 'Name' },
    { key: 'gender', header: 'Gender' },
    { key: 'district', header: 'District' },
    { key: 'school', header: 'School' },
    { key: 'program', header: 'Program' },
    { key: 'status', header: 'Status' },
    { key: 'national_id', header: 'National ID' },
    { key: 'academic_year', header: 'Academic Year' },
    { key: 'created_at', header: 'Created At' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
      message: 'Beneficiary report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'beneficiaries', filters.format, 'beneficiary_register', data, columns, filters as unknown as Record<string, unknown>);
}

// ── Awards Report ──

/**
 * @openapi
 * /admin/reports/awards:
 *   get:
 *     tags: [Reports]
 *     summary: Awards report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 4a1b6e2c-8d3f-4a5b-9c1d-2e3f4a5b6c7d
 *                     beneficiary: Chikondi Banda
 *                     identifier: PT-2024-00123
 *                     program: Girls Education Support Program
 *                     amount: 450000
 *                     balance_remaining: 225000
 *                     award_type: Tuition
 *                     status: Active
 *                     start_date: 2026-01-10T00:00:00.000Z
 *                     end_date: 2026-12-10T00:00:00.000Z
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Awards report retrieved successfully
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
 */
export async function reportAwards(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  applyCommonFilters(where, filters);

  const [rows, total] = await Promise.all([
    prisma.award.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } },
        program: { select: { name: true } },
      },
    }),
    prisma.award.count({ where }),
  ]);

  const data = (rows as any[]).map((a) => ({
    id: a.id,
    beneficiary: `${a.beneficiary?.first_name || ''} ${a.beneficiary?.last_name || ''}`.trim(),
    identifier: a.beneficiary?.beneficiary_identifier || '',
    program: a.program?.name || '',
    amount: parseFloat(a.amount?.toString() || '0'),
    balance_remaining: parseFloat(a.balance_remaining?.toString() || '0'),
    award_type: a.award_type,
    status: a.status,
    start_date: a.start_date,
    end_date: a.end_date,
    created_at: a.created_at,
  }));

  const columns: ColumnDef[] = [
    { key: 'identifier', header: 'Beneficiary ID' },
    { key: 'beneficiary', header: 'Beneficiary' },
    { key: 'program', header: 'Program' },
    { key: 'amount', header: 'Amount' },
    { key: 'balance_remaining', header: 'Balance Remaining' },
    { key: 'award_type', header: 'Type' },
    { key: 'status', header: 'Status' },
    { key: 'start_date', header: 'Start Date' },
    { key: 'end_date', header: 'End Date' },
    { key: 'created_at', header: 'Created At' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
      message: 'Awards report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'awards', filters.format, 'awards_report', data, columns, filters as unknown as Record<string, unknown>);
}

// ── Disbursements Report ──

/**
 * @openapi
 * /admin/reports/disbursements:
 *   get:
 *     tags: [Reports]
 *     summary: Disbursements report (Finance only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: period
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 6f2a1b3c-4d5e-4f6a-8b9c-0d1e2f3a4b5c
 *                     beneficiary: Chikondi Banda
 *                     identifier: PT-2024-00123
 *                     amount: 150000
 *                     category: Tuition Fees
 *                     academic_period: 2026-T2
 *                     payee_type: School
 *                     payee_name: Zomba Community Day Secondary School
 *                     status: Paid
 *                     approved_at: 2026-05-01T10:00:00.000Z
 *                     paid_at: 2026-05-03T14:20:00.000Z
 *                     reconciled_at: null
 *                     created_at: 2026-04-28T08:15:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Disbursements report retrieved successfully
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
 */
export async function reportDisbursements(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  applyCommonFilters(where, filters);
  if (filters.period) where.academic_period = filters.period;

  const [rows, total] = await Promise.all([
    prisma.disbursement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } },
        award: { select: { amount: true } },
      },
    }),
    prisma.disbursement.count({ where }),
  ]);

  const data = (rows as any[]).map((d) => ({
    id: d.id,
    beneficiary: `${d.beneficiary?.first_name || ''} ${d.beneficiary?.last_name || ''}`.trim(),
    identifier: d.beneficiary?.beneficiary_identifier || '',
    amount: parseFloat(d.amount?.toString() || '0'),
    category: d.category,
    academic_period: d.academic_period,
    payee_type: d.payee_type,
    payee_name: d.payee_name || '',
    status: d.status,
    approved_at: d.approved_at,
    paid_at: d.paid_at,
    reconciled_at: d.reconciled_at,
    created_at: d.created_at,
  }));

  const columns: ColumnDef[] = [
    { key: 'identifier', header: 'Beneficiary ID' },
    { key: 'beneficiary', header: 'Beneficiary' },
    { key: 'amount', header: 'Amount' },
    { key: 'category', header: 'Category' },
    { key: 'academic_period', header: 'Period' },
    { key: 'payee_type', header: 'Payee Type' },
    { key: 'payee_name', header: 'Payee Name' },
    { key: 'status', header: 'Status' },
    { key: 'approved_at', header: 'Approved At' },
    { key: 'paid_at', header: 'Paid At' },
    { key: 'reconciled_at', header: 'Reconciled At' },
    { key: 'created_at', header: 'Created At' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
      message: 'Disbursements report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'disbursements', filters.format, 'disbursements_report', data, columns, filters as unknown as Record<string, unknown>);
}

// ── Budget Utilization Report ──

/**
 * @openapi
 * /admin/reports/budget:
 *   get:
 *     tags: [Reports]
 *     summary: Budget utilization report (Finance only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 1f2e3d4c-5b6a-4978-8c9d-0e1f2a3b4c5d
 *                     name: Girls Education Support Program
 *                     status: Open
 *                     budget_ceiling: 50000000
 *                     budget_utilized: 32500000
 *                     remaining: 17500000
 *                     percentage: 65
 *               message: Budget utilization report retrieved successfully
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
 */
export async function reportBudget(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);

  const programs = await prisma.program.findMany({
    orderBy: { name: 'asc' },
  });

  const data = (programs as any[]).map((p) => {
    const ceiling = parseFloat(p.budget_ceiling?.toString() || '0');
    const utilized = parseFloat(p.budget_utilized?.toString() || '0');
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      budget_ceiling: ceiling,
      budget_utilized: utilized,
      remaining: parseFloat((ceiling - utilized).toFixed(2)),
      percentage: ceiling > 0 ? parseFloat(((utilized / ceiling) * 100).toFixed(2)) : 0,
    };
  });

  const columns: ColumnDef[] = [
    { key: 'name', header: 'Program' },
    { key: 'status', header: 'Status' },
    { key: 'budget_ceiling', header: 'Budget Ceiling' },
    { key: 'budget_utilized', header: 'Utilized' },
    { key: 'remaining', header: 'Remaining' },
    { key: 'percentage', header: 'Utilization %' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data },
      message: 'Budget utilization report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'budget', filters.format, 'budget_utilization', data, columns, filters as unknown as Record<string, unknown>);
}

// ── Payments by School Report ──

/**
 * @openapi
 * /admin/reports/payments-by-school:
 *   get:
 *     tags: [Reports]
 *     summary: Payments grouped by school (Finance only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: period
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - school: Zomba Community Day Secondary School
 *                     district: Zomba
 *                     count: 42
 *                     total: 6300000
 *               message: Payments by school report retrieved successfully
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
 */
export async function reportPaymentsBySchool(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);

  const where: Record<string, unknown> = { status: { in: ['Paid', 'Reconciled'] } };
  if (filters.period) where.academic_period = filters.period;

  const disbursements = await prisma.disbursement.findMany({
    where,
    include: {
      beneficiary: { select: { school_id: true, school: { select: { name: true, district: true } } } },
    },
  });

  // Aggregate by school
  const schoolMap = new Map<string, { school: string; district: string; count: number; total: number }>();
  for (const d of disbursements as any[]) {
    const schoolId = d.beneficiary?.school_id || 'unknown';
    const schoolName = d.beneficiary?.school?.name || 'Unknown';
    const district = d.beneficiary?.school?.district || '';
    const existing = schoolMap.get(schoolId);
    const amount = parseFloat(d.amount?.toString() || '0');
    if (existing) {
      existing.count += 1;
      existing.total = parseFloat((existing.total + amount).toFixed(2));
    } else {
      schoolMap.set(schoolId, { school: schoolName, district, count: 1, total: amount });
    }
  }

  const data = Array.from(schoolMap.values());

  const columns: ColumnDef[] = [
    { key: 'school', header: 'School' },
    { key: 'district', header: 'District' },
    { key: 'count', header: 'Payment Count' },
    { key: 'total', header: 'Total Amount' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data },
      message: 'Payments by school report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'payments_by_school', filters.format, 'payments_by_school', data, columns, filters as unknown as Record<string, unknown>);
}

// ── M&E Outcomes Report ──

/**
 * @openapi
 * /admin/reports/me-outcomes:
 *   get:
 *     tags: [Reports]
 *     summary: M&E outcomes report
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: period
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e
 *                     beneficiary: Chikondi Banda
 *                     identifier: PT-2024-00123
 *                     program: Girls Education Support Program
 *                     outcome_type: Graduated
 *                     outcome_date: 2026-06-30T00:00:00.000Z
 *                     reason: ''
 *                     created_at: 2026-07-02T11:00:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: M&E outcomes report retrieved successfully
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
 */
export async function reportMeOutcomes(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (filters.programId) where.program_id = filters.programId;
  if (filters.fromDate || filters.toDate) {
    where.outcome_date = {};
    if (filters.fromDate) (where.outcome_date as Record<string, unknown>).gte = new Date(filters.fromDate);
    if (filters.toDate) (where.outcome_date as Record<string, unknown>).lte = new Date(filters.toDate);
  }

  const [rows, total] = await Promise.all([
    prisma.outcome.findMany({
      where,
      skip,
      take: limit,
      orderBy: { outcome_date: 'desc' },
      include: {
        beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } },
        program: { select: { name: true } },
      },
    }),
    prisma.outcome.count({ where }),
  ]);

  const data = (rows as any[]).map((o) => ({
    id: o.id,
    beneficiary: `${o.beneficiary?.first_name || ''} ${o.beneficiary?.last_name || ''}`.trim(),
    identifier: o.beneficiary?.beneficiary_identifier || '',
    program: o.program?.name || '',
    outcome_type: o.outcome_type,
    outcome_date: o.outcome_date,
    reason: o.reason || '',
    created_at: o.created_at,
  }));

  const columns: ColumnDef[] = [
    { key: 'identifier', header: 'Beneficiary ID' },
    { key: 'beneficiary', header: 'Beneficiary' },
    { key: 'program', header: 'Program' },
    { key: 'outcome_type', header: 'Outcome Type' },
    { key: 'outcome_date', header: 'Outcome Date' },
    { key: 'reason', header: 'Reason' },
    { key: 'created_at', header: 'Recorded At' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
      message: 'M&E outcomes report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'me_outcomes', filters.format, 'me_outcomes_report', data, columns, filters as unknown as Record<string, unknown>);
}

// ── Reconciliation Report ──

/**
 * @openapi
 * /admin/reports/reconciliation:
 *   get:
 *     tags: [Reports]
 *     summary: Reconciliation report (Finance only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [json, csv, pdf, xlsx], default: json }
 *       - in: query
 *         name: program_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: period
 *         schema: { type: string }
 *       - in: query
 *         name: from_date
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to_date
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Report data (JSON) when `format=json`, or an exported file when `format` is csv/pdf/xlsx
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d
 *                     beneficiary: Chikondi Banda
 *                     identifier: PT-2024-00123
 *                     amount: 150000
 *                     category: Tuition Fees
 *                     academic_period: 2026-T2
 *                     payee_name: Zomba Community Day Secondary School
 *                     reconciled_at: 2026-05-10T09:00:00.000Z
 *                     created_at: 2026-04-28T08:15:00.000Z
 *                 meta:
 *                   page: 1
 *                   limit: 20
 *                   total: 1
 *                   totalPages: 1
 *               message: Reconciliation report retrieved successfully
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
 */
export async function reportReconciliation(req: Request, res: Response): Promise<void> {
  const filters = parseReportFilters(req);
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = { status: 'Reconciled' };
  if (filters.programId) where.program_id = filters.programId;
  if (filters.period) where.academic_period = filters.period;
  if (filters.fromDate || filters.toDate) {
    where.reconciled_at = {};
    if (filters.fromDate) (where.reconciled_at as Record<string, unknown>).gte = new Date(filters.fromDate);
    if (filters.toDate) (where.reconciled_at as Record<string, unknown>).lte = new Date(filters.toDate);
  }

  const [rows, total] = await Promise.all([
    prisma.disbursement.findMany({
      where,
      skip,
      take: limit,
      orderBy: { reconciled_at: 'desc' },
      include: {
        beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } },
        award: { select: { amount: true } },
      },
    }),
    prisma.disbursement.count({ where }),
  ]);

  const data = (rows as any[]).map((d) => ({
    id: d.id,
    beneficiary: `${d.beneficiary?.first_name || ''} ${d.beneficiary?.last_name || ''}`.trim(),
    identifier: d.beneficiary?.beneficiary_identifier || '',
    amount: parseFloat(d.amount?.toString() || '0'),
    category: d.category,
    academic_period: d.academic_period,
    payee_name: d.payee_name || '',
    reconciled_at: d.reconciled_at,
    created_at: d.created_at,
  }));

  const columns: ColumnDef[] = [
    { key: 'identifier', header: 'Beneficiary ID' },
    { key: 'beneficiary', header: 'Beneficiary' },
    { key: 'amount', header: 'Amount' },
    { key: 'category', header: 'Category' },
    { key: 'academic_period', header: 'Period' },
    { key: 'payee_name', header: 'Payee Name' },
    { key: 'reconciled_at', header: 'Reconciled At' },
    { key: 'created_at', header: 'Created At' },
  ];

  if (filters.format === 'json') {
    res.json({
      status: 'success',
      data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
      message: 'Reconciliation report retrieved successfully',
    });
    return;
  }

  await handleExport(res, req, 'reconciliation', filters.format, 'reconciliation_report', data, columns, filters as unknown as Record<string, unknown>);
}
