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

describe('Admin Scheduled Reports', () => {
  let reportDefId: string;
  let scheduleId: string;

  beforeAll(async () => {
    const defRes = await request(app)
      .post('/api/v1/admin/report-definitions')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Scheduled Test Report',
        source: 'beneficiaries',
        fields: ['identifier', 'name', 'status'],
      });
    reportDefId = defRes.body.data.id;
  });

  it('should create a scheduled report', async () => {
    const res = await request(app)
      .post('/api/v1/admin/scheduled-reports')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        report_id: reportDefId,
        name: 'Weekly Beneficiary Report',
        cron_expression: '0 8 * * 1',
        format: 'csv',
        recipients: ['wmsumba@imosys.mw', 'wongani087@gmail.com'],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.format).toBe('csv');
    scheduleId = res.body.data.id;
  });

  it('should list scheduled reports', async () => {
    const res = await request(app)
      .get('/api/v1/admin/scheduled-reports')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it('should get a scheduled report by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/scheduled-reports/${scheduleId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Weekly Beneficiary Report');
    expect(res.body.data.report).toBeDefined();
    expect(res.body.data.report.id).toBe(reportDefId);
  });

  it('should update a scheduled report', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/scheduled-reports/${scheduleId}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Updated Weekly Report',
        format: 'pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Weekly Report');
    expect(res.body.data.format).toBe('pdf');
  });

  it('should toggle a scheduled report', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/scheduled-reports/${scheduleId}/toggle`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);

    const res2 = await request(app)
      .patch(`/api/v1/admin/scheduled-reports/${scheduleId}/toggle`)
      .set('Authorization', `Bearer ${opsToken}`);
    expect(res2.status).toBe(200);
    expect(res2.body.data.enabled).toBe(true);
  });

  it('should run a scheduled report now', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/scheduled-reports/${scheduleId}/run-now`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.format).toBe('pdf');
    expect(res.body.data.rows).toBeGreaterThanOrEqual(0);
    expect(res.body.data.file_url).toBeDefined();
  });

  it('should get run history for a schedule', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/scheduled-reports/${scheduleId}/runs`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should get all report runs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/report-runs')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should delete a scheduled report', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/scheduled-reports/${scheduleId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    const getRes = await request(app)
      .get(`/api/v1/admin/scheduled-reports/${scheduleId}`)
      .set('Authorization', `Bearer ${opsToken}`);
    expect(getRes.status).toBe(404);
  });

  it('should reject creating scheduled report with invalid report_id', async () => {
    const res = await request(app)
      .post('/api/v1/admin/scheduled-reports')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        report_id: '00000000-0000-0000-0000-000000000000',
        name: 'Invalid Report',
        cron_expression: '0 8 * * 1',
        format: 'csv',
        recipients: ['test@test.com'],
      });

    expect(res.status).toBe(404);
  });

  it('should reject unauthorized access', async () => {
    const res = await request(app)
      .get('/api/v1/admin/scheduled-reports')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });
});

