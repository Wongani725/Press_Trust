import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import jwt from 'jsonwebtoken';
import { config } from '../../../shared/config';

const superAdminToken = jwt.sign(
  { userId: '495cb5a5-7105-41b0-abbd-b99bb232ece4', email: 'wmsumba@imosys.mw', role: 'SuperAdmin' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Users Endpoints', () => {
  it('should list users with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should reject non-SuperAdmin access', async () => {
    const opsToken = jwt.sign(
      { userId: '29e01632-89a5-47c1-a7fa-5ea29b9bee14', email: 'wongani087@gmail.com', role: 'Operations' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });

  it('should reject unauthenticated access', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('error');
  });

  it('should get a single user', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users/495cb5a5-7105-41b0-abbd-b99bb232ece4')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.email).toBe('wmsumba@imosys.mw');
  });

  it('should return 404 for unknown user', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });
});

describe('Admin Roles Endpoints', () => {
  it('should list roles', async () => {
    const res = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(6);
  });

  it('should get a single role', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const roleId = listRes.body.data.items[0].id;
    const res = await request(app)
      .get(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBeDefined();
  });

  it('should reject non-SuperAdmin access to roles', async () => {
    const opsToken = jwt.sign(
      { userId: '29e01632-89a5-47c1-a7fa-5ea29b9bee14', email: 'wongani087@gmail.com', role: 'Operations' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
