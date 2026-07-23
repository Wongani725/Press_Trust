import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listRoles,
  createRole,
  getRole,
  updateRole,
  updateRoleStatus,
  updateRolePermissions,
  deleteRole,
} from '../../controllers/admin/roles.controller';

const router = Router();

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.object({}).passthrough().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.object({}).passthrough().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

const permissionsSchema = z.object({
  permissions: z.object({}).passthrough(),
});

router.get('/admin/roles', authenticate, authorize('SuperAdmin'), listRoles);
router.post('/admin/roles', authenticate, authorize('SuperAdmin'), validate(createRoleSchema), createRole);
router.get('/admin/roles/:id', authenticate, authorize('SuperAdmin'), getRole);
router.put('/admin/roles/:id', authenticate, authorize('SuperAdmin'), validate(updateRoleSchema), updateRole);
router.patch('/admin/roles/:id/status', authenticate, authorize('SuperAdmin'), validate(updateStatusSchema), updateRoleStatus);
router.put('/admin/roles/:id/permissions', authenticate, authorize('SuperAdmin'), validate(permissionsSchema), updateRolePermissions);
router.delete('/admin/roles/:id', authenticate, authorize('SuperAdmin'), deleteRole);

export default router;
