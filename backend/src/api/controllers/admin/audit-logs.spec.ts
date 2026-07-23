import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import jwt from 'jsonwebtoken';
import { config } from '../../../shared/config';

const superAdminToken = jwt.sign(
  { userId: '495cb5a5-7105-41b0-abbd-b99bb232ece4', email: 'wmsumba@imosys.mw', role: 'SuperAdmin' },
  config.jwt.secret,
  { expiresIn: 900 }
);

const opsToken = jwt.sign(
  { userId: '29e01632-89a5-47c1-a7fa-5ea29b9bee14', email: 'wongani087@gmail.com', role: 'Operations' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Audit Logs', () => {
  it('should list audit logs with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
    expect(res.body.data.meta.total).toBeGreaterThan(0);
  });

  it('should filter audit logs by action', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?action=create')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    for (const item of res.body.data.items) {
      expect(item.action).toBe('create');
    }
  });

  it('should filter audit logs by entity_type', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?entity_type=Beneficiary')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    for (const item of res.body.data.items) {
      expect(item.entity_type).toBe('Beneficiary');
    }
  });

  it('should filter audit logs by date range', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs?from_date=2020-01-01&to_date=2030-12-31')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should get a single audit log by ID', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/audit-logs?limit=1')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const id = listRes.body.data.items[0].id;

    const res = await request(app)
      .get(`/api/v1/admin/audit-logs/${id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.user).toBeDefined();
  });

  it('should return 404 for non-existent audit log', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
  });

  it('should export audit logs as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs/export?format=csv')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('should export audit logs as PDF', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs/export?format=pdf')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('should export audit logs as XLSX', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs/export?format=xlsx')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('should deny access for non-auditor roles', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  it('should deny unauthenticated access', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});
