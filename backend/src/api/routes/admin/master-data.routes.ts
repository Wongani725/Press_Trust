import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listSchools,
  createSchool,
  getSchool,
  updateSchool,
  updateSchoolStatus,
  listBankAccounts,
  createBankAccount,
  getBankAccount,
  updateBankAccount,
  updateBankAccountStatus,
  approveBankAccount,
  rejectBankAccount,
  listFundingSources,
  createFundingSource,
  getFundingSource,
  updateFundingSource,
  updateFundingSourceStatus,
  listDisbursementItems,
  createDisbursementItem,
  updateDisbursementItem,
  updateDisbursementItemStatus,
  listReferenceData,
  createReferenceData,
  updateReferenceData,
  updateReferenceDataStatus,
} from '../../controllers/admin/master-data.controller';

const router = Router();

// ── Schools ──
const createSchoolSchema = z.object({
  name: z.string().min(1),
  type: z.string().default('secondary'),
  district: z.string().min(1),
  location: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  registration_status: z.string().optional(),
});

const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  district: z.string().min(1).optional(),
  location: z.string().optional(),
  contact_phone: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  registration_status: z.string().optional(),
});

const updateSchoolStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

router.get('/admin/schools', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listSchools);
router.post('/admin/schools', authenticate, authorize('SuperAdmin', 'Operations'), validate(createSchoolSchema), createSchool);
router.get('/admin/schools/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getSchool);
router.put('/admin/schools/:id', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateSchoolSchema), updateSchool);
router.patch('/admin/schools/:id/status', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateSchoolStatusSchema), updateSchoolStatus);

// ── Bank Accounts ──
const createBankAccountSchema = z.object({
  bank_name: z.string().min(1),
  branch: z.string().optional(),
  account_number: z.string().min(1),
  account_holder_name: z.string().min(1),
});

const updateBankAccountSchema = z.object({
  bank_name: z.string().min(1).optional(),
  branch: z.string().optional(),
  account_number: z.string().min(1).optional(),
  account_holder_name: z.string().min(1).optional(),
});

const updateBankAccountStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

router.get('/admin/schools/:schoolId/bank-accounts', authenticate, authorize('SuperAdmin', 'Finance'), listBankAccounts);
router.post('/admin/schools/:schoolId/bank-accounts', authenticate, authorize('SuperAdmin', 'Finance'), validate(createBankAccountSchema), createBankAccount);
router.get('/admin/schools/:schoolId/bank-accounts/:id', authenticate, authorize('SuperAdmin', 'Finance'), getBankAccount);
router.put('/admin/schools/:schoolId/bank-accounts/:id', authenticate, authorize('SuperAdmin', 'Finance'), validate(updateBankAccountSchema), updateBankAccount);
router.patch('/admin/schools/:schoolId/bank-accounts/:id/status', authenticate, authorize('SuperAdmin', 'Finance'), validate(updateBankAccountStatusSchema), updateBankAccountStatus);
router.post('/admin/schools/:schoolId/bank-accounts/:id/approve', authenticate, authorize('SuperAdmin', 'Finance'), approveBankAccount);
router.post('/admin/schools/:schoolId/bank-accounts/:id/reject', authenticate, authorize('SuperAdmin', 'Finance'), rejectBankAccount);

// ── Funding Sources ──
const createFundingSourceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  total_allocation: z.number().min(0).optional(),
});

const updateFundingSourceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  total_allocation: z.number().min(0).optional(),
});

const updateFundingSourceStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

router.get('/admin/funding-sources', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), listFundingSources);
router.post('/admin/funding-sources', authenticate, authorize('SuperAdmin', 'Operations'), validate(createFundingSourceSchema), createFundingSource);
router.get('/admin/funding-sources/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), getFundingSource);
router.put('/admin/funding-sources/:id', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateFundingSourceSchema), updateFundingSource);
router.patch('/admin/funding-sources/:id/status', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateFundingSourceStatusSchema), updateFundingSourceStatus);

// ── Disbursement Items ──
const createDisbursementItemSchema = z.object({
  name: z.string().min(1),
});

const updateDisbursementItemSchema = z.object({
  name: z.string().min(1).optional(),
});

const updateDisbursementItemStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

router.get('/admin/disbursement-items', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), listDisbursementItems);
router.post('/admin/disbursement-items', authenticate, authorize('SuperAdmin'), validate(createDisbursementItemSchema), createDisbursementItem);
router.put('/admin/disbursement-items/:id', authenticate, authorize('SuperAdmin'), validate(updateDisbursementItemSchema), updateDisbursementItem);
router.patch('/admin/disbursement-items/:id/status', authenticate, authorize('SuperAdmin'), validate(updateDisbursementItemStatusSchema), updateDisbursementItemStatus);

// ── Reference Data ──
const createReferenceDataSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
});

const updateReferenceDataSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
});

const updateReferenceDataStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

router.get('/admin/reference-data/:type', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listReferenceData);
router.post('/admin/reference-data/:type', authenticate, authorize('SuperAdmin'), validate(createReferenceDataSchema), createReferenceData);
router.put('/admin/reference-data/:type/:id', authenticate, authorize('SuperAdmin'), validate(updateReferenceDataSchema), updateReferenceData);
router.patch('/admin/reference-data/:type/:id/status', authenticate, authorize('SuperAdmin'), validate(updateReferenceDataStatusSchema), updateReferenceDataStatus);

export default router;
