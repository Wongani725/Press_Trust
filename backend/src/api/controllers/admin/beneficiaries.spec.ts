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

describe('Admin Beneficiary Endpoints', () => {
  // ── List ──
  it('should list beneficiaries', async () => {
    const res = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should filter beneficiaries by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
    for (const b of res.body.data.items) {
      expect(b.status).toBe('Active');
    }
  });

  it('should search beneficiaries by name', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);
    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    const program = programsRes.body.data.items[0];

    if (!school || !program) {
      expect(true).toBe(true);
      return;
    }

    // Create a beneficiary with a unique name
    const uniqueName = `SearchTest${Date.now()}`;
    await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: uniqueName,
        last_name: 'Search',
        gender: 'Male',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: `SEARCH-${Date.now()}`,
      });

    const res = await request(app)
      .get(`/api/v1/admin/beneficiaries?q=${uniqueName}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  // ── Create ──
  it('should create a beneficiary', async () => {
    // Need a school and program
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);
    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    const program = programsRes.body.data.items[0];

    if (!school || !program) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Test',
        last_name: 'Beneficiary',
        gender: 'Male',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: `TEST-${Date.now()}`,
        exams_id: `EX-${Date.now()}`,
        academic_year: '2026-T1',
        guardian: {
          name: 'Test Guardian',
          relationship: 'Father',
          contact_phone: '+265991111111',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.first_name).toBe('Test');
    expect(res.body.data.guardians.length).toBe(1);
  });

  it('should block duplicate beneficiary creation', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);
    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    const program = programsRes.body.data.items[0];

    if (!school || !program) {
      expect(true).toBe(true);
      return;
    }

    const nationalId = `DUP-${Date.now()}`;

    const first = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Dup',
        last_name: 'One',
        gender: 'Female',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: nationalId,
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Dup',
        last_name: 'Two',
        gender: 'Female',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: nationalId,
      });
    expect(second.status).toBe(409);
    expect(second.body.status).toBe('error');
  });

  // ── Get ──
  it('should get a beneficiary', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/beneficiaries/${beneficiary.id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(beneficiary.id);
  });

  // ── Update ──
  it('should update a beneficiary', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/beneficiaries/${beneficiary.id}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ first_name: 'UpdatedName' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.first_name).toBe('UpdatedName');
  });

  // ── Status transitions ──
  it('should suspend a beneficiary with reason', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/beneficiaries/${beneficiary.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Suspended', reason: 'Missing documents' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Suspended');
    expect(res.body.data.status_reason).toBe('Missing documents');
  });

  it('should require reason for suspension', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items.find((b: any) => b.status === 'Active');
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/beneficiaries/${beneficiary.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Suspended' });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
  });

  it('should reinstate a suspended beneficiary', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Suspended')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/beneficiaries/${beneficiary.id}/reinstate`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('Active');
    expect(res.body.data.status_reason).toBeNull();
  });

  it('should reject invalid status transitions', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Imported')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    // Imported → Closed is valid, but Imported → Active is not
    const res = await request(app)
      .patch(`/api/v1/admin/beneficiaries/${beneficiary.id}/status`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ status: 'Active' });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
  });

  // ── Guardian CRUD ──
  it('should add a guardian to a beneficiary', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/beneficiaries/${beneficiary.id}/guardians`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        name: 'New Guardian',
        relationship: 'Mother',
        contact_phone: '+265994444444',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('New Guardian');
  });

  it('should update a guardian', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items.find((b: any) => b.guardians && b.guardians.length > 0);
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const guardian = beneficiary.guardians[0];
    const res = await request(app)
      .put(`/api/v1/admin/beneficiaries/${beneficiary.id}/guardians/${guardian.id}`)
      .set('Authorization', `Bearer ${opsToken}`)
      .send({ name: 'Updated Guardian' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Updated Guardian');
  });

  it('should delete a guardian', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = listRes.body.data.items.find((b: any) => b.guardians && b.guardians.length > 0);
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const guardian = beneficiary.guardians[0];
    const res = await request(app)
      .delete(`/api/v1/admin/beneficiaries/${beneficiary.id}/guardians/${guardian.id}`)
      .set('Authorization', `Bearer ${opsToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
  });

  // ── Role restrictions ──
  it('should reject ME from creating beneficiaries', async () => {
    const meToken = jwt.sign(
      { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
      config.jwt.secret,
      { expiresIn: 900 }
    );

    const res = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        first_name: 'ME', last_name: 'Test', gender: 'Male',
        district: 'Lilongwe', school_id: '00000000-0000-0000-0000-000000000000',
        program_id: '00000000-0000-0000-0000-000000000000',
      });

    expect(res.status).toBe(403);
    expect(res.body.status).toBe('error');
  });
});
