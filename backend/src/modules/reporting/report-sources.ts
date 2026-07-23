import prisma from '../../infrastructure/database/prisma';

export interface ColumnDef {
  key: string;
  header: string;
}

export interface ReportSourceDefinition {
  key: string;
  name: string;
  description: string;
  columns: ColumnDef[];
  filterFields: { key: string; label: string; type: string }[];
}

export type ReportSourceKey = 'beneficiaries' | 'awards' | 'disbursements' | 'budget' | 'payments_by_school' | 'me_outcomes' | 'reconciliation';

const REPORT_SOURCES: Record<ReportSourceKey, ReportSourceDefinition> = {
  beneficiaries: {
    key: 'beneficiaries',
    name: 'Beneficiaries',
    description: 'Beneficiary register with demographic and program details',
    columns: [
      { key: 'identifier', header: 'Beneficiary ID' },
      { key: 'name', header: 'Full Name' },
      { key: 'gender', header: 'Gender' },
      { key: 'district', header: 'District' },
      { key: 'school', header: 'School' },
      { key: 'program', header: 'Program' },
      { key: 'status', header: 'Status' },
      { key: 'national_id', header: 'National ID' },
      { key: 'academic_year', header: 'Academic Year' },
      { key: 'created_at', header: 'Created At' },
    ],
    filterFields: [
      { key: 'program_id', label: 'Program', type: 'string' },
      { key: 'district', label: 'District', type: 'string' },
      { key: 'school_id', label: 'School', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
    ],
  },
  awards: {
    key: 'awards',
    name: 'Awards',
    description: 'Award records with beneficiary and program details',
    columns: [
      { key: 'identifier', header: 'Beneficiary ID' },
      { key: 'beneficiary', header: 'Beneficiary Name' },
      { key: 'program', header: 'Program' },
      { key: 'amount', header: 'Amount' },
      { key: 'balance_remaining', header: 'Balance Remaining' },
      { key: 'award_type', header: 'Type' },
      { key: 'status', header: 'Status' },
      { key: 'start_date', header: 'Start Date' },
      { key: 'end_date', header: 'End Date' },
      { key: 'created_at', header: 'Created At' },
    ],
    filterFields: [
      { key: 'program_id', label: 'Program', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
    ],
  },
  disbursements: {
    key: 'disbursements',
    name: 'Disbursements',
    description: 'Disbursement transactions with status and payment details',
    columns: [
      { key: 'identifier', header: 'Beneficiary ID' },
      { key: 'beneficiary', header: 'Beneficiary Name' },
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
    ],
    filterFields: [
      { key: 'program_id', label: 'Program', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'period', label: 'Academic Period', type: 'string' },
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
    ],
  },
  budget: {
    key: 'budget',
    name: 'Budget Utilization',
    description: 'Program budget ceilings, utilized amounts, and remaining balances',
    columns: [
      { key: 'name', header: 'Program' },
      { key: 'status', header: 'Status' },
      { key: 'budget_ceiling', header: 'Budget Ceiling' },
      { key: 'budget_utilized', header: 'Utilized' },
      { key: 'remaining', header: 'Remaining' },
      { key: 'percentage', header: 'Utilization %' },
    ],
    filterFields: [],
  },
  payments_by_school: {
    key: 'payments_by_school',
    name: 'Payments by School',
    description: 'Payment amounts aggregated by school',
    columns: [
      { key: 'school', header: 'School' },
      { key: 'district', header: 'District' },
      { key: 'count', header: 'Payment Count' },
      { key: 'total', header: 'Total Amount' },
    ],
    filterFields: [
      { key: 'period', label: 'Academic Period', type: 'string' },
    ],
  },
  me_outcomes: {
    key: 'me_outcomes',
    name: 'M&E Outcomes',
    description: 'Monitoring and evaluation outcome records',
    columns: [
      { key: 'identifier', header: 'Beneficiary ID' },
      { key: 'beneficiary', header: 'Beneficiary Name' },
      { key: 'program', header: 'Program' },
      { key: 'outcome_type', header: 'Outcome Type' },
      { key: 'outcome_date', header: 'Outcome Date' },
      { key: 'reason', header: 'Reason' },
      { key: 'created_at', header: 'Recorded At' },
    ],
    filterFields: [
      { key: 'program_id', label: 'Program', type: 'string' },
      { key: 'period', label: 'Period', type: 'string' },
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
    ],
  },
  reconciliation: {
    key: 'reconciliation',
    name: 'Reconciliation',
    description: 'Reconciled disbursement records',
    columns: [
      { key: 'identifier', header: 'Beneficiary ID' },
      { key: 'beneficiary', header: 'Beneficiary Name' },
      { key: 'amount', header: 'Amount' },
      { key: 'category', header: 'Category' },
      { key: 'academic_period', header: 'Period' },
      { key: 'payee_name', header: 'Payee Name' },
      { key: 'reconciled_at', header: 'Reconciled At' },
      { key: 'created_at', header: 'Created At' },
    ],
    filterFields: [
      { key: 'program_id', label: 'Program', type: 'string' },
      { key: 'period', label: 'Period', type: 'string' },
      { key: 'from_date', label: 'From Date', type: 'date' },
      { key: 'to_date', label: 'To Date', type: 'date' },
    ],
  },
};

export function getReportSource(key: string): ReportSourceDefinition | undefined {
  return REPORT_SOURCES[key as ReportSourceKey];
}

export function getAllReportSources(): ReportSourceDefinition[] {
  return Object.values(REPORT_SOURCES);
}

export async function executeReportSource(
  sourceKey: ReportSourceKey,
  fields: string[],
  filters: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const source = getReportSource(sourceKey);
  if (!source) throw new Error(`Unknown report source: ${sourceKey}`);

  switch (sourceKey) {
    case 'beneficiaries': return executeBeneficiaries(fields, filters);
    case 'awards': return executeAwards(fields, filters);
    case 'disbursements': return executeDisbursements(fields, filters);
    case 'budget': return executeBudget(fields, filters);
    case 'payments_by_school': return executePaymentsBySchool(fields, filters);
    case 'me_outcomes': return executeMeOutcomes(fields, filters);
    case 'reconciliation': return executeReconciliation(fields, filters);
    default: throw new Error(`Unsupported source: ${sourceKey}`);
  }
}

function buildFieldSelector(allColumns: ColumnDef[], selectedFields: string[]): ColumnDef[] {
  if (!selectedFields || selectedFields.length === 0) return allColumns;
  return allColumns.filter((c) => selectedFields.includes(c.key));
}

function buildPrismaFilters(sourceFilters: { key: string; label: string; type: string }[], supplied: Record<string, unknown>): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (supplied.program_id) where.program_id = supplied.program_id;
  if (supplied.district) where.district = supplied.district;
  if (supplied.school_id) where.school_id = supplied.school_id;
  if (supplied.status) where.status = supplied.status;
  if (supplied.period) where.academic_period = supplied.period;
  if (supplied.from_date || supplied.to_date) {
    where.created_at = {};
    if (supplied.from_date) (where.created_at as Record<string, unknown>).gte = new Date(supplied.from_date as string);
    if (supplied.to_date) (where.created_at as Record<string, unknown>).lte = new Date(supplied.to_date as string);
  }
  return where;
}

async function executeBeneficiaries(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('beneficiaries')!.columns;
  const selected = buildFieldSelector(allColumns, fields);
  const where = buildPrismaFilters(getReportSource('beneficiaries')!.filterFields, filters);

  const rows = await prisma.beneficiary.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { school: { select: { name: true } }, program: { select: { name: true } } },
  });

  return (rows as any[]).map((b) => mapSelectedFields(selected, {
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
}

async function executeAwards(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('awards')!.columns;
  const selected = buildFieldSelector(allColumns, fields);
  const where = buildPrismaFilters(getReportSource('awards')!.filterFields, filters);

  const rows = await prisma.award.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } }, program: { select: { name: true } } },
  });

  return (rows as any[]).map((a) => mapSelectedFields(selected, {
    identifier: a.beneficiary?.beneficiary_identifier || '',
    beneficiary: `${a.beneficiary?.first_name || ''} ${a.beneficiary?.last_name || ''}`.trim(),
    program: a.program?.name || '',
    amount: parseFloat(a.amount?.toString() || '0'),
    balance_remaining: parseFloat(a.balance_remaining?.toString() || '0'),
    award_type: a.award_type,
    status: a.status,
    start_date: a.start_date,
    end_date: a.end_date,
    created_at: a.created_at,
  }));
}

