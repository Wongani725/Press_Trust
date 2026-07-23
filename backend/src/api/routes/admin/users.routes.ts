import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.middleware';
import { authorize } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  listUsers,
  createUser,
  getUser,
  updateUser,
  updateUserStatus,
  unlockUser,
  resetUserMfa,
} from '../../controllers/admin/users.controller';

const router = Router();

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role_id: z.string().uuid(),
  phone: z.string().optional(),
  programIds: z.array(z.string().uuid()).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role_id: z.string().uuid().optional(),
  phone: z.string().optional(),
  programIds: z.array(z.string().uuid()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'blocked']),
  reason: z.string().optional(),
});

router.get('/admin/users', authenticate, authorize('SuperAdmin'), listUsers);
router.post('/admin/users', authenticate, authorize('SuperAdmin'), validate(createUserSchema), createUser);
router.get('/admin/users/:id', authenticate, authorize('SuperAdmin'), getUser);
router.put('/admin/users/:id', authenticate, authorize('SuperAdmin'), validate(updateUserSchema), updateUser);
router.patch('/admin/users/:id/status', authenticate, authorize('SuperAdmin'), validate(updateStatusSchema), updateUserStatus);
router.post('/admin/users/:id/unlock', authenticate, authorize('SuperAdmin'), unlockUser);
router.post('/admin/users/:id/mfa/reset', authenticate, authorize('SuperAdmin'), resetUserMfa);

export default router;
