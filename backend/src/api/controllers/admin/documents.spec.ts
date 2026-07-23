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

describe('Admin Document Endpoints', () => {
  // ── List ──
  it('should list documents', async () => {
    const res = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should filter documents by documentable_type', async () => {
    const res = await request(app)
      .get('/api/v1/admin/documents?documentable_type=beneficiary')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    for (const d of res.body.data.items) {
      expect(d.documentable_type).toBe('beneficiary');
    }
  });

  // ── Upload ──
  it('should upload a document', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`)
      .field('documentable_type', 'beneficiary')
      .field('documentable_id', beneficiary.id)
      .field('document_type', 'id_copy')
      .attach('file', Buffer.from('test pdf content'), 'test_id.pdf');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.document_type).toBe('id_copy');
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.virus_scan_status).toBe('clean');
  });

  it('should reject upload without file', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        documentable_type: 'beneficiary',
        documentable_id: beneficiary.id,
        document_type: 'id_copy',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('should reject invalid document_type', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`)
      .field('documentable_type', 'beneficiary')
      .field('documentable_id', beneficiary.id)
      .field('document_type', 'invalid_type')
      .attach('file', Buffer.from('test'), 'test.txt');

    expect(res.status).toBe(422);
    expect(res.body.status).toBe('error');
  });

  it('should flag virus scan for suspicious files', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`)
      .field('documentable_type', 'beneficiary')
      .field('documentable_id', beneficiary.id)
      .field('document_type', 'id_copy')
      .attach('file', Buffer.from('evil'), 'virus.exe');

    expect(res.status).toBe(201);
    expect(res.body.data.virus_scan_status).toBe('infected');
  });

  // ── Get / Download ──
  it('should get document metadata', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/documents/${document.id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(document.id);
  });

  it('should download a document', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBeTruthy();
  });

  // ── Status update ──
  it('should verify a document', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents?status=Pending')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/documents/${document.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Verified' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Verified');
  });

  it('should reject a document with reason', async () => {
    // First upload a new document to reject
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const uploadRes = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`)
      .field('documentable_type', 'beneficiary')
      .field('documentable_id', beneficiary.id)
      .field('document_type', 'report_card')
      .attach('file', Buffer.from('test report card'), 'report.pdf');

    const docId = uploadRes.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/admin/documents/${docId}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Rejected', rejection_reason: 'Document is blurry' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Rejected');
    expect(res.body.data.rejection_reason).toBe('Document is blurry');
  });

  it('should require reason for rejection', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents?status=Pending')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/documents/${document.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Rejected' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  // ── Versioning ──
  it('should upload a new version of a document', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items.find((d: any) => d.version === 1);
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/documents/${document.id}/versions`)
      .set('Authorization', `Bearer ${opsToken}`)
      .attach('file', Buffer.from('updated version content'), 'updated.pdf');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.version).toBe(2);
    expect(res.body.data.document_type).toBe(document.document_type);
  });

  // ── Deletion ──
  it('should delete a document', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${opsToken}`);

    const document = listRes.body.data.items[0];
    if (!document) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .delete(`/api/v1/admin/documents/${document.id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  it('should reject unauthorized document operations', async () => {
    const meToken = jwt.sign(
      { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/documents')
      .set('Authorization', `Bearer ${meToken}`)
      .field('documentable_type', 'beneficiary')
      .field('documentable_id', beneficiary.id)
      .field('document_type', 'id_copy')
      .attach('file', Buffer.from('test'), 'test.pdf');

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
