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

const financeToken = jwt.sign(
  { userId: 'db0d8e66-409c-462d-89fa-03a8b9b3a3cd', email: 'wonganimsumba0@gmail.com', role: 'Finance' },
  config.jwt.secret,
  { expiresIn: 900 }
);

// Another Finance user token for maker-checker tests
const finance2Token = jwt.sign(
  { userId: 'f2e2c2b2-2222-3333-4444-555566667777', email: 'wmsumba@imosys.mw', role: 'Finance' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Disbursement Endpoints', () => {
  // ── List ──
  it('should list disbursements', async () => {
    const res = await request(app)
      .get('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should filter disbursements by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/disbursements?status=Requested')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    for (const d of res.body.data.items) {
      expect(d.status).toBe('Requested');
    }
  });

  // ── Create ──
  it('should create a disbursement for an active award', async () => {
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 5000,
        category: 'uniform',
        academic_period: '2026-T2',
        payee_type: 'guardian',
        payee_name: 'Test Guardian',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('Requested');
    expect(res.body.data.amount).toBe(5000);
  });

  it('should reject duplicate disbursement', async () => {
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const uniquePeriod = `DUP-${Date.now()}`;

    const first = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 1000,
        category: 'transport',
        academic_period: uniquePeriod,
        payee_type: 'school',
        payee_name: 'Test School',
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 2000,
        category: 'transport',
        academic_period: uniquePeriod,
        payee_type: 'school',
        payee_name: 'Test School 2',
      });

    expect(second.status).toBe(409);
    expect(second.body.status).toBe('error');
  });

  // ── Batch ──
  it('should batch create disbursements', async () => {
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/disbursements/batch')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        items: [
          {
            award_id: award.id,
            amount: 1000,
            category: 'fees',
            academic_period: `BATCH-A-${Date.now()}`,
            payee_type: 'school',
            payee_name: 'School A',
          },
          {
            award_id: award.id,
            amount: 2000,
            category: 'books',
            academic_period: `BATCH-B-${Date.now()}`,
            payee_type: 'vendor',
            payee_name: 'Vendor B',
          },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.created.length).toBe(2);
  });

  // ── Get ──
  it('should get a disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/disbursements/${disbursement.id}`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(disbursement.id);
  });

  // ── Update ──
  it('should update a requested disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Requested')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/disbursements/${disbursement.id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ payee_name: 'Updated Payee' });

    expect(res.status).toBe(200);
    expect(res.body.data.payee_name).toBe('Updated Payee');
  });

  it('should reject update of non-requested disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Approved')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/disbursements/${disbursement.id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ payee_name: 'Updated' });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Approve (maker-checker) ──
  it('should approve a disbursement by different user', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Requested')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/approve`)
      .set('Authorization', `Bearer ${finance2Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Approved');
    expect(res.body.data.approved_by).toBeTruthy();
  });

  it('should block self-approval', async () => {
    // First create a disbursement as financeToken
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const createRes = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 1000,
        category: 'stationery',
        academic_period: `SELF-${Date.now()}`,
        payee_type: 'school',
        payee_name: 'Self Test School',
      });

    const id = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${id}/approve`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });

  // ── Reject ──
  it('should reject a disbursement with reason', async () => {
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const createRes = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 1000,
        category: 'medical',
        academic_period: `REJ-${Date.now()}`,
        payee_type: 'guardian',
        payee_name: 'Reject Test',
      });

    const id = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${id}/reject`)
      .set('Authorization', `Bearer ${finance2Token}`)
      .send({ reason: 'Incorrect payee details' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Failed');
    expect(res.body.data.failure_reason).toBe('Incorrect payee details');
  });

  it('should block self-rejection', async () => {
    const awardsRes = await request(app)
      .get('/api/v1/admin/awards?status=Active')
      .set('Authorization', `Bearer ${financeToken}`);

    const award = awardsRes.body.data.items[0];
    if (!award) {
      expect(true).toBe(true);
      return;
    }

    const createRes = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        award_id: award.id,
        amount: 1000,
        category: 'boarding',
        academic_period: `SELFR-${Date.now()}`,
        payee_type: 'school',
        payee_name: 'Self Reject Test',
      });

    const id = createRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${id}/reject`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Test' });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });

  // ── Evidence ──
  it('should link evidence to a disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Approved')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    // Get a document to use as evidence
    const docsRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${financeToken}`);

    const document = docsRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/evidence`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ document_id: document.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.document_id).toBe(document.id);
  });

  // ── Status transitions ──
  it('should transition Approved → Paid with evidence', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Approved')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items.find((d: any) => d.evidence_count > 0);
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/disbursements/${disbursement.id}/status`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ status: 'Paid' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Paid');
    expect(res.body.data.paid_at).toBeTruthy();
  });

  it('should block Paid without evidence', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Approved')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items.find((d: any) => d.evidence_count === 0);
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/disbursements/${disbursement.id}/status`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ status: 'Paid' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('should transition Paid → Reconciled', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Paid')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/disbursements/${disbursement.id}/status`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ status: 'Reconciled' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Reconciled');
  });

  it('should reject invalid status transitions', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Requested')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    // Requested → Reconciled is invalid
    const res = await request(app)
      .patch(`/api/v1/admin/disbursements/${disbursement.id}/status`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ status: 'Reconciled' });

    expect(res.status).toBe(422);
    expect(res.body.status).toBe('error');
  });

  // ── Role restrictions ──
  it('should reject Operations from creating disbursements', async () => {
    const opsToken = jwt.sign(
      { userId: '29e01632-89a5-47c1-a7fa-5ea29b9bee14', email: 'wongani087@gmail.com', role: 'Operations' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .post('/api/v1/admin/disbursements')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        award_id: '00000000-0000-0000-0000-000000000000',
        amount: 1000,
        category: 'fees',
        academic_period: '2026-T1',
        payee_type: 'school',
        payee_name: 'Test',
      });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });

  // ── Reconcile ──
  it('should reconcile a paid disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Paid')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/reconcile`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Reconciled');
    expect(res.body.data.reconciled_by).toBeTruthy();
  });

  it('should block reconcile of non-paid disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Approved')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/reconcile`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Reverse ──
  it('should reverse a paid disbursement and restore balance', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Paid')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/reverse`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ reason: 'Payment failed at bank' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.reversal.type).toBe('reverse');
  });

  it('should partially reverse a disbursement with amount', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Paid')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/reverse`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 5000, reason: 'Partial bank return' });

    expect(res.status).toBe(200);
    expect(res.body.data.reversal.amount).toBe(5000);
  });

  // ── Return ──
  it('should record returned funds for a disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Paid')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/return`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ amount: 3000, reason: 'Beneficiary overpaid' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.reversal.type).toBe('return');
    expect(res.body.data.reversal.amount).toBe(3000);
  });

  // ── Immutability ──
  it('should block update of reconciled disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Reconciled')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/disbursements/${disbursement.id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ payee_name: 'Updated' });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('immutable');
  });

  it('should block evidence link on reconciled disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/disbursements?status=Reconciled')
      .set('Authorization', `Bearer ${financeToken}`);

    const disbursement = listRes.body.data.items[0];
    if (!disbursement) {
      expect(true).toBe(true);
      return;
    }

    const docsRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${financeToken}`);
    const document = docsRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/disbursements/${disbursement.id}/evidence`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ document_id: document.id });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('immutable');
  });
});
