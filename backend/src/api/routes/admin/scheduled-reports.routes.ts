import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listScheduledReports,
  createScheduledReport,
  getScheduledReport,
  updateScheduledReport,
  deleteScheduledReport,
  toggleScheduledReport,
  runNowScheduledReport,
  getScheduleRuns,
  getAllReportRuns,
} from '../../controllers/admin/scheduled-reports.controller';

const router = Router();

router.get('/admin/scheduled-reports', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), listScheduledReports);
router.post('/admin/scheduled-reports', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), createScheduledReport);
router.get('/admin/scheduled-reports/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getScheduledReport);
router.put('/admin/scheduled-reports/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), updateScheduledReport);
router.delete('/admin/scheduled-reports/:id', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), deleteScheduledReport);
router.patch('/admin/scheduled-reports/:id/toggle', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), toggleScheduledReport);
router.post('/admin/scheduled-reports/:id/run-now', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), runNowScheduledReport);
router.get('/admin/scheduled-reports/:id/runs', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getScheduleRuns);
router.get('/admin/report-runs', authenticate, authorize('SuperAdmin', 'Operations', 'Finance', 'ME'), getAllReportRuns);

export default router;
