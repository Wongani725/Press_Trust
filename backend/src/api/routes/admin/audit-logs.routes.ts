import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listAuditLogs,
  getAuditLog,
  exportAuditLogs,
} from '../../controllers/admin/audit-logs.controller';

const router = Router();

// export route must be before :id to avoid matching "export" as an id
router.get('/admin/audit-logs/export', authenticate, authorize('SuperAdmin', 'Auditor'), exportAuditLogs);
router.get('/admin/audit-logs', authenticate, authorize('SuperAdmin', 'Auditor'), listAuditLogs);
router.get('/admin/audit-logs/:id', authenticate, authorize('SuperAdmin', 'Auditor'), getAuditLog);

export default router;
