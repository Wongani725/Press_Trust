import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listDisbursements,
  createDisbursement,
  batchCreateDisbursements,
  getDisbursement,
  updateDisbursement,
  approveDisbursement,
  rejectDisbursement,
  linkEvidence,
  updateDisbursementStatus,
  reconcileDisbursement,
  reverseDisbursement,
  returnDisbursement,
} from '../../controllers/admin/disbursements.controller';

const router = Router();

const createDisbursementSchema = z.object({
  award_id: z.string().uuid(),
  amount: z.number().min(0.01),
  category: z.string().min(1),
  academic_period: z.string().min(1),
  payee_type: z.enum(['school', 'guardian', 'vendor']),
  payee_id: z.string().uuid().optional(),
  payee_name: z.string().min(1),
  payee_bank_account: z.string().min(1).optional(),
});

const updateDisbursementSchema = z.object({
  amount: z.number().min(0.01).optional(),
  category: z.string().min(1).optional(),
  academic_period: z.string().min(1).optional(),
  payee_type: z.enum(['school', 'guardian', 'vendor']).optional(),
  payee_id: z.string().uuid().optional().or(z.literal('')),
  payee_name: z.string().min(1).optional(),
  payee_bank_account: z.string().min(1).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

const evidenceSchema = z.object({
  document_id: z.string().uuid(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Requested', 'Approved', 'Paid', 'Failed', 'Reconciled']),
  failure_reason: z.string().optional(),
});

const batchSchema = z.object({
  items: z.array(createDisbursementSchema).min(1).max(50),
});

const reverseSchema = z.object({
  amount: z.number().min(0.01).optional(),
  reason: z.string().min(1),
});

const returnSchema = z.object({
  amount: z.number().min(0.01),
  reason: z.string().min(1),
});

// ── Routes ──
router.get('/admin/disbursements', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), listDisbursements);
router.post('/admin/disbursements', authenticate, authorize('SuperAdmin', 'Finance'), validate(createDisbursementSchema), createDisbursement);
router.post('/admin/disbursements/batch', authenticate, authorize('SuperAdmin', 'Finance'), validate(batchSchema), batchCreateDisbursements);
router.get('/admin/disbursements/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), getDisbursement);
router.put('/admin/disbursements/:id', authenticate, authorize('SuperAdmin', 'Finance'), validate(updateDisbursementSchema), updateDisbursement);
router.post('/admin/disbursements/:id/approve', authenticate, authorize('SuperAdmin', 'Finance'), approveDisbursement);
router.post('/admin/disbursements/:id/reject', authenticate, authorize('SuperAdmin', 'Finance'), validate(rejectSchema), rejectDisbursement);
router.post('/admin/disbursements/:id/evidence', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), validate(evidenceSchema), linkEvidence);
router.patch('/admin/disbursements/:id/status', authenticate, authorize('SuperAdmin', 'Finance'), validate(updateStatusSchema), updateDisbursementStatus);
router.post('/admin/disbursements/:id/reconcile', authenticate, authorize('SuperAdmin', 'Finance'), reconcileDisbursement);
router.post('/admin/disbursements/:id/reverse', authenticate, authorize('SuperAdmin', 'Finance'), validate(reverseSchema), reverseDisbursement);
router.post('/admin/disbursements/:id/return', authenticate, authorize('SuperAdmin', 'Finance'), validate(returnSchema), returnDisbursement);

export default router;
