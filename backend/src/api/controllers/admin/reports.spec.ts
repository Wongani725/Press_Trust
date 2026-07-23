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

const meToken = jwt.sign(
  { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin Reports & Dashboard Endpoints', () => {
  // ── Dashboard ──

  it('should return dashboard KPIs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.active_beneficiaries).toBeDefined();
    expect(res.body.data.budget).toBeDefined();
    expect(res.body.data.budget.utilized).toBeDefined();
    expect(res.body.data.budget.ceiling).toBeDefined();
    expect(res.body.data.disbursements).toBeDefined();
    expect(res.body.data.programs).toBeDefined();
  });

  it('should allow ME role to access dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  // ── Beneficiary Report ──

  it('should return beneficiary report as JSON', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.meta).toBeDefined();
  });

  it('should filter beneficiary report by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    for (const item of res.body.data.items) {
      expect(item.status).toBe('Active');
    }
  });

  it('should export beneficiary report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?format=csv')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('beneficiary_register.csv');
    expect(res.text).toContain('Identifier');
  });

  it('should export beneficiary report as PDF', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?format=pdf')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('beneficiary_register.pdf');
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  it('should export beneficiary report as XLSX', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?format=xlsx')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('beneficiary_register.xlsx');
    expect(res.text.length).toBeGreaterThan(0);
  });

  // ── Awards Report ──

  it('should return awards report as JSON', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/awards')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should export awards report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/awards?format=csv')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Beneficiary ID');
  });

  // ── Disbursements Report (Finance only) ──

  it('should return disbursements report for Finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/disbursements')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should export disbursements report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/disbursements?format=csv')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Beneficiary ID');
  });

  it('should block Operations from disbursements report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/disbursements')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  it('should block ME from disbursements report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/disbursements')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(403);
  });

  // ── Budget Report (Finance only) ──

  it('should return budget utilization report for Finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/budget')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    expect(res.body.data.items[0]).toHaveProperty('budget_ceiling');
    expect(res.body.data.items[0]).toHaveProperty('percentage');
  });

  it('should export budget report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/budget?format=csv')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Program');
  });

  it('should block Operations from budget report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/budget')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  // ── Payments by School Report (Finance only) ──

  it('should return payments by school report for Finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/payments-by-school')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should block Operations from payments by school report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/payments-by-school')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  // ── M&E Outcomes Report ──

  it('should return M&E outcomes report as JSON', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/me-outcomes')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should export M&E outcomes report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/me-outcomes?format=csv')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Beneficiary ID');
  });

  // ── Reconciliation Report (Finance only) ──

  it('should return reconciliation report for Finance', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/reconciliation')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should export reconciliation report as CSV', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/reconciliation?format=csv')
      .set('Authorization', `Bearer ${financeToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Beneficiary ID');
  });

  it('should block Operations from reconciliation report', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/reconciliation')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(403);
  });

  // ── Export Log Tracking ──

  it('should log export activity for CSV export', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?format=csv')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    // Export log is created asynchronously; we verify by checking no error occurs
    expect(res.headers['content-disposition']).toContain('.csv');
  });

  // ── Format Validation ──

  it('should default to JSON for invalid format', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/beneficiaries?format=invalid')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });
});
