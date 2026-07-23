import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listPrograms,
  createProgram,
  getProgram,
  updateProgram,
  updateProgramStatus,
  updateProgramBudget,
  updateProgramConfig,
} from '../../controllers/admin/programs.controller';

const router = Router();

const createProgramSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  application_open_date: z.string().datetime().optional(),
  application_close_date: z.string().datetime().optional(),
  budget_ceiling: z.number().min(0).optional(),
  award_types: z.array(z.enum(['one_off', 'recurring', 'renewable'])).optional(),
});

const updateProgramSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  application_open_date: z.string().datetime().optional(),
  application_close_date: z.string().datetime().optional(),
  award_types: z.array(z.enum(['one_off', 'recurring', 'renewable'])).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Draft', 'Open', 'Closed', 'Archived']),
  reason: z.string().optional(),
});

const updateBudgetSchema = z.object({
  budget_ceiling: z.number().min(0),
});

const updateConfigSchema = z.object({
  eligibility_rules: z.object({}).passthrough().optional(),
  evaluation_rubric: z.object({}).passthrough().optional(),
  workflow_config: z.object({}).passthrough().optional(),
  form_config: z.object({}).passthrough().optional(),
});

router.get('/admin/programs', authenticate, authorize('SuperAdmin', 'Operations'), listPrograms);
router.post('/admin/programs', authenticate, authorize('SuperAdmin', 'Operations'), validate(createProgramSchema), createProgram);
router.get('/admin/programs/:id', authenticate, authorize('SuperAdmin', 'Operations'), getProgram);
router.put('/admin/programs/:id', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateProgramSchema), updateProgram);
router.patch('/admin/programs/:id/status', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateStatusSchema), updateProgramStatus);
router.put('/admin/programs/:id/budget', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateBudgetSchema), updateProgramBudget);
router.put('/admin/programs/:id/config', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateConfigSchema), updateProgramConfig);

export default router;
