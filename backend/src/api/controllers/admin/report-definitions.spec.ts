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

describe('Admin Report Definitions', () => {
  let createdId: string;

  it('should return available report sources', async () => {
    const res = await request(app)
      .get('/api/v1/admin/report-definitions/sources')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.sources).toBeInstanceOf(Array);
    expect(res.body.data.sources.length).toBeGreaterThan(0);
    expect(res.body.data.sources[0].key).toBeDefined();
    expect(res.body.data.sources[0].columns).toBeInstanceOf(Array);
  });

  it('should create a report definition', async () => {
    const res = await request(app)
      .post('/api/v1/admin/report-definitions')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Test Beneficiary Report',
        description: 'A test report',
        source: 'beneficiaries',
        fields: ['identifier', 'name', 'gender', 'school', 'status'],
        filters: { status: 'Active' },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe('Test Beneficiary Report');
    expect(res.body.data.source).toBe('beneficiaries');
    createdId = res.body.data.id;
  });

  it('should reject invalid fields in report definition', async () => {
    const res = await request(app)
      .post('/api/v1/admin/report-definitions')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Bad Report',
        source: 'beneficiaries',
        fields: ['nonexistent_field'],
      });

    expect(res.status).toBe(422);
  });

  it('should list report definitions', async () => {
    const res = await request(app)
      .get('/api/v1/admin/report-definitions')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should get a report definition by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/report-definitions/${createdId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Test Beneficiary Report');
  });

  it('should update a report definition', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/report-definitions/${createdId}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'Updated Report Name',
        fields: ['identifier', 'name', 'gender', 'school', 'status', 'district'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Report Name');
  });

  it('should execute a report definition and return CSV', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/report-definitions/${createdId}/execute?format=csv`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('should execute a report definition and return PDF', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/report-definitions/${createdId}/execute?format=pdf`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('should execute a report definition and return XLSX', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/report-definitions/${createdId}/execute?format=xlsx`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.text.length).toBeGreaterThan(0);
  });

  it('should delete a report definition', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/report-definitions/${createdId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    const getRes = await request(app)
      .get(`/api/v1/admin/report-definitions/${createdId}`)
      .set('Authorization', `Bearer ${opsToken}`);
    expect(getRes.status).toBe(404);
  });

  it('should reject unauthorized access', async () => {
    const res = await request(app)
      .get('/api/v1/admin/report-definitions')
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent report definition', async () => {
    const res = await request(app)
      .get('/api/v1/admin/report-definitions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(404);
  });
});
