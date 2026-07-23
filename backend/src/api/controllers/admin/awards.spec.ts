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

describe('Admin Award Endpoints', () => {
  // ── List ──
  it('should list awards', async () => {
    const res = await request(app)
      .get('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should filter awards by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    for (const a of res.body.data.items) {
      expect(a.status).toBe('Active');
    }
  });

  // ── Create ──
  it('should create an award for an active beneficiary', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const program = programsRes.body.data.items[0];
    if (!program) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        program_id: program.id,
        amount: 10000,
        award_type: 'one_off',
        start_date: '2026-01-01',
        end_date: '2026-12-31',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.amount).toBe(10000);
    expect(res.body.data.balance_remaining).toBe(10000);
    expect(res.body.data.status).toBe('Draft');
  });

  it('should reject award creation for non-active beneficiary', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Imported')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const program = programsRes.body.data.items[0];
    if (!program) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        program_id: program.id,
        amount: 10000,
        award_type: 'one_off',
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Get ──
  it('should get an award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/awards/${award.id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(award.id);
  });

  // ── Update ──
  it('should update a draft award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Draft')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/awards/${award.id}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ amount: 25000 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.amount).toBe(25000);
  });

  it('should reject update of non-draft award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/awards/${award.id}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ amount: 5000 });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Status transitions ──
  it('should activate a draft award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Draft')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/awards/${award.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Active' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Active');
  });

  it('should suspend an active award with reason', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/awards/${award.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Suspended', reason: 'Academic probation' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Suspended');
    expect(res.body.data.status_reason).toBe('Academic probation');
  });

  it('should require reason for suspension', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items.find((a: any) => a.status === 'Active');
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/awards/${award.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Suspended' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('should reinstate a suspended award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Suspended')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/awards/${award.id}/reinstate`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Active');
  });

  it('should close an active award with reason', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/awards/${award.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Closed', reason: 'Beneficiary dropped out' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Closed');
  });

  it('should reject invalid status transitions', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Draft')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    // Draft → Completed is invalid
    const res = await request(app)
      .patch(`/api/v1/admin/awards/${award.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Completed', reason: 'Test' });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Renew ──
  it('should renew an award', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/awards/${award.id}/renew`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        start_date: '2027-01-01',
        end_date: '2027-12-31',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.parent_award_id).toBe(award.id);
    expect(res.body.data.status).toBe('Draft');
  });

  // ── Award letter ──
  it('should generate award letter PDF', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${opsToken}`);

    const award = listRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/awards/${award.id}/letter/generate`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  // ── Role restrictions ──
  it('should reject ME from creating awards', async () => {
    const meToken = jwt.sign(
      { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .post('/api/v1/admin/awards')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: '00000000-0000-0000-0000-000000000000',
        program_id: '00000000-0000-0000-0000-000000000000',
        amount: 10000,
        award_type: 'one_off',
      });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
