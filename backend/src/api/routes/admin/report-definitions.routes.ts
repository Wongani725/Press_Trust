import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listReportDefinitions,
  createReportDefinition,
  getReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  getReportSources,
  executeReportDefinitionHandler,
} from '../../controllers/admin/report-definitions.controller';

const router = Router();

router.get('/admin/report-definitions/sources', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), getReportSources);
router.get('/admin/report-definitions', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), listReportDefinitions);
router.post('/admin/report-definitions', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), createReportDefinition);
router.get('/admin/report-definitions/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), getReportDefinition);
router.put('/admin/report-definitions/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), updateReportDefinition);
router.delete('/admin/report-definitions/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), deleteReportDefinition);
router.post('/admin/report-definitions/:id/execute', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor'), executeReportDefinitionHandler);

export default router;
