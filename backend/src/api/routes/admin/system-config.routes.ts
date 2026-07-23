import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import {
  listConfigs,
  getConfigByKey,
  updateConfigByKey,
  listCategories,
} from '../../controllers/admin/system-config.controller';

const router = Router();

router.get('/admin/system-config/categories', authenticate, authorize('SuperAdmin'), listCategories);
router.get('/admin/system-config', authenticate, authorize('SuperAdmin'), listConfigs);
router.get('/admin/system-config/:key', authenticate, authorize('SuperAdmin'), getConfigByKey);
router.put('/admin/system-config/:key', authenticate, authorize('SuperAdmin'), updateConfigByKey);

export default router;