async function executeDisbursements(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('disbursements')!.columns;
  const selected = buildFieldSelector(allColumns, fields);
  const where = buildPrismaFilters(getReportSource('disbursements')!.filterFields, filters);

  const rows = await prisma.disbursement.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: { beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } }, award: { select: { amount: true } } },
  });

  return (rows as any[]).map((d) => mapSelectedFields(selected, {
    identifier: d.beneficiary?.beneficiary_identifier || '',
    beneficiary: `${d.beneficiary?.first_name || ''} ${d.beneficiary?.last_name || ''}`.trim(),
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
}

async function executeBudget(fields: string[], _filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('budget')!.columns;
  const selected = buildFieldSelector(allColumns, fields);

  const programs = await prisma.program.findMany({ orderBy: { name: 'asc' } });

  return (programs as any[]).map((p) => {
    const ceiling = parseFloat(p.budget_ceiling?.toString() || '0');
    const utilized = parseFloat(p.budget_utilized?.toString() || '0');
    return mapSelectedFields(selected, {
      name: p.name,
      status: p.status,
      budget_ceiling: ceiling,
      budget_utilized: utilized,
      remaining: parseFloat((ceiling - utilized).toFixed(2)),
      percentage: ceiling > 0 ? parseFloat(((utilized / ceiling) * 100).toFixed(2)) : 0,
    });
  });
}

async function executePaymentsBySchool(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('payments_by_school')!.columns;
  const selected = buildFieldSelector(allColumns, fields);

  const where: Record<string, unknown> = { status: { in: ['Paid', 'Reconciled'] } };
  if (filters.period) where.academic_period = filters.period;

  const disbursements = await prisma.disbursement.findMany({
    where,
    include: { beneficiary: { select: { school_id: true, school: { select: { name: true, district: true } } } } },
  });

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

  return Array.from(schoolMap.values()).map((row) => mapSelectedFields(selected, row));
}

async function executeMeOutcomes(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('me_outcomes')!.columns;
  const selected = buildFieldSelector(allColumns, fields);

  const where: Record<string, unknown> = {};
  if (filters.program_id) where.program_id = filters.program_id;
  if (filters.from_date || filters.to_date) {
    where.outcome_date = {};
    if (filters.from_date) (where.outcome_date as Record<string, unknown>).gte = new Date(filters.from_date as string);
    if (filters.to_date) (where.outcome_date as Record<string, unknown>).lte = new Date(filters.to_date as string);
  }

  const rows = await prisma.outcome.findMany({
    where,
    orderBy: { outcome_date: 'desc' },
    include: { beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } }, program: { select: { name: true } } },
  });

  return (rows as any[]).map((o) => mapSelectedFields(selected, {
    identifier: o.beneficiary?.beneficiary_identifier || '',
    beneficiary: `${o.beneficiary?.first_name || ''} ${o.beneficiary?.last_name || ''}`.trim(),
    program: o.program?.name || '',
    outcome_type: o.outcome_type,
    outcome_date: o.outcome_date,
    reason: o.reason || '',
    created_at: o.created_at,
  }));
}

