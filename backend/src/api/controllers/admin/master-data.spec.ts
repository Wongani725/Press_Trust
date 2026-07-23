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

const financeToken = jwt.sign(
  { userId: 'db0d8e66-409c-462d-89fa-03a8b9b3a3cd', email: 'wonganimsumba0@gmail.com', role: 'Finance' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Master Data Endpoints', () => {
  // ── Schools ──
  it('should create a school', async () => {
    const res = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Test High School', district: 'Lilongwe', type: 'secondary' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test High School');
  });

  it('should list schools', async () => {
    const res = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should get a school', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Get School', district: 'Blantyre' });

    const id = createRes.body.data.id;
    const res = await request(app)
      .get(`/api/v1/admin/schools/${id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(id);
  });

  it('should update a school status', async () => {
    const createRes = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Status School', district: 'Mzuzu' });

    const id = createRes.body.data.id;
    const res = await request(app)
      .patch(`/api/v1/admin/schools/${id}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  // ── Funding Sources ──
  it('should create a funding source', async () => {
    const res = await request(app)
      .post('/api/v1/admin/funding-sources')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Test Donor', total_allocation: 1000000 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Test Donor');
  });

  it('should list funding sources', async () => {
    const res = await request(app)
      .get('/api/v1/admin/funding-sources')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  // ── Disbursement Items ──
  it('should create a disbursement item', async () => {
    const res = await request(app)
      .post('/api/v1/admin/disbursement-items')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: `transport-test-${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toContain('transport-test-');
  });

  it('should list disbursement items', async () => {
    const res = await request(app)
      .get('/api/v1/admin/disbursement-items')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  // ── Reference Data ──
  it('should create reference data', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reference-data/district')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ code: `ll-test-${Date.now()}`, name: `Lilongwe Test ${Date.now()}` });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.code).toContain('ll-test-');
  });

  it('should list reference data by type', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reference-data/district')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  // ── Bank Accounts ──
  it('should create a bank account', async () => {
    const schoolRes = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Bank School', district: 'Zomba' });

    const schoolId = schoolRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/admin/schools/${schoolId}/bank-accounts`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        bank_name: 'National Bank',
        account_number: '1234567890',
        account_holder_name: 'Bank School',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.bank_name).toBe('National Bank');
  });

  it('should mask bank account numbers for non-Finance roles', async () => {
    const schoolRes = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Mask School', district: 'Kasungu' });

    const schoolId = schoolRes.body.data.id;

    await request(app)
      .post(`/api/v1/admin/schools/${schoolId}/bank-accounts`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ bank_name: 'FDH', account_number: '9876543210', account_holder_name: 'Mask School' });

    const res = await request(app)
      .get(`/api/v1/admin/schools/${schoolId}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    const account = res.body.data.bank_accounts[0];
    expect(account.account_number).toContain('****');
  });

  it('should show unmasked bank accounts for Finance', async () => {
    const schoolRes = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ name: 'Unmask School', district: 'Dedza' });

    const schoolId = schoolRes.body.data.id;

    await request(app)
      .post(`/api/v1/admin/schools/${schoolId}/bank-accounts`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ bank_name: 'NBS', account_number: '555566667777', account_holder_name: 'Unmask School' });

    const res = await request(app)
      .get(`/api/v1/admin/schools/${schoolId}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    const account = res.body.data.bank_accounts[0];
    expect(account.account_number).toBe('555566667777');
  });

  // ── Role restrictions ──
  it('should reject M&E from creating schools', async () => {
    const meToken = jwt.sign(
      { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .post('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${meToken}`)
      .send({ name: 'ME School', district: 'Mchinji' });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
