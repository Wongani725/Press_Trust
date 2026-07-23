import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import prisma from '../../infrastructure/database/prisma';

export type ExportFormat = 'json' | 'csv' | 'pdf' | 'xlsx';

export interface ColumnDef {
  key: string;
  header: string;
}

export async function logExport(
  userId: string,
  exportType: string,
  format: string,
  filters: Record<string, unknown> | null
): Promise<void> {
  await prisma.exportLog.create({
    data: {
      user_id: userId,
      export_type: exportType,
      format,
      filters: filters ? (filters as any) : null,
    },
  });
}

export function generateCsv(rows: Record<string, unknown>[], columns: ColumnDef[]): string {
  const headers = columns.map((c) => c.header);
  const data = rows.map((row) => columns.map((c) => {
    const val = row[c.key];
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }));
  return stringify([headers, ...data]);
}

const PRIMARY = '#715E26';
const SECONDARY = '#C19B38';
const PAGE_WIDTH = 540;
const MARGIN = 40;

export function generatePdf(
  title: string,
  rows: Record<string, unknown>[],
  columns: ColumnDef[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Brand header
    const logoPath = path.resolve(__dirname, '../../assets/press_logo.jpg');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, MARGIN, 20, { width: 30 });
    }
    doc.fillColor(PRIMARY).fontSize(14).font('Helvetica-Bold').text('Press Trust Scholarship Management System', MARGIN + 40, 24);
    doc.fillColor('#000000').fontSize(11).font('Helvetica').text(title, { align: 'center' });
    doc.fillColor('#666666').fontSize(8).text(`Generated: ${new Date().toISOString()}`, { align: 'center' });
    doc.moveDown(1.5);

    // Accent line
    doc.fillColor(SECONDARY).rect(MARGIN, doc.y, PAGE_WIDTH, 1.5).fill();
    doc.moveDown(1);

    // Table header with brand color
    const colWidth = PAGE_WIDTH / columns.length;
    const headerY = doc.y;

    doc.fillColor('white').rect(MARGIN, headerY, PAGE_WIDTH, 16).fill(PRIMARY);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
    columns.forEach((col, i) => {
      doc.text(col.header, MARGIN + i * colWidth + 2, headerY + 3, { width: colWidth - 6, ellipsis: true });
    });

    let y = headerY + 18;
    doc.fillColor('#000000').font('Helvetica').fontSize(8);

    // Rows
    for (const row of rows) {
      if (y > 720) {
        doc.addPage();
        y = MARGIN;
        doc.fillColor('white').rect(MARGIN, y, PAGE_WIDTH, 16).fill(PRIMARY);
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
        columns.forEach((col, i) => {
          doc.text(col.header, MARGIN + i * colWidth + 2, y + 3, { width: colWidth - 6, ellipsis: true });
        });
        y += 18;
        doc.fillColor('#000000').font('Helvetica').fontSize(8);
      }

      // Alternating row background
      if ((rows.indexOf(row) % 2) === 1) {
        doc.fillColor('#f5f0e0').rect(MARGIN, y, PAGE_WIDTH, 12).fill();
        doc.fillColor('#000000');
      }

      columns.forEach((col, i) => {
        const val = row[col.key];
        const text = val === null || val === undefined ? '' : String(val);
        doc.text(text, MARGIN + i * colWidth + 2, y + 1, { width: colWidth - 6, ellipsis: true });
      });
      y += 12;
    }

    // Footer
    doc.fillColor(SECONDARY).rect(MARGIN, doc.y + 10, PAGE_WIDTH, 1).fill();
    doc.fillColor('#666666').fontSize(7).font('Helvetica').text(
      'Press Trust Scholarship Management System',
      MARGIN, doc.y + 15,
      { align: 'center', width: PAGE_WIDTH }
    );

    doc.end();
  });
}

export function generateXlsx(
  title: string,
  rows: Record<string, unknown>[],
  columns: ColumnDef[]
): Buffer {
  const headers = columns.map((c) => c.header);
  const data = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    })
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.substring(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function sendExport(
  res: any,
  format: ExportFormat,
  filename: string,
  bufferOrString: string | Buffer,
  contentType: string
): void {
  const extension = format === 'xlsx' ? 'xlsx' : format;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.${extension}"`);
  res.send(bufferOrString);
}
