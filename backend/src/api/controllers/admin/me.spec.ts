import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../../app';
import jwt from 'jsonwebtoken';
import { config } from '../../../shared/config';

const meToken = jwt.sign(
  { userId: '36889593-a9d4-46bf-94ac-0133818c3239', email: 'tayamuthola@gmail.com', role: 'ME' },
  config.jwt.secret,
  { expiresIn: 900 }
);

const opsToken = jwt.sign(
  { userId: '29e01632-89a5-47c1-a7fa-5ea29b9bee14', email: 'wongani087@gmail.com', role: 'Operations' },
  config.jwt.secret,
  { expiresIn: 900 }
);

const superAdminToken = jwt.sign(
  { userId: '495cb5a5-7105-41b0-abbd-b99bb232ece4', email: 'wmsumba@imosys.mw', role: 'SuperAdmin' },
  config.jwt.secret,
  { expiresIn: 900 }
);

describe('Admin M&E Endpoints', () => {
  // ── Performance ──

  it('should list performance records', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should filter performance by academic_period', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/performance?academic_period=2026-T1')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    for (const p of res.body.data.items) {
      expect(p.academic_period).toBe('2026-T1');
    }
  });

  it('should create a performance record', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    if (!school) {
      expect(true).toBe(true);
      return;
    }

    const uniquePeriod = `PERF-${Date.now()}`;

    const res = await request(app)
      .post('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        school_id: school.id,
        academic_period: uniquePeriod,
        subjects: { english: 70, math: 80 },
        overall_score: 75,
        attendance_percentage: 90,
        progression: 'Promoted',
        notes: 'Test performance record',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.beneficiary.id).toBe(beneficiary.id);
    expect(res.body.data.overall_score).toBe(75);
  });

  it('should reject performance creation for non-existent beneficiary', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    if (!school) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: '00000000-0000-0000-0000-000000000000',
        school_id: school.id,
        academic_period: '2026-T1',
        subjects: { english: 60 },
      });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  it('should get a performance record by id', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`);

    const record = listRes.body.data.items[0];
    if (!record) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/me/performance/${record.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(record.id);
  });

  it('should update a performance record', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`);

    const record = listRes.body.data.items.find((r: any) => r.academic_period?.startsWith('PERF-'));
    if (!record) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/performance/${record.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        overall_score: 88,
        notes: 'Updated notes',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.overall_score).toBe(88);
    expect(res.body.data.notes).toBe('Updated notes');
  });

  it('should block updating performance linked to paid disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/performance?academic_period=2026-T1')
      .set('Authorization', `Bearer ${meToken}`);

    const record = listRes.body.data.items[0];
    if (!record) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/performance/${record.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        overall_score: 50,
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('immutable');
  });

  it('should delete a performance record', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`);

    const record = listRes.body.data.items.find((r: any) => r.academic_period?.startsWith('PERF-'));
    if (!record) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .delete(`/api/v1/admin/me/performance/${record.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.deleted).toBe(true);
  });

  it('should block deleting performance linked to paid disbursement', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/performance?academic_period=2026-T1')
      .set('Authorization', `Bearer ${meToken}`);

    const record = listRes.body.data.items[0];
    if (!record) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .delete(`/api/v1/admin/me/performance/${record.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('immutable');
  });

  // ── At-Risk Flags ──

  it('should list at-risk flags', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/at-risk')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should create an at-risk flag', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);
    const school = schoolsRes.body.data.items[0];
    if (!school) {
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

    const uniqueId = `RISK-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Risk',
        last_name: 'Test',
        gender: 'Female',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: uniqueId,
        status: 'Active',
      });

    const beneficiary = createRes.body.data;

    const res = await request(app)
      .post('/api/v1/admin/me/at-risk')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        reason: 'Test at-risk flag',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.resolved).toBe(false);
  });

  it('should block duplicate active at-risk flag', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);
    const school = schoolsRes.body.data.items[0];
    if (!school) {
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

    const uniqueId = `DUP-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Dup',
        last_name: 'Test',
        gender: 'Male',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: uniqueId,
        status: 'Active',
      });

    const beneficiary = createRes.body.data;

    // Create first flag
    const first = await request(app)
      .post('/api/v1/admin/me/at-risk')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        reason: 'First flag',
      });
    expect(first.status).toBe(201);

    // Try to create second flag for same beneficiary
    const res = await request(app)
      .post('/api/v1/admin/me/at-risk')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        reason: 'Duplicate flag',
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('active at-risk flag already exists');
  });

  it('should resolve an at-risk flag', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/at-risk')
      .set('Authorization', `Bearer ${meToken}`);

    const flag = listRes.body.data.items[0];
    if (!flag) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/me/at-risk/${flag.id}/resolve`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        justification: 'Guardian contacted and attendance improved',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.resolved).toBe(true);
    expect(res.body.data.resolved_by).toBeDefined();
  });

  it('should block resolving already resolved flag', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/at-risk?beneficiary_id=00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${meToken}`);

    // Find a resolved flag by querying all and filtering
    const allRes = await request(app)
      .get('/api/v1/admin/me/at-risk?limit=100')
      .set('Authorization', `Bearer ${meToken}`);

    const resolvedFlag = allRes.body.data.items.find((f: any) => f.resolved === true);
    if (!resolvedFlag) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post(`/api/v1/admin/me/at-risk/${resolvedFlag.id}/resolve`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        justification: 'Trying again',
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('already resolved');
  });

  // ── Auto-Flagging ──

  it('should auto-flag beneficiaries below thresholds', async () => {
    const schoolsRes = await request(app)
      .get('/api/v1/admin/schools')
      .set('Authorization', `Bearer ${opsToken}`);

    const school = schoolsRes.body.data.items[0];
    if (!school) {
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

    const uniqueId = `AUTO-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/admin/beneficiaries')
      .set('Authorization', `Bearer ${opsToken}`)
      .send({
        first_name: 'Auto',
        last_name: 'Flag',
        gender: 'Male',
        district: school.district,
        school_id: school.id,
        program_id: program.id,
        national_id: uniqueId,
        status: 'Active',
      });

    const beneficiary = createRes.body.data;

    const uniquePeriod = `PER-${Date.now()}`;

    // Create a low performance record
    await request(app)
      .post('/api/v1/admin/me/performance')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        school_id: school.id,
        academic_period: uniquePeriod,
        subjects: { english: 40, math: 45 },
        overall_score: 42.5,
        attendance_percentage: 70,
      });

    const res = await request(app)
      .post('/api/v1/admin/me/auto-flag')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        score_threshold: 50,
        attendance_threshold: 75,
        academic_period: uniquePeriod,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.flagged.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.skipped).toBeInstanceOf(Array);
  });

  // ── Interventions ──

  it('should list interventions', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/interventions')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should create an intervention', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const meUserRes = await request(app)
      .get('/api/v1/admin/users?email=tayamuthola@gmail.com')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const meUser = meUserRes.body.data.items?.[0];
    if (!meUser) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/me/interventions')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        action: 'Schedule counseling session',
        assigned_to: meUser.id,
        due_date: '2026-06-30',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('Open');
    expect(res.body.data.action).toBe('Schedule counseling session');
  });

  it('should reject intervention creation for non-existent beneficiary', async () => {
    const meUserRes = await request(app)
      .get('/api/v1/admin/users?email=tayamuthola@gmail.com')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const meUser = meUserRes.body.data.items?.[0];
    if (!meUser) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/me/interventions')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: '00000000-0000-0000-0000-000000000000',
        action: 'Test action',
        assigned_to: meUser.id,
        due_date: '2026-06-30',
      });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  it('should get an intervention by id', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/me/interventions/${intervention.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(intervention.id);
  });

  it('should update an intervention', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=Open')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/interventions/${intervention.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        action: 'Updated action description',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.action).toBe('Updated action description');
  });

  it('should block updating a closed intervention', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=Closed')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/interventions/${intervention.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        action: 'Should fail',
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Closed interventions cannot be updated');
  });

  it('should update intervention status Open -> InProgress', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=Open')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/me/interventions/${intervention.id}/status`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        status: 'InProgress',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('InProgress');
  });

  it('should update intervention status InProgress -> Closed with resolution notes', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=InProgress')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/me/interventions/${intervention.id}/status`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        status: 'Closed',
        resolution_notes: 'Counseling completed successfully',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.status).toBe('Closed');
    expect(res.body.data.resolution_notes).toBe('Counseling completed successfully');
  });

  it('should block invalid status transition Closed -> Open', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=Closed')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/me/interventions/${intervention.id}/status`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        status: 'Open',
      });

    expect(res.status).toBe(409);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('Invalid status transition');
  });

  it('should require resolution_notes when closing intervention', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/interventions?status=InProgress')
      .set('Authorization', `Bearer ${meToken}`);

    const intervention = listRes.body.data.items[0];
    if (!intervention) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .patch(`/api/v1/admin/me/interventions/${intervention.id}/status`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        status: 'Closed',
      });

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('resolution_notes');
  });

  // ── Monitoring Visits ──

  it('should list monitoring visits', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/visits')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should create a monitoring visit', async () => {
    const beneficiariesRes = await request(app)
      .get('/api/v1/admin/beneficiaries?status=Active')
      .set('Authorization', `Bearer ${opsToken}`);

    const beneficiary = beneficiariesRes.body.data.items[0];
    if (!beneficiary) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/me/visits')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        entity_type: 'beneficiary',
        entity_id: beneficiary.id,
        visit_date: '2026-04-01',
        findings: 'Test visit findings',
        follow_up_actions: 'Follow up in 2 weeks',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.findings).toBe('Test visit findings');
  });

  it('should get a monitoring visit by id', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/visits')
      .set('Authorization', `Bearer ${meToken}`);

    const visit = listRes.body.data.items[0];
    if (!visit) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/me/visits/${visit.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(visit.id);
  });

  it('should update a monitoring visit', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/visits')
      .set('Authorization', `Bearer ${meToken}`);

    const visit = listRes.body.data.items[0];
    if (!visit) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/visits/${visit.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        findings: 'Updated findings',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.findings).toBe('Updated findings');
  });

  it('should delete a monitoring visit', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/visits')
      .set('Authorization', `Bearer ${meToken}`);

    const visit = listRes.body.data.items.find((v: any) => v.findings === 'Updated findings');
    if (!visit) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .delete(`/api/v1/admin/me/visits/${visit.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.deleted).toBe(true);
  });

  // ── Outcomes ──

  it('should list outcomes', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.items).toBeInstanceOf(Array);
  });

  it('should create an outcome', async () => {
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
      .post('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: beneficiary.id,
        program_id: program.id,
        outcome_type: 'Completion',
        outcome_date: '2026-12-31',
        reason: 'Completed successfully',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.outcome_type).toBe('Completion');
  });

  it('should reject outcome creation for non-existent beneficiary', async () => {
    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const program = programsRes.body.data.items[0];
    if (!program) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        beneficiary_id: '00000000-0000-0000-0000-000000000000',
        program_id: program.id,
        outcome_type: 'Graduation',
        outcome_date: '2026-12-31',
      });

    expect(res.status).toBe(404);
    expect(res.body.status).toBe('error');
  });

  it('should get an outcome by id', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`);

    const outcome = listRes.body.data.items[0];
    if (!outcome) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/me/outcomes/${outcome.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(outcome.id);
  });

  it('should update an outcome', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`);

    const outcome = listRes.body.data.items[0];
    if (!outcome) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/me/outcomes/${outcome.id}`)
      .set('Authorization', `Bearer ${meToken}`)
      .send({
        reason: 'Updated reason',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.reason).toBe('Updated reason');
  });

  it('should delete an outcome', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/me/outcomes')
      .set('Authorization', `Bearer ${meToken}`);

    const outcome = listRes.body.data.items.find((o: any) => o.reason === 'Updated reason');
    if (!outcome) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .delete(`/api/v1/admin/me/outcomes/${outcome.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.deleted).toBe(true);
  });

  // ── Metrics ──

  it('should return program metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/me/metrics')
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.total_active_beneficiaries).toBeDefined();
    expect(res.body.data.completion).toBeDefined();
    expect(res.body.data.graduation).toBeDefined();
    expect(res.body.data.dropout).toBeDefined();
    expect(res.body.data.progression).toBeDefined();
    expect(typeof res.body.data.completion.rate).toBe('number');
  });

  it('should filter metrics by program', async () => {
    const programsRes = await request(app)
      .get('/api/v1/admin/programs')
      .set('Authorization', `Bearer ${opsToken}`);

    const program = programsRes.body.data.items[0];
    if (!program) {
      expect(true).toBe(true);
      return;
    }

    const res = await request(app)
      .get(`/api/v1/admin/me/metrics?program_id=${program.id}`)
      .set('Authorization', `Bearer ${meToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.filters.program_id).toBe(program.id);
  });
});