async function executeReconciliation(fields: string[], filters: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const allColumns = getReportSource('reconciliation')!.columns;
  const selected = buildFieldSelector(allColumns, fields);

  const where: Record<string, unknown> = { status: 'Reconciled' };
  if (filters.program_id) where.program_id = filters.program_id;
  if (filters.period) where.academic_period = filters.period;
  if (filters.from_date || filters.to_date) {
    where.reconciled_at = {};
    if (filters.from_date) (where.reconciled_at as Record<string, unknown>).gte = new Date(filters.from_date as string);
    if (filters.to_date) (where.reconciled_at as Record<string, unknown>).lte = new Date(filters.to_date as string);
  }

  const rows = await prisma.disbursement.findMany({
    where,
    orderBy: { reconciled_at: 'desc' },
    include: { beneficiary: { select: { first_name: true, last_name: true, beneficiary_identifier: true } }, award: { select: { amount: true } } },
  });

  return (rows as any[]).map((d) => mapSelectedFields(selected, {
    identifier: d.beneficiary?.beneficiary_identifier || '',
    beneficiary: `${d.beneficiary?.first_name || ''} ${d.beneficiary?.last_name || ''}`.trim(),
    amount: parseFloat(d.amount?.toString() || '0'),
    category: d.category,
    academic_period: d.academic_period,
    payee_name: d.payee_name || '',
    reconciled_at: d.reconciled_at,
    created_at: d.created_at,
  }));
}

function mapSelectedFields(selected: ColumnDef[], data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const col of selected) {
    result[col.key] = data[col.key] ?? null;
  }
  return result;
}
