import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listBeneficiaries,
  createBeneficiary,
  getBeneficiary,
  updateBeneficiary,
  updateBeneficiaryStatus,
  reinstateBeneficiary,
  recommendTermination,
  dismissTerminationRecommendation,
  listGuardians,
  createGuardian,
  updateGuardian,
  deleteGuardian,
} from '../../controllers/admin/beneficiaries.controller';

const router = Router();

const createBeneficiarySchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  gender: z.string().min(1),
  district: z.string().min(1),
  school_id: z.string().uuid(),
  program_id: z.string().uuid(),
  date_of_birth: z.string().optional(),
  national_id: z.string().optional(),
  exams_id: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  academic_year: z.string().optional(),
  guardian: z.object({
    name: z.string().min(1),
    relationship: z.string().min(1),
    contact_phone: z.string().min(1),
    contact_email: z.string().email().optional().or(z.literal('')),
  }).optional(),
});

const updateBeneficiarySchema = z.object({
  first_name: z.string().min(1).optional(),
  last_name: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  district: z.string().min(1).optional(),
  school_id: z.string().uuid().optional(),
  program_id: z.string().uuid().optional(),
  date_of_birth: z.string().optional(),
  national_id: z.string().optional(),
  exams_id: z.string().optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
  contact_phone: z.string().optional(),
  academic_year: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['Imported', 'PendingOnboarding', 'Active', 'Suspended', 'Closed']),
  reason: z.string().optional(),
});

const createGuardianSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  contact_phone: z.string().min(1),
  contact_email: z.string().email().optional().or(z.literal('')),
});

const updateGuardianSchema = z.object({
  name: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  contact_phone: z.string().min(1).optional(),
  contact_email: z.string().email().optional().or(z.literal('')),
});

// ── Beneficiaries ──
router.get('/admin/beneficiaries', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listBeneficiaries);
router.post('/admin/beneficiaries', authenticate, authorize('SuperAdmin', 'Operations'), validate(createBeneficiarySchema), createBeneficiary);
router.get('/admin/beneficiaries/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getBeneficiary);
router.put('/admin/beneficiaries/:id', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateBeneficiarySchema), updateBeneficiary);
router.patch('/admin/beneficiaries/:id/status', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateStatusSchema), updateBeneficiaryStatus);
router.post('/admin/beneficiaries/:id/reinstate', authenticate, authorize('SuperAdmin', 'Operations'), reinstateBeneficiary);
router.post('/admin/beneficiaries/:id/termination-recommendation', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), recommendTermination);
router.delete('/admin/beneficiaries/:id/termination-recommendation', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), dismissTerminationRecommendation);

// ── Guardians ──
router.get('/admin/beneficiaries/:id/guardians', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listGuardians);
router.post('/admin/beneficiaries/:id/guardians', authenticate, authorize('SuperAdmin', 'Operations'), validate(createGuardianSchema), createGuardian);
router.put('/admin/beneficiaries/:id/guardians/:guardianId', authenticate, authorize('SuperAdmin', 'Operations'), validate(updateGuardianSchema), updateGuardian);
router.delete('/admin/beneficiaries/:id/guardians/:guardianId', authenticate, authorize('SuperAdmin', 'Operations'), deleteGuardian);

export default router;
