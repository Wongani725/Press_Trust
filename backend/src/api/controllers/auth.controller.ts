import { Request, Response } from 'express';
import prisma from '../../infrastructure/database/prisma';
import { hashPassword, verifyPassword } from '../../modules/users/domain/password.service';
import {
  generateAccessToken,
  generateRefreshToken,
  generateMfaSecret,
  verifyMfaToken,
  generateQrCodeDataUrl,
  generateOtpCode,
  verifyOtpCode,
  getOtpExpiry,
  verifyRefreshToken,
  TokenPayload,
  OTP_EXPIRY_MINUTES,
} from '../../infrastructure/auth/jwt';
import { sendEmail } from '../../infrastructure/email/email.service';
import { otpEmailHtml } from '../../infrastructure/email/otp-template';
import { config } from '../../shared/config';

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Authenticate user with email and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: Account locked
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(401).json({ status: 'error', data: null, message: 'Invalid email or password' });
    return;
  }

  if (user.status !== 'active') {
    res.status(401).json({ status: 'error', data: null, message: 'Account is not active' });
    return;
  }

  if (user.locked_until && user.locked_until > new Date()) {
    const remaining = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
    res.status(423).json({ status: 'error', data: { remainingMinutes: remaining }, message: `Account locked. Try again in ${remaining} minutes` });
    return;
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    const attempts = user.failed_login_attempts + 1;
    const update: Record<string, unknown> = { failed_login_attempts: attempts };
    if (attempts >= config.security.lockoutThreshold) {
      update.locked_until = new Date(Date.now() + config.security.lockoutDurationMinutes * 60 * 1000);
    }
    await prisma.user.update({ where: { id: user.id }, data: update });

    res.status(401).json({ status: 'error', data: null, message: 'Invalid email or password' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failed_login_attempts: 0, locked_until: null, last_login: new Date() },
  });

  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role_name };

  if (user.mfa_enabled && user.mfa_method === 'email_otp') {
    const { plain, hash } = generateOtpCode();
    await prisma.otpCode.create({
      data: { user_id: user.id, code: hash, type: 'mfa_login', expires_at: getOtpExpiry() },
    });

    try {
      await sendEmail({
        to: user.email,
        subject: 'Your Press Trust verification code',
        text: `Your verification code is: ${plain}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this code, please ignore this email.`,
        html: otpEmailHtml(plain, OTP_EXPIRY_MINUTES),
      });
    } catch {
      // non-blocking
    }

    const limitedAccessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const programIds = (await prisma.userProgram.findMany({ where: { user_id: user.id }, select: { program_id: true } })).map((p) => p.program_id);

    res.json({
      status: 'success',
      data: {
        accessToken: limitedAccessToken,
        refreshToken,
        expiresIn: config.jwt.expiresIn,
        mfaRequired: true,
        mfaMethod: 'email_otp',
        user: { id: user.id, name: user.name, email: user.email, role: user.role_name, programs: programIds },
      },
      message: 'Verification code sent to email',
    });
    return;
  }

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const programIds = (await prisma.userProgram.findMany({ where: { user_id: user.id }, select: { program_id: true } })).map((p) => p.program_id);

  res.json({
    status: 'success',
    data: {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      mfaRequired: user.mfa_enabled,
      mfaMethod: user.mfa_enabled ? user.mfa_method : undefined,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_name,
        programs: programIds,
      },
    },
    message: 'Login successful',
  });
}

/**
 * @openapi
 * /auth/mfa/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Verify MFA code (TOTP or email OTP) and get full access
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: '6-digit code from authenticator app or email' }
 *     responses:
 *       200:
 *         description: MFA verified
 *       401:
 *         description: Invalid MFA code
 */
export async function verifyMfa(req: Request, res: Response): Promise<void> {
  const { token } = req.body;
  if (!req.user) {
    res.status(401).json({ status: 'error', data: null, message: 'Not authenticated' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user || !user.mfa_enabled) {
    res.status(400).json({ status: 'error', data: null, message: 'MFA is not configured' });
    return;
  }

  if (user.mfa_method === 'email_otp') {
    const otp = await prisma.otpCode.findFirst({
      where: { user_id: user.id, type: 'mfa_login', used: false, expires_at: { gte: new Date() } },
      orderBy: { created_at: 'desc' },
    });

    if (!otp || !verifyOtpCode(token, otp.code)) {
      res.status(401).json({ status: 'error', data: null, message: 'Invalid or expired verification code' });
      return;
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role_name };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      status: 'success',
      data: { accessToken, refreshToken, expiresIn: config.jwt.expiresIn },
      message: 'MFA verified successfully',
    });
    return;
  }

  if (!user.mfa_secret) {
    res.status(400).json({ status: 'error', data: null, message: 'MFA is not configured' });
    return;
  }

  const valid = verifyMfaToken(user.mfa_secret, token);
  if (!valid) {
    res.status(401).json({ status: 'error', data: null, message: 'Invalid MFA code' });
    return;
  }

  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role_name };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  res.json({
    status: 'success',
    data: { accessToken, refreshToken, expiresIn: config.jwt.expiresIn },
    message: 'MFA verified successfully',
  });
}

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh expired access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Token refreshed
 *       401:
 *         description: Invalid refresh token
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    res.status(401).json({ status: 'error', data: null, message: 'Refresh token required' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.status !== 'active') {
      res.status(401).json({ status: 'error', data: null, message: 'User is not active' });
      return;
    }

    const newPayload: TokenPayload = { userId: user.id, email: user.email, role: user.role_name };
    const accessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    res.json({
      status: 'success',
      data: { accessToken, refreshToken: newRefreshToken, expiresIn: config.jwt.expiresIn },
      message: 'Token refreshed successfully',
    });
  } catch {
    res.status(401).json({ status: 'error', data: null, message: 'Invalid or expired refresh token' });
  }
}

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Invalidate current session
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
export async function logout(req: Request, res: Response): Promise<void> {
  res.json({ status: 'success', data: null, message: 'Logged out successfully' });
}

