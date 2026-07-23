import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listDocuments,
  uploadDocument,
  getDocument,
  downloadDocument,
  updateDocumentStatus,
  uploadDocumentVersion,
  deleteDocument,
} from '../../controllers/admin/documents.controller';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// Zod schemas for non-file body validation
const uploadDocumentSchema = z.object({
  documentable_type: z.string().min(1),
  documentable_id: z.string().uuid(),
  document_type: z.enum([
    'application_form', 'id_copy', 'report_card', 'bank_statement',
    'receipt', 'award_letter', 'disbursement_evidence', 'medical_record', 'other',
  ]),
  expiry_date: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Pending', 'Verified', 'Rejected']),
  rejection_reason: z.string().optional(),
});

// ── Routes ──
router.get('/admin/documents', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), listDocuments);
router.post(
  '/admin/documents',
  authenticate,
  authorize('SuperAdmin', 'Operations', 'Finance'),
  upload.single('file'),
  validate(uploadDocumentSchema),
  uploadDocument
);
router.get('/admin/documents/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), getDocument);
router.get('/admin/documents/:id/download', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), downloadDocument);
router.patch(
  '/admin/documents/:id/status',
  authenticate,
  authorize('SuperAdmin', 'Operations'),
  validate(updateStatusSchema),
  updateDocumentStatus
);
router.post(
  '/admin/documents/:id/versions',
  authenticate,
  authorize('SuperAdmin', 'Operations', 'Finance'),
  upload.single('file'),
  uploadDocumentVersion
);
router.delete('/admin/documents/:id', authenticate, authorize('SuperAdmin', 'Operations'), deleteDocument);

export default router;
