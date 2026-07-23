import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listAwards,
  createAward,
  getAward,
  updateAward,
  updateAwardStatus,
  reinstateAward,
  renewAward,
  generateAwardLetter,
} from '../../controllers/admin/awards.controller';

const router = Router();

const createAwardSchema = z.object({
  beneficiary_id: z.string().uuid(),
  program_id: z.string().uuid(),
  funding_source_id: z.string().uuid().optional(),
  amount: z.number().min(0),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']),
});

const updateAwardSchema = z.object({
  amount: z.number().min(0).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']).optional(),
  funding_source_id: z.string().uuid().optional().or(z.literal('')),
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Active', 'Suspended', 'Completed', 'Closed']),
  reason: z.string().optional(),
});

const renewSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  amount: z.number().min(0).optional(),
  award_type: z.enum(['one_off', 'recurring', 'renewable']).optional(),
});

// ── Routes ──
router.get('/admin/awards', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listAwards);
router.post('/admin/awards', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), validate(createAwardSchema), createAward);
router.get('/admin/awards/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getAward);
router.put('/admin/awards/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), validate(updateAwardSchema), updateAward);
router.patch('/admin/awards/:id/status', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), validate(updateStatusSchema), updateAwardStatus);
router.post('/admin/awards/:id/reinstate', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), reinstateAward);
router.post('/admin/awards/:id/renew', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), validate(renewSchema), renewAward);
router.post('/admin/awards/:id/letter/generate', authenticate, authorize('SuperAdmin', 'Operations', 'Finance'), generateAwardLetter);

export default router;
