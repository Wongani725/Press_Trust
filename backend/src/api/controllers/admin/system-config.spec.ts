import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import jwt from 'jsonwebtoken';
import { config } from '../../../shared/config';
import { seedConfigsIfEmpty } from '../../../modules/system-config';

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

describe('Admin System Configuration', () => {
  beforeAll(async () => {
    await seedConfigsIfEmpty();
  });

  it('should list all system configs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should get a config value by key', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config/smtp_host')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.key).toBe('smtp_host');
    expect(res.body.data.value).toBeDefined();
  });

  it('should return 404 for unknown config key', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config/nonexistent_key')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(404);
  });

  it('should update a config value', async () => {
    const res = await request(app)
      .put('/api/v1/admin/system-config/smtp_host')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ value: 'smtp.example.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe('smtp.example.com');
    expect(res.body.data.isOverridden).toBe(true);

    // Reset back
    await request(app)
      .put('/api/v1/admin/system-config/smtp_host')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ value: 'smtp.gmail.com' });
  });

  it('should reset a config to env default by setting null', async () => {
    const res = await request(app)
      .put('/api/v1/admin/system-config/smtp_host')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ value: null });

    expect(res.status).toBe(200);
    expect(res.body.data.isOverridden).toBe(false);
  });

  it('should list categories', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config/categories')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.categories).toBeInstanceOf(Array);
    expect(res.body.data.categories.length).toBeGreaterThan(0);
    expect(res.body.data.categories[0].category).toBeDefined();
    expect(res.body.data.categories[0].count).toBeGreaterThan(0);
  });

  it('should deny access for non-SuperAdmin roles', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  it('should deny unauthenticated access', async () => {
    const res = await request(app)
      .get('/api/v1/admin/system-config')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('should create an audit log when config is updated', async () => {
    await request(app)
      .put('/api/v1/admin/system-config/smtp_port')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ value: '587' });

    const auditRes = await request(app)
      .get('/api/v1/admin/audit-logs?action=UPDATE_SYSTEM_CONFIG&limit=1')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.items.length).toBeGreaterThan(0);
    expect(auditRes.body.data.items[0].entity_type).toBe('SystemConfig');
  });
});
