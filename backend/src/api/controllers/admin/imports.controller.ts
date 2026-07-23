import { Request, Response } from 'express';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import Papa from 'papaparse';
import { stringify } from 'csv-stringify/sync';

// ── Template generation ──

const TEMPLATE_HEADERS = [
  'first_name', 'last_name', 'gender', 'district', 'school_id', 'program_id',
  'date_of_birth', 'national_id', 'exams_id', 'contact_email', 'contact_phone',
  'academic_year', 'guardian_name', 'guardian_relationship', 'guardian_phone',
];

/**
 * @openapi
 * /admin/imports/templates/beneficiary:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: Download a sample CSV template for bulk beneficiary import
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV template file with header row and one sample row
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *             example: |
 *               first_name,last_name,gender,district,school_id,program_id,date_of_birth,national_id,exams_id,contact_email,contact_phone,academic_year,guardian_name,guardian_relationship,guardian_phone
 *               Example,Student,Male,Lilongwe,a1b2c3d4-1111-4a2b-9b0a-4a2b6c1e0001,c9d8e7f6-2222-4a2b-9b0a-4a2b6c1e0002,,,,,,2026-T1,John Doe,Father,+265991234567
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
export async function downloadBeneficiaryTemplate(req: Request, res: Response): Promise<void> {
  const [schools, programs, districts] = await Promise.all([
    prisma.school.findMany({ where: { status: 'active' }, select: { id: true, name: true, district: true } }),
    prisma.program.findMany({ where: { status: { in: ['Open', 'Closed'] } }, select: { id: true, name: true } }),
    prisma.referenceData.findMany({ where: { type: 'district', status: 'active' }, select: { code: true, name: true } }),
  ]);

  // Build a sample row to show valid values
  const sampleRow: Record<string, string> = {};
  for (const h of TEMPLATE_HEADERS) sampleRow[h] = '';
  sampleRow.first_name = 'Example';
  sampleRow.last_name = 'Student';
  sampleRow.gender = 'Male';
  sampleRow.district = districts[0]?.name || 'Lilongwe';
  sampleRow.school_id = schools[0]?.id || '';
  sampleRow.program_id = programs[0]?.id || '';
  sampleRow.academic_year = '2026-T1';
  sampleRow.guardian_name = 'John Doe';
  sampleRow.guardian_relationship = 'Father';
  sampleRow.guardian_phone = '+265991234567';

  const csv = stringify([sampleRow], { header: true, columns: TEMPLATE_HEADERS });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="beneficiary_template.csv"');
  res.send(csv);
}

/**
 * @openapi
 * /admin/imports/templates/beneficiary/metadata:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: Get reference metadata (headers, schools, programs, districts) for the beneficiary import template
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Template metadata retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 headers: [first_name, last_name, gender, district, school_id, program_id, date_of_birth, national_id, exams_id, contact_email, contact_phone, academic_year, guardian_name, guardian_relationship, guardian_phone]
 *                 required: [first_name, last_name, gender, district, school_id, program_id]
 *                 optional: [date_of_birth, national_id, exams_id, contact_email, contact_phone, academic_year, guardian_name, guardian_relationship, guardian_phone]
 *                 schools:
 *                   - id: a1b2c3d4-1111-4a2b-9b0a-4a2b6c1e0001
 *                     name: Kamuzu Academy
 *                     district: Lilongwe
 *                 programs:
 *                   - id: c9d8e7f6-2222-4a2b-9b0a-4a2b6c1e0002
 *                     name: Secondary School Bursary Program
 *                 districts:
 *                   - code: LL
 *                     name: Lilongwe
 *                 sample_academic_periods: ["2026-T1", "2026-T2", "2026-T3", "2027-T1", "2027-T2", "2027-T3"]
 *               message: Template metadata retrieved successfully
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
export async function getTemplateMetadata(req: Request, res: Response): Promise<void> {
  const [schools, programs, districts] = await Promise.all([
    prisma.school.findMany({ where: { status: 'active' }, select: { id: true, name: true, district: true } }),
    prisma.program.findMany({ where: { status: { in: ['Open', 'Closed'] } }, select: { id: true, name: true } }),
    prisma.referenceData.findMany({ where: { type: 'district', status: 'active' }, select: { code: true, name: true } }),
  ]);

  res.json({
    status: 'success',
    data: {
      headers: TEMPLATE_HEADERS,
      required: ['first_name', 'last_name', 'gender', 'district', 'school_id', 'program_id'],
      optional: ['date_of_birth', 'national_id', 'exams_id', 'contact_email', 'contact_phone', 'academic_year', 'guardian_name', 'guardian_relationship', 'guardian_phone'],
      schools,
      programs,
      districts,
      sample_academic_periods: ['2026-T1', '2026-T2', '2026-T3', '2027-T1', '2027-T2', '2027-T3'],
    },
    message: 'Template metadata retrieved successfully',
  });
}

// ── CSV Import ──

interface ImportRow {
  first_name: string;
  last_name: string;
  gender: string;
  district: string;
  school_id: string;
  program_id: string;
  date_of_birth?: string;
  national_id?: string;
  exams_id?: string;
  contact_email?: string;
  contact_phone?: string;
  academic_year?: string;
  guardian_name?: string;
  guardian_relationship?: string;
  guardian_phone?: string;
}

interface ImportError {
  row: number;
  field: string;
  value: string;
  message: string;
}

/**
 * @openapi
 * /admin/imports/beneficiaries:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Bulk import beneficiaries from a CSV file
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ImportCreate'
 *     responses:
 *       201:
 *         description: Import completed (individual row failures are reported in the errors array, not as an HTTP failure)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImportSummary'
 *             example:
 *               status: success
 *               data:
 *                 total_rows: 3
 *                 created: 2
 *                 created_ids: [6b1f3b8e-2e35-4a2b-9b0a-4a2b6c1e7f21, 7c2f4c9f-3f46-4b3c-ac1b-5b3c7d2f8a32]
 *                 skipped_duplicates: 1
 *                 errors:
 *                   - row: 4
 *                     field: school_id
 *                     value: 00000000-0000-0000-0000-000000000000
 *                     message: School not found or inactive
 *                 error_log_csv: "row,field,value,message\n4,school_id,00000000-0000-0000-0000-000000000000,School not found or inactive\n"
 *               message: "Import completed: 2 created, 1 duplicates skipped, 1 errors"
 *       400:
 *         description: Missing file, unparsable CSV, or CSV with no data rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: CSV file is required
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
export async function importBeneficiaries(req: Request, res: Response): Promise<void> {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ status: 'error', data: null, message: 'CSV file is required' });
    return;
  }

  const csvString = file.buffer.toString('utf-8');
  const parseResult = Papa.parse<ImportRow>(csvString, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parseResult.errors.length > 0) {
    res.status(400).json({ status: 'error', data: { parse_errors: parseResult.errors }, message: 'CSV parsing failed' });
    return;
  }

  const rows = parseResult.data;
  if (rows.length === 0) {
    res.status(400).json({ status: 'error', data: null, message: 'CSV contains no data rows' });
    return;
  }

  // Preload master data for validation
  const [schools, programs, districts] = await Promise.all([
    prisma.school.findMany({ where: { status: 'active' }, select: { id: true, district: true } }),
    prisma.program.findMany({ where: { status: { in: ['Open', 'Closed', 'Draft'] } }, select: { id: true } }),
    prisma.referenceData.findMany({ where: { type: 'district', status: 'active' }, select: { name: true } }),
  ]);

  const schoolMap = new Map(schools.map((s) => [s.id, s.district]));
  const programSet = new Set(programs.map((p) => p.id));
  const districtSet = new Set(districts.map((d) => d.name.toLowerCase()));

  const errors: ImportError[] = [];
  const createdIds: string[] = [];
  let skippedDuplicates = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // 1-based with header

    // Required fields
    const required = ['first_name', 'last_name', 'gender', 'district', 'school_id', 'program_id'] as const;
    for (const field of required) {
      const val = (row as any)[field];
      if (!val || String(val).trim() === '') {
        errors.push({ row: rowNum, field, value: val || '', message: `${field} is required` });
      }
    }

    if (errors.some((e) => e.row === rowNum)) {
      continue;
    }

    const schoolId = row.school_id.trim();
    const programId = row.program_id.trim();
    const districtName = row.district.trim();

    // Validate district
    if (!districtSet.has(districtName.toLowerCase())) {
      errors.push({ row: rowNum, field: 'district', value: districtName, message: 'District not found in reference data' });
      continue;
    }

    // Validate school
    if (!schoolMap.has(schoolId)) {
      errors.push({ row: rowNum, field: 'school_id', value: schoolId, message: 'School not found or inactive' });
      continue;
    }

    const schoolDistrict = schoolMap.get(schoolId);
    if (schoolDistrict && schoolDistrict.toLowerCase() !== districtName.toLowerCase()) {
      errors.push({ row: rowNum, field: 'district', value: districtName, message: 'District does not match school district' });
      continue;
    }

    // Validate program
    if (!programSet.has(programId)) {
      errors.push({ row: rowNum, field: 'program_id', value: programId, message: 'Program not found' });
      continue;
    }

    const nationalId = row.national_id ? String(row.national_id).trim() : undefined;
    const examsId = row.exams_id ? String(row.exams_id).trim() : undefined;

    // Duplicate detection
    let isDuplicate = false;
    if (nationalId) {
      const existing = await prisma.beneficiary.findFirst({ where: { national_id: nationalId, program_id: programId } });
      if (existing) isDuplicate = true;
    }
    if (!isDuplicate && examsId) {
      const existing = await prisma.beneficiary.findFirst({ where: { exams_id: examsId, program_id: programId } });
      if (existing) isDuplicate = true;
    }

    if (isDuplicate) {
      skippedDuplicates++;
      continue;
    }

    // Generate identifier
    const identifier = `PT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const dob = row.date_of_birth ? new Date(row.date_of_birth) : undefined;
    if (row.date_of_birth && isNaN(dob?.getTime() || 0)) {
      errors.push({ row: rowNum, field: 'date_of_birth', value: row.date_of_birth, message: 'Invalid date format' });
      continue;
    }

    try {
      const beneficiary = await prisma.beneficiary.create({
        data: {
          beneficiary_identifier: identifier,
          first_name: row.first_name.trim(),
          last_name: row.last_name.trim(),
          gender: row.gender.trim(),
          district: districtName,
          school_id: schoolId,
          program_id: programId,
          date_of_birth: dob,
          national_id: nationalId,
          exams_id: examsId,
          contact_email: row.contact_email ? String(row.contact_email).trim() : undefined,
          contact_phone: row.contact_phone ? String(row.contact_phone).trim() : undefined,
          academic_year: row.academic_year ? String(row.academic_year).trim() : undefined,
          status: 'Imported',
        },
      });

      // Create guardian if provided
      if (row.guardian_name && row.guardian_relationship) {
        await prisma.guardian.create({
          data: {
            beneficiary_id: beneficiary.id,
            name: String(row.guardian_name).trim(),
            relationship: String(row.guardian_relationship).trim(),
            contact_phone: row.guardian_phone ? String(row.guardian_phone).trim() : '',
          },
        });
      }

      createdIds.push(beneficiary.id);
    } catch (e: any) {
      errors.push({ row: rowNum, field: 'general', value: '', message: e.message || 'Database error' });
    }
  }

  // Log audit
  await logAudit({
    user_id: req.user?.userId,
    action: 'import',
    entity_type: 'Beneficiary',
    entity_id: 'bulk',
    new_values: { total_rows: rows.length, created: createdIds.length, skipped_duplicates: skippedDuplicates, errors: errors.length },
  });

  res.status(201).json({
    status: 'success',
    data: {
      total_rows: rows.length,
      created: createdIds.length,
      created_ids: createdIds,
      skipped_duplicates: skippedDuplicates,
      errors: errors.length > 0 ? errors : undefined,
      error_log_csv: errors.length > 0 ? generateErrorCsv(errors) : undefined,
    },
    message: `Import completed: ${createdIds.length} created, ${skippedDuplicates} duplicates skipped, ${errors.length} errors`,
  });
}

function generateErrorCsv(errors: ImportError[]): string {
  return stringify(errors, { header: true, columns: ['row', 'field', 'value', 'message'] });
}

// ── Import history ──

/**
 * @openapi
 * /admin/imports:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: List beneficiary bulk import history (derived from the audit log)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated import history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: b4c3d2e1-5555-4a2b-9b0a-4a2b6c1e0005
 *                     action: import
 *                     entity_type: Beneficiary
 *                     new_values:
 *                       total_rows: 3
 *                       created: 2
 *                       skipped_duplicates: 1
 *                       errors: 1
 *                     user:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Grace Banda
 *                       email: grace.banda@presstrust.mw
 *                     created_at: 2026-01-16T09:00:00.000Z
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Import history retrieved successfully
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
export async function listImports(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const [imports, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: { action: 'import', entity_type: 'Beneficiary' },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where: { action: 'import', entity_type: 'Beneficiary' } }),
  ]);

  const data = imports.map((imp: any) => ({
    id: imp.id,
    action: imp.action,
    entity_type: imp.entity_type,
    new_values: imp.new_values,
    user: imp.user,
    created_at: imp.created_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Import history retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/imports/{importId}:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: Get a single beneficiary bulk import summary by its audit log ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: importId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Import summary retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: b4c3d2e1-5555-4a2b-9b0a-4a2b6c1e0005
 *                 action: import
 *                 entity_type: Beneficiary
 *                 new_values:
 *                   total_rows: 3
 *                   created: 2
 *                   skipped_duplicates: 1
 *                   errors: 1
 *                 user:
 *                   id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Grace Banda
 *                   email: grace.banda@presstrust.mw
 *                 created_at: 2026-01-16T09:00:00.000Z
 *               message: Import summary retrieved successfully
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
 *         description: Import record not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Import record not found
 */
export async function getImportSummary(req: Request, res: Response): Promise<void> {
  const id = req.params.importId as string;

  const audit = await prisma.auditLog.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  if (!audit || audit.action !== 'import') {
    res.status(404).json({ status: 'error', data: null, message: 'Import record not found' });
    return;
  }

  res.json({
    status: 'success',
    data: {
      id: audit.id,
      action: audit.action,
      entity_type: audit.entity_type,
      new_values: audit.new_values,
      user: audit.user,
      created_at: audit.created_at,
    },
    message: 'Import summary retrieved successfully',
  });
}
