import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../shared/config';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';

export type TokenPayload = {
  userId: string;
  email: string;
  role: string;
};

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
}

export function generateMfaSecret(): { secret: string; otpauthUrl: string } {
  const secret = speakeasy.generateSecret({
    name: config.security.mfaIssuer,
  });
  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url || '',
  };
}

export function verifyMfaToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 1,
  });
}

export async function generateQrCodeDataUrl(otpauthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpauthUrl);
}

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;

export function generateOtpCode(): { plain: string; hash: string } {
  const plain = Math.floor(100000 + Math.random() * 900000).toString();
  const hash = bcrypt.hashSync(plain, 10);
  return { plain, hash };
}

export function verifyOtpCode(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function getOtpExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

export { OTP_LENGTH, OTP_EXPIRY_MINUTES };
