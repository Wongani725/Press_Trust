import { Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { generateStoredName, saveFile, readFileStream, deleteFile, sanitizeFilename } from '../../../infrastructure/storage/file-storage.service';

// ── Constants ──

const ALLOWED_DOCUMENT_TYPES = [
  'application_form', 'id_copy', 'report_card', 'bank_statement',
  'receipt', 'award_letter', 'disbursement_evidence', 'medical_record', 'other',
];

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/jpg',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// ── Zod schemas ──

const uploadDocumentSchema = z.object({
  documentable_type: z.string().min(1),
  documentable_id: z.string().uuid(),
  document_type: z.enum(ALLOWED_DOCUMENT_TYPES as [string, ...string[]]),
  expiry_date: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Pending', 'Verified', 'Rejected']),
  rejection_reason: z.string().optional(),
});

// ── Virus scan simulation ──

function simulateVirusScan(originalName: string, mimeType: string): string {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.exe' || ext === '.bat' || ext === '.sh' || ext === '.cmd') {
    return 'infected';
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return 'infected';
  }
  return 'clean';
}

// ── Helpers ──

function maskDocument(d: any) {
  return {
    id: d.id,
    documentable_id: d.documentable_id,
    documentable_type: d.documentable_type,
    file_path: d.file_path,
    original_name: d.original_name,
    mime_type: d.mime_type,
    file_size: d.file_size,
    document_type: d.document_type,
    status: d.status,
    rejection_reason: d.rejection_reason,
    version: d.version,
    expiry_date: d.expiry_date,
    virus_scan_status: d.virus_scan_status,
    uploaded_by: d.uploader ? { id: d.uploader.id, name: d.uploader.name } : undefined,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

// ── List documents ──

/**
 * @openapi
 * /admin/documents:
 *   get:
 *     tags: [Documents]
 *     summary: List documents with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: documentable_type
 *         schema: { type: string }
 *       - in: query
 *         name: documentable_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: document_type
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Pending, Verified, Rejected] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of documents
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f
 *                     documentable_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     documentable_type: Beneficiary
 *                     file_path: /app/uploads/Beneficiary_3fa85f64-5717-4562-b3fc-2c963f66afa6_v1_1768470000000.pdf
 *                     original_name: grace_banda_report_card_2026.pdf
 *                     mime_type: application/pdf
 *                     file_size: 245760
 *                     document_type: report_card
 *                     status: Pending
 *                     rejection_reason: null
 *                     version: 1
 *                     expiry_date: null
 *                     virus_scan_status: clean
 *                     uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-15T09:30:00.000Z
 *                   - id: 6e2a4c8d-3b5f-4a7c-9d1e-8f2b6a4c0e3d
 *                     documentable_id: 8c9e6679-7425-40de-944b-e07fc1f90ae7
 *                     documentable_type: Beneficiary
 *                     file_path: /app/uploads/Beneficiary_8c9e6679-7425-40de-944b-e07fc1f90ae7_v2_1768471200000.jpg
 *                     original_name: chikondi_mwale_id_copy.jpg
 *                     mime_type: image/jpeg
 *                     file_size: 98304
 *                     document_type: id_copy
 *                     status: Verified
 *                     rejection_reason: null
 *                     version: 2
 *                     expiry_date: null
 *                     virus_scan_status: clean
 *                     uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                     created_at: 2026-01-16T10:00:00.000Z
 *                     updated_at: 2026-01-17T08:30:00.000Z
 *                 meta: { page: 1, limit: 20, total: 32, totalPages: 2 }
 *               message: Documents retrieved successfully
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
export async function listDocuments(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const documentableType = req.query.documentable_type as string | undefined;
  const documentableId = req.query.documentable_id as string | undefined;
  const documentType = req.query.document_type as string | undefined;
  const status = req.query.status as string | undefined;

  const where: Record<string, unknown> = {};
  if (documentableType) where.documentable_type = documentableType;
  if (documentableId) where.documentable_id = documentableId;
  if (documentType) where.document_type = documentType;
  if (status) where.status = status;

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { uploader: { select: { id: true, name: true } } },
    }),
    prisma.document.count({ where }),
  ]);

  const data = (documents as any[]).map(maskDocument);

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Documents retrieved successfully',
  });
}

// ── Upload document ──

/**
 * @openapi
 * /admin/documents:
 *   post:
 *     tags: [Documents]
 *     summary: Upload a new document
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/DocumentCreate'
 *     responses:
 *       201:
 *         description: Document uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f
 *                 documentable_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 documentable_type: Beneficiary
 *                 file_path: /app/uploads/Beneficiary_3fa85f64-5717-4562-b3fc-2c963f66afa6_v1_1768470000000.pdf
 *                 original_name: grace_banda_report_card_2026.pdf
 *                 mime_type: application/pdf
 *                 file_size: 245760
 *                 document_type: report_card
 *                 status: Pending
 *                 rejection_reason: null
 *                 version: 1
 *                 expiry_date: null
 *                 virus_scan_status: clean
 *                 uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Document uploaded successfully
 *       400:
 *         description: Validation error or invalid file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: File is required
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
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ status: 'error', data: null, message: 'File is required' });
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    res.status(400).json({ status: 'error', data: null, message: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` });
    return;
  }

  const body = uploadDocumentSchema.parse(req.body);

  // Determine next version for this scope
  const latest = await prisma.document.findFirst({
    where: {
      documentable_id: body.documentable_id,
      documentable_type: body.documentable_type,
      document_type: body.document_type,
    },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latest?.version || 0) + 1;

  const storedName = generateStoredName(
    body.documentable_type,
    body.documentable_id,
    nextVersion,
    sanitizeFilename(file.originalname)
  );

  const filePath = await saveFile(file.buffer, storedName);
  const virusStatus = simulateVirusScan(file.originalname, file.mimetype);

  const expiryDate = body.expiry_date ? new Date(body.expiry_date) : undefined;
  if (body.expiry_date && isNaN(expiryDate?.getTime() || 0)) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid expiry_date format' });
    return;
  }

  const document = await prisma.document.create({
    data: {
      documentable_id: body.documentable_id,
      documentable_type: body.documentable_type,
      file_path: filePath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      document_type: body.document_type,
      version: nextVersion,
      expiry_date: expiryDate,
      virus_scan_status: virusStatus,
      uploaded_by: req.user!.userId,
    },
    include: { uploader: { select: { id: true, name: true } } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'upload',
    entity_type: 'Document',
    entity_id: document.id,
    new_values: {
      documentable_id: body.documentable_id,
      documentable_type: body.documentable_type,
      document_type: body.document_type,
      version: nextVersion,
      virus_scan_status: virusStatus,
      file_size: file.size,
    },
  });

  res.status(201).json({
    status: 'success',
    data: maskDocument(document),
    message: virusStatus === 'infected'
      ? 'Document uploaded but flagged as potentially infected'
      : 'Document uploaded successfully',
  });
}

// ── Get document ──

/**
 * @openapi
 * /admin/documents/{id}:
 *   get:
 *     tags: [Documents]
 *     summary: Get document metadata
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f
 *                 documentable_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 documentable_type: Beneficiary
 *                 file_path: /app/uploads/Beneficiary_3fa85f64-5717-4562-b3fc-2c963f66afa6_v1_1768470000000.pdf
 *                 original_name: grace_banda_report_card_2026.pdf
 *                 mime_type: application/pdf
 *                 file_size: 245760
 *                 document_type: report_card
 *                 status: Verified
 *                 rejection_reason: null
 *                 version: 1
 *                 expiry_date: null
 *                 virus_scan_status: clean
 *                 uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-16T11:00:00.000Z
 *               message: Document retrieved successfully
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
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Document not found
 */
export async function getDocument(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const document = await prisma.document.findUnique({
    where: { id },
    include: { uploader: { select: { id: true, name: true } } },
  });

  if (!document) {
    res.status(404).json({ status: 'error', data: null, message: 'Document not found' });
    return;
  }

  res.json({
    status: 'success',
    data: maskDocument(document),
    message: 'Document retrieved successfully',
  });
}

// ── Download document ──

/**
 * @openapi
 * /admin/documents/{id}/download:
 *   get:
 *     tags: [Documents]
 *     summary: Download a document file
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: File stream
 *         content:
 *           application/octet-stream:
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
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Document not found
 *       500:
 *         description: Invalid file path
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Invalid file path
 */
export async function downloadDocument(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    res.status(404).json({ status: 'error', data: null, message: 'Document not found' });
    return;
  }

  const fileName = path.basename(document.file_path);
  if (!fileName) {
    res.status(500).json({ status: 'error', data: null, message: 'Invalid file path' });
    return;
  }

  await logAudit({
    user_id: req.user?.userId,
    action: 'download',
    entity_type: 'Document',
    entity_id: id,
    new_values: { original_name: document.original_name, mime_type: document.mime_type },
  });

  res.setHeader('Content-Disposition', `attachment; filename="${document.original_name}"`);
  res.setHeader('Content-Type', document.mime_type);

  const stream = readFileStream(fileName);
  stream.pipe(res);
}

// ── Update status ──

/**
 * @openapi
 * /admin/documents/{id}/status:
 *   patch:
 *     tags: [Documents]
 *     summary: Update document verification status
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
 *             $ref: '#/components/schemas/DocumentStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f
 *                 documentable_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 documentable_type: Beneficiary
 *                 file_path: /app/uploads/Beneficiary_3fa85f64-5717-4562-b3fc-2c963f66afa6_v1_1768470000000.pdf
 *                 original_name: grace_banda_report_card_2026.pdf
 *                 mime_type: application/pdf
 *                 file_size: 245760
 *                 document_type: report_card
 *                 status: Rejected
 *                 rejection_reason: Document image is illegible, please re-upload a clearer scan
 *                 version: 1
 *                 expiry_date: null
 *                 virus_scan_status: clean
 *                 uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-24T15:20:00.000Z
 *               message: Document status updated to Rejected
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: rejection_reason is required when rejecting a document
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
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Document not found
 */
export async function updateDocumentStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, rejection_reason } = updateStatusSchema.parse(req.body);

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    res.status(404).json({ status: 'error', data: null, message: 'Document not found' });
    return;
  }

  // Rejection requires reason
  if (status === 'Rejected' && !rejection_reason) {
    res.status(400).json({ status: 'error', data: null, message: 'rejection_reason is required when rejecting a document' });
    return;
  }

  const updated = await prisma.document.update({
    where: { id },
    data: { status, rejection_reason: rejection_reason || null },
    include: { uploader: { select: { id: true, name: true } } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Document',
    entity_id: id,
    old_values: { status: document.status, rejection_reason: document.rejection_reason },
    new_values: { status, rejection_reason },
  });

  res.json({
    status: 'success',
    data: maskDocument(updated),
    message: `Document status updated to ${status}`,
  });
}

