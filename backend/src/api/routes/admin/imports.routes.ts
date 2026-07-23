import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  downloadBeneficiaryTemplate,
  getTemplateMetadata,
  importBeneficiaries,
  listImports,
  getImportSummary,
} from '../../controllers/admin/imports.controller';
import {
  listPendingBeneficiaries,
  validateBeneficiary,
  approveBeneficiary,
  flagException,
  resolveException,
} from '../../controllers/admin/onboarding.controller';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// ── Templates ──
router.get('/admin/imports/templates/beneficiary', authenticate, authorize('SuperAdmin', 'Operations'), downloadBeneficiaryTemplate);
router.get('/admin/imports/templates/beneficiary/metadata', authenticate, authorize('SuperAdmin', 'Operations'), getTemplateMetadata);

// ── Import upload ──
router.post('/admin/imports/beneficiaries', authenticate, authorize('SuperAdmin', 'Operations'), upload.single('file'), importBeneficiaries);

// ── Import history ──
router.get('/admin/imports', authenticate, authorize('SuperAdmin', 'Operations'), listImports);
router.get('/admin/imports/:importId', authenticate, authorize('SuperAdmin', 'Operations'), getImportSummary);

// ── Onboarding workflow ──
router.get('/admin/onboarding/pending', authenticate, authorize('SuperAdmin', 'Operations'), listPendingBeneficiaries);
router.post('/admin/onboarding/:id/validate', authenticate, authorize('SuperAdmin', 'Operations'), validateBeneficiary);
router.post('/admin/onboarding/:id/approve', authenticate, authorize('SuperAdmin', 'Operations'), approveBeneficiary);
router.post('/admin/onboarding/:id/exception', authenticate, authorize('SuperAdmin', 'Operations'), flagException);
router.put('/admin/onboarding/exceptions/:id/resolve', authenticate, authorize('SuperAdmin', 'Operations'), resolveException);

export default router;
