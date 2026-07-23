import path from 'path';
import fs from 'fs';
import prisma from '../../infrastructure/database/prisma';
import { executeReportSource, getReportSource, ReportSourceKey, ColumnDef } from './report-sources';
import { generateCsv, generatePdf, generateXlsx, ExportFormat } from './export.service';
import { config } from '../../shared/config';

const REPORTS_DIR = path.join(config.upload.dir, 'reports');

export interface ExecuteReportOptions {
  reportDefinitionId: string;
  format: ExportFormat;
  filtersOverride?: Record<string, unknown>;
  triggeredBy: 'manual' | 'scheduled';
  scheduleId?: string;
}

export interface ExecuteReportResult {
  format: string;
  rows: number;
  buffer: Buffer;
  fileName: string;
  fileUrl: string | null;
}

export async function executeReportDefinition(options: ExecuteReportOptions): Promise<ExecuteReportResult> {
  const def = await prisma.reportDefinition.findUnique({ where: { id: options.reportDefinitionId } });
  if (!def) throw new Error('Report definition not found');

  const source = getReportSource(def.source);
  if (!source) throw new Error(`Unknown report source: ${def.source}`);

  const mergedFilters = { ...((def.filters as Record<string, unknown>) || {}), ...(options.filtersOverride || {}) };
  const fields = (def.fields as string[]) || [];

  const rows = await executeReportSource(def.source as ReportSourceKey, fields, mergedFilters);

  const selectedColumns = buildSelectedColumns(source.columns, fields);
  const format = options.format || 'csv';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const safeName = def.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_${timestamp}`;
  const extension = format === 'xlsx' ? 'xlsx' : format;

  let buffer: Buffer;
  if (format === 'csv') {
    buffer = Buffer.from(generateCsv(rows as Record<string, unknown>[], selectedColumns));
  } else if (format === 'pdf') {
    buffer = await generatePdf(def.name, rows as Record<string, unknown>[], selectedColumns);
  } else if (format === 'xlsx') {
    buffer = generateXlsx(def.name, rows as Record<string, unknown>[], selectedColumns);
  } else {
    buffer = Buffer.from(JSON.stringify(rows, null, 2));
  }

  const fullFileName = `${fileName}.${extension}`;
  let fileUrl: string | null = null;

  if (options.triggeredBy === 'scheduled' || options.triggeredBy === 'manual') {
    ensureReportsDir();
    const filePath = path.join(REPORTS_DIR, fullFileName);
    fs.writeFileSync(filePath, buffer);
    fileUrl = `uploads/reports/${fullFileName}`;
  }

  const now = new Date();
  await prisma.reportRunLog.create({
    data: {
      schedule_id: options.scheduleId || null,
      report_id: options.reportDefinitionId,
      status: 'completed',
      format,
      row_count: rows.length,
      file_url: fileUrl,
      started_at: now,
      completed_at: new Date(),
      triggered_by: options.triggeredBy,
    },
  });

  return { format, rows: rows.length, buffer, fileName: fullFileName, fileUrl };
}

function buildSelectedColumns(allColumns: ColumnDef[], selectedFields: string[]): ColumnDef[] {
  if (!selectedFields || selectedFields.length === 0) return allColumns;
  return allColumns.filter((c) => selectedFields.includes(c.key));
}

function ensureReportsDir(): void {
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }
}