/**
 * @openapi
 * /auth/password/change:
 *   put:
 *     tags: [Auth]
 *     summary: Change current password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword: { type: string }
 *     responses:
 *       200:
 *         description: Password changed
 *       401:
 *         description: Current password incorrect
 */
export async function changePassword(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ status: 'error', data: null, message: 'Not authenticated' });
    return;
  }

  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    res.status(401).json({ status: 'error', data: null, message: 'Current password is incorrect' });
    return;
  }

  const password_hash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: user.id }, data: { password_hash } });

  res.json({ status: 'success', data: null, message: 'Password changed successfully' });
}

/**
 * @openapi
 * /auth/session:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user session info
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current session info
 */
export async function getSession(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ status: 'error', data: null, message: 'Not authenticated' });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, name: true, email: true, role: true, status: true, mfa_enabled: true, mfa_method: true },
  });

  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const programIds = (await prisma.userProgram.findMany({ where: { user_id: user.id }, select: { program_id: true } })).map((p) => p.program_id);

  res.json({
    status: 'success',
    data: { ...user, programs: programIds },
    message: 'Session retrieved successfully',
  });
}

/**
 * @openapi
 * /auth/mfa/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Generate MFA secret and QR code or send email OTP for setup
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               method: { type: string, enum: [totp, email_otp], default: totp }
 *     responses:
 *       200:
 *         description: MFA setup info
 */
export async function setupMfa(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ status: 'error', data: null, message: 'Not authenticated' });
    return;
  }

  const method = (req.body.method as string) || 'totp';

  if (method === 'email_otp') {
    const { plain, hash } = generateOtpCode();
    await prisma.otpCode.create({
      data: { user_id: req.user.userId, code: hash, type: 'mfa_setup', expires_at: getOtpExpiry() },
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

    try {
      await sendEmail({
        to: user!.email,
        subject: 'Your Press Trust verification code',
        text: `Your verification code is: ${plain}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this code, please ignore this email.`,
        html: otpEmailHtml(plain, OTP_EXPIRY_MINUTES),
      });
    } catch {
      // non-blocking
    }

    await prisma.user.update({ where: { id: req.user.userId }, data: { mfa_method: 'email_otp' } });

    res.json({
      status: 'success',
      data: { method: 'email_otp', sent: true },
      message: 'Verification code sent to your email',
    });
    return;
  }

  const { secret, otpauthUrl } = generateMfaSecret();
  const qrCode = await generateQrCodeDataUrl(otpauthUrl);

  await prisma.user.update({ where: { id: req.user.userId }, data: { mfa_secret: secret, mfa_method: 'totp' } });

  res.json({
    status: 'success',
    data: { qrCode, method: 'totp' },
    message: 'Scan QR code with authenticator app, then verify with /auth/mfa/verify-setup',
  });
}

/**
 * @openapi
 * /auth/mfa/verify-setup:
 *   post:
 *     tags: [Auth]
 *     summary: Verify and enable MFA after setup (TOTP or email OTP)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: '6-digit code from authenticator or email' }
 *     responses:
 *       200:
 *         description: MFA enabled
 *       400:
 *         description: Invalid code
 */
export async function verifyAndEnableMfa(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ status: 'error', data: null, message: 'Not authenticated' });
    return;
  }

  const { token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  if (user.mfa_method === 'email_otp') {
    const otp = await prisma.otpCode.findFirst({
      where: { user_id: user.id, type: 'mfa_setup', used: false, expires_at: { gte: new Date() } },
      orderBy: { created_at: 'desc' },
    });

    if (!otp || !verifyOtpCode(token, otp.code)) {
      res.status(400).json({ status: 'error', data: null, message: 'Invalid or expired verification code' });
      return;
    }

    await prisma.otpCode.update({ where: { id: otp.id }, data: { used: true } });
    await prisma.user.update({ where: { id: user.id }, data: { mfa_enabled: true, mfa_secret: null } });

    res.json({ status: 'success', data: null, message: 'Email OTP MFA enabled successfully' });
    return;
  }

  if (!user.mfa_secret) {
    res.status(400).json({ status: 'error', data: null, message: 'MFA secret not generated' });
    return;
  }

  const valid = verifyMfaToken(user.mfa_secret, token);
  if (!valid) {
    res.status(400).json({ status: 'error', data: null, message: 'Invalid verification code' });
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { mfa_enabled: true } });
  res.json({ status: 'success', data: null, message: 'TOTP MFA enabled successfully' });
}