// ── Upload new version ──

/**
 * @openapi
 * /admin/documents/{id}/versions:
 *   post:
 *     tags: [Documents]
 *     summary: Upload a new version of a document
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/DocumentVersionUpload'
 *     responses:
 *       201:
 *         description: New version uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 7a1b3c5d-9e2f-4a6b-8c0d-1e3f5a7b9c2d
 *                 documentable_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 documentable_type: Beneficiary
 *                 file_path: /app/uploads/Beneficiary_3fa85f64-5717-4562-b3fc-2c963f66afa6_v2_1768560000000.pdf
 *                 original_name: grace_banda_report_card_2026_v2.pdf
 *                 mime_type: application/pdf
 *                 file_size: 251904
 *                 document_type: report_card
 *                 status: Pending
 *                 rejection_reason: null
 *                 version: 2
 *                 expiry_date: null
 *                 virus_scan_status: clean
 *                 uploaded_by: { id: 2f4e6a8c-1b3d-5f7e-9a0c-2b4d6f8e0a1c, name: Thoko Phiri }
 *                 created_at: 2026-01-25T09:00:00.000Z
 *                 updated_at: 2026-01-25T09:00:00.000Z
 *               message: Document version 2 uploaded successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: File is required
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
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Parent document not found
 */
export async function uploadDocumentVersion(req: Request, res: Response): Promise<void> {
  const parentId = req.params.id as string;
  const file = (req as any).file;

  if (!file) {
    res.status(400).json({ status: 'error', data: null, message: 'File is required' });
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    res.status(400).json({ status: 'error', data: null, message: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` });
    return;
  }

  const parent = await prisma.document.findUnique({ where: { id: parentId } });
  if (!parent) {
    res.status(404).json({ status: 'error', data: null, message: 'Parent document not found' });
    return;
  }

  // Determine next version for this scope
  const latest = await prisma.document.findFirst({
    where: {
      documentable_id: parent.documentable_id,
      documentable_type: parent.documentable_type,
      document_type: parent.document_type,
    },
    orderBy: { version: 'desc' },
  });

  const nextVersion = (latest?.version || 0) + 1;

  const storedName = generateStoredName(
    parent.documentable_type,
    parent.documentable_id,
    nextVersion,
    sanitizeFilename(file.originalname)
  );

  const filePath = await saveFile(file.buffer, storedName);
  const virusStatus = simulateVirusScan(file.originalname, file.mimetype);

  const document = await prisma.document.create({
    data: {
      documentable_id: parent.documentable_id,
      documentable_type: parent.documentable_type,
      file_path: filePath,
      original_name: file.originalname,
      mime_type: file.mimetype,
      file_size: file.size,
      document_type: parent.document_type,
      version: nextVersion,
      virus_scan_status: virusStatus,
      uploaded_by: req.user!.userId,
    },
    include: { uploader: { select: { id: true, name: true } } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'version_upload',
    entity_type: 'Document',
    entity_id: document.id,
    new_values: {
      parent_id: parentId,
      documentable_id: parent.documentable_id,
      documentable_type: parent.documentable_type,
      document_type: parent.document_type,
      version: nextVersion,
      virus_scan_status: virusStatus,
    },
  });

  res.status(201).json({
    status: 'success',
    data: maskDocument(document),
    message: `Document version ${nextVersion} uploaded successfully`,
  });
}

// ── Delete document ──

/**
 * @openapi
 * /admin/documents/{id}:
 *   delete:
 *     tags: [Documents]
 *     summary: Delete a document
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Document deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 4c5d6e7f-8a9b-0c1d-2e3f-4a5b6c7d8e9f
 *                 deleted: true
 *               message: Document deleted successfully
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
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Document not found
 *       409:
 *         description: Document linked to approved financial transaction
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Cannot delete document linked to an approved, paid, or reconciled disbursement
 */
export async function deleteDocument(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) {
    res.status(404).json({ status: 'error', data: null, message: 'Document not found' });
    return;
  }

  // Check if linked to approved/paid/reconciled disbursement
  const linkedEvidence = await prisma.disbursementEvidence.findFirst({
    where: { document_id: id },
    include: { disbursement: { select: { status: true } } },
  });

  if (linkedEvidence && ['Approved', 'Paid', 'Reconciled'].includes(linkedEvidence.disbursement.status)) {
    res.status(409).json({
      status: 'error',
      data: null,
      message: 'Cannot delete document linked to an approved, paid, or reconciled disbursement',
    });
    return;
  }

  // Delete file from disk
  const fileName = path.basename(document.file_path);
  await deleteFile(fileName);

  await prisma.document.delete({ where: { id } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'Document',
    entity_id: id,
    old_values: { original_name: document.original_name, document_type: document.document_type, version: document.version },
  });

  res.json({
    status: 'success',
    data: { id, deleted: true },
    message: 'Document deleted successfully',
  });
}
