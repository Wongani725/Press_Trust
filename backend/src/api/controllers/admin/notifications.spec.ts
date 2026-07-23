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

const meToken = jwt.sign(
  { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Notification Templates', () => {
  let templateId: string;

  it('should list available events', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notification-triggers/events')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.events).toBeInstanceOf(Array);
    expect(res.body.data.events.length).toBeGreaterThan(0);
  });

  it('should create an email notification template', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Welcome Email',
        channel: 'email',
        subject: 'Welcome {{name}} to {{program}}',
        body: 'Hello {{name}}, welcome to the {{program}} program!',
        variables: ['name', 'program'],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Welcome Email');
    templateId = res.body.data.id;
  });

  it('should list notification templates', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should get a template by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/notification-templates/${templateId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Welcome Email');
  });

  it('should update a template', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/notification-templates/${templateId}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ name: 'Updated Welcome Email' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Welcome Email');
  });

  it('should create an in-app notification trigger', async () => {
    const res = await request(app)
      .post('/api/v1/admin/notification-triggers')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Welcome Trigger',
        event_name: 'beneficiary.created',
        template_id: templateId,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.enabled).toBe(true);
  });

  it('should list notification triggers', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notification-triggers')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should toggle a trigger', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/notification-triggers')
      .set('Authorization', `Bearer ${opsToken}`);
    const triggerId = listRes.body.data.items[0].id;

    const res = await request(app)
      .patch(`/api/v1/admin/notification-triggers/${triggerId}/toggle`)
      .set('Authorization', `Bearer ${opsToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });

  it('should view notification logs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notification-logs')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should view my in-app notifications', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should get unread count', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notifications/unread-count')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.data.count).toBe('number');
  });

  it('should reject unauthorized access', async () => {
    const res = await request(app)
      .get('/api/v1/admin/notification-templates')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});
