import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  getDashboard,
  reportBeneficiaries,
  reportAwards,
  reportDisbursements,
  reportBudget,
  reportPaymentsBySchool,
  reportMeOutcomes,
  reportReconciliation,
} from '../../controllers/admin/reports.controller';

const router = Router();

// ── Dashboard ──
router.get('/admin/dashboard', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), getDashboard);

// ── Reports ──
router.get('/admin/reports/beneficiaries', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), reportBeneficiaries);
router.get('/admin/reports/awards', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), reportAwards);
router.get('/admin/reports/disbursements', authenticate, authorize('SuperAdmin', 'Finance', 'Auditor'), reportDisbursements);
router.get('/admin/reports/budget', authenticate, authorize('SuperAdmin', 'Finance', 'Auditor'), reportBudget);
router.get('/admin/reports/payments-by-school', authenticate, authorize('SuperAdmin', 'Finance', 'Auditor'), reportPaymentsBySchool);
router.get('/admin/reports/me-outcomes', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), reportMeOutcomes);
router.get('/admin/reports/reconciliation', authenticate, authorize('SuperAdmin', 'Finance', 'Auditor'), reportReconciliation);

export default router;
