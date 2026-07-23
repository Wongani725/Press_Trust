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

describe('Admin Programs Endpoints', () => {
  it('should create a new program', async () => {
    const res = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        name: 'Test Scholarship Program',
        description: 'A test program for unit testing',
        budget_ceiling: 500000,
        award_types: ['one_off', 'recurring'],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test Scholarship Program');
    expect(res.body.data.status).toBe('Draft');
  });

  it('should list programs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should get a single program', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Get Test Program', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .get(`/api/v1/admin/programs/${programId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(programId);
  });

  it('should update a program', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Update Test Program', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/admin/programs/${programId}`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Updated Program Name', description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Updated Program Name');
  });

  it('should transition program status Draft -> Open', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Status Test Program', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/admin/programs/${programId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'Open' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('Open');
  });

  it('should block invalid status transitions', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Invalid Transition Test', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/admin/programs/${programId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'Archived' });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe('error');
  });

  it('should update program budget', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Budget Test Program', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/admin/programs/${programId}/budget`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ budget_ceiling: 750000 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.budget_ceiling).toBe('750000');
  });

  it('should update program config', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Config Test Program', budget_ceiling: 100000 });

    const programId = createRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/admin/programs/${programId}/config`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        eligibility_rules: { min_age: 16, max_age: 25 },
        form_config: { fields: [{ name: 'gpa', type: 'number' }] },
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.eligibility_rules).toEqual({ min_age: 16, max_age: 25 });
  });

  it('should reject Finance role access', async () => {
    const financeToken = jwt.sign(
      { userId: 'db0d8e66-409c-462d-89fa-03a8b9b3a3cd', email: 'wonganimsumba0@gmail.com', role: 'Finance' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
