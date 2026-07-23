import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listPerformance,
  createPerformance,
  getPerformance,
  updatePerformance,
  deletePerformance,
  listAtRiskFlags,
  createAtRiskFlag,
  warnAtRiskFlag,
  resolveAtRiskFlag,
  autoFlagBeneficiaries,
  listInterventions,
  createIntervention,
  getIntervention,
  updateIntervention,
  updateInterventionStatus,
  listVisits,
  createVisit,
  getVisit,
  updateVisit,
  deleteVisit,
  listOutcomes,
  createOutcome,
  getOutcome,
  updateOutcome,
  deleteOutcome,
  getMetrics,
} from '../../controllers/admin/me.controller';

const router = Router();

// ── Performance ──
router.get('/admin/me/performance', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), listPerformance);
router.post('/admin/me/performance', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), createPerformance);
router.get('/admin/me/performance/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), getPerformance);
router.put('/admin/me/performance/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), updatePerformance);
router.delete('/admin/me/performance/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), deletePerformance);

// ── At-Risk Flags ──
router.get('/admin/me/at-risk', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), listAtRiskFlags);
router.post('/admin/me/at-risk', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), createAtRiskFlag);
router.post('/admin/me/at-risk/:id/warn', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), warnAtRiskFlag);
router.post('/admin/me/at-risk/:id/resolve', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), resolveAtRiskFlag);

// ── Auto-Flagging ──
router.post('/admin/me/auto-flag', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), autoFlagBeneficiaries);

// ── Interventions ──
router.get('/admin/me/interventions', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), listInterventions);
router.post('/admin/me/interventions', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), createIntervention);
router.get('/admin/me/interventions/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), getIntervention);
router.put('/admin/me/interventions/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), updateIntervention);
router.patch('/admin/me/interventions/:id/status', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), updateInterventionStatus);

// ── Monitoring Visits ──
router.get('/admin/me/visits', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), listVisits);
router.post('/admin/me/visits', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), createVisit);
router.get('/admin/me/visits/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), getVisit);
router.put('/admin/me/visits/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), updateVisit);
router.delete('/admin/me/visits/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), deleteVisit);

// ── Outcomes ──
router.get('/admin/me/outcomes', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), listOutcomes);
router.post('/admin/me/outcomes', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), createOutcome);
router.get('/admin/me/outcomes/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), getOutcome);
router.put('/admin/me/outcomes/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), updateOutcome);
router.delete('/admin/me/outcomes/:id', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), deleteOutcome);

// ── Metrics ──
router.get('/admin/me/metrics', authenticate, authorize('SuperAdmin', 'Operations', 'ME'), getMetrics);

export default router;
