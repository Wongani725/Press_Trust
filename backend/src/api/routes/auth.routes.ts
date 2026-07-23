import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  login,
  verifyMfa,
  refresh,
  logout,
  changePassword,
  getSession,
  setupMfa,
  verifyAndEnableMfa,
} from '../controllers/auth.controller';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const mfaSchema = z.object({
  token: z.string().length(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.post('/auth/login', validate(loginSchema), login);
router.post('/auth/mfa/verify', authenticate, validate(mfaSchema), verifyMfa);
router.post('/auth/refresh', validate(refreshSchema), refresh);
router.post('/auth/logout', authenticate, logout);
router.put('/auth/password/change', authenticate, validate(changePasswordSchema), changePassword);
router.get('/auth/session', authenticate, getSession);
router.post('/auth/mfa/setup', authenticate, setupMfa);
router.post('/auth/mfa/verify-setup', authenticate, validate(mfaSchema), verifyAndEnableMfa);

export default router;
