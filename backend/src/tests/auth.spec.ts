import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { config } from '../shared/config';

const mockTokenPayload = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  email: 'wmsumba@imosys.mw',
  role: 'SuperAdmin',
};

describe('JWT Utilities', () => {
  it('should generate a valid access token', () => {
    const token = jwt.sign(mockTokenPayload, config.jwt.secret, { expiresIn: 900 });
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');

    const decoded = jwt.verify(token, config.jwt.secret) as typeof mockTokenPayload;
    expect(decoded.email).toBe(mockTokenPayload.email);
    expect(decoded.role).toBe(mockTokenPayload.role);
  });

  it('should reject an invalid token', () => {
    expect(() => jwt.verify('invalid-token', config.jwt.secret)).toThrow();
  });

  it('should reject a token signed with wrong secret', () => {
    const token = jwt.sign(mockTokenPayload, 'wrong-secret', { expiresIn: 900 });
    expect(() => jwt.verify(token, config.jwt.secret)).toThrow();
  });

  it('should reject an expired token', () => {
    const token = jwt.sign(mockTokenPayload, config.jwt.secret, { expiresIn: 0 });
    expect(() => jwt.verify(token, config.jwt.secret)).toThrow();
  });
});

describe('Password Hashing', () => {
  it('should hash and verify passwords correctly', async () => {
    const { hashPassword, verifyPassword } = await import('../modules/users/domain/password.service');

    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2')).toBe(true);

    const valid = await verifyPassword(password, hash);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('WrongPassword', hash);
    expect(invalid).toBe(false);
  });
});

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return 401 when no authorization header', async () => {
    const { authenticate } = await import('../api/middleware/auth.middleware');

    const req = { headers: {} } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Missing or invalid authorization header',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when token is invalid', async () => {
    const { authenticate } = await import('../api/middleware/auth.middleware');

    const req = { headers: { authorization: 'Bearer invalid-token' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Token is invalid or expired',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when token is valid', async () => {
    const { authenticate } = await import('../api/middleware/auth.middleware');

    const token = jwt.sign(mockTokenPayload, config.jwt.secret, { expiresIn: 900 });
    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user?.email).toBe(mockTokenPayload.email);
  });
});

describe('Role Middleware', () => {
  it('should return 401 when no user on request', async () => {
    const { authorize } = await import('../api/middleware/role.middleware');

    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    const middleware = authorize('SuperAdmin');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Authentication required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when role is not allowed', async () => {
    const { authorize } = await import('../api/middleware/role.middleware');

    const req = { user: { userId: '1', email: 'test@test.com', role: 'Operations' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    const middleware = authorize('SuperAdmin');
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Insufficient permissions',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when role is allowed', async () => {
    const { authorize } = await import('../api/middleware/role.middleware');

    const req = { user: { userId: '1', email: 'test@test.com', role: 'SuperAdmin' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    const middleware = authorize('SuperAdmin', 'Operations');
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('Validation Middleware', () => {
  it('should return 422 when validation fails', async () => {
    const { validate } = await import('../api/middleware/validate.middleware');
    const { z } = await import('zod');

    const schema = z.object({ email: z.string().email() });
    const req = { body: { email: 'not-an-email' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    const middleware = validate(schema);
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Request validation failed',
        data: expect.objectContaining({
          details: expect.any(Array),
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next when validation passes', async () => {
    const { validate } = await import('../api/middleware/validate.middleware');
    const { z } = await import('zod');

    const schema = z.object({ email: z.string().email() });
    const req = { body: { email: 'test@example.com' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    const middleware = validate(schema);
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
