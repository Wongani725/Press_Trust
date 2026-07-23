import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';

const onboadingActionSchema = z.object({
  reason: z.string().optional(),
});

// ── List pending/onboarding beneficiaries ──

/**
 * @openapi
 * /admin/onboarding/pending:
 *   get:
 *     tags: [Beneficiaries]
 *     summary: List beneficiaries pending onboarding validation/approval
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [Imported, PendingOnboarding, Suspended] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of beneficiaries
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 */
export async function listPendingBeneficiaries(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const status = req.query.status as string | undefined;

  const statuses = status
    ? [status]
    : ['Imported', 'PendingOnboarding', 'Suspended'];

  const where: Record<string, unknown> = {
    status: { in: statuses },
  };

  const [beneficiaries, total] = await Promise.all([
    prisma.beneficiary.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        school: { select: { id: true, name: true, district: true } },
        program: { select: { id: true, name: true } },
        guardians: { select: { id: true, name: true, relationship: true, contact_phone: true } },
      },
    }),
    prisma.beneficiary.count({ where }),
  ]);

  const data = (beneficiaries as any[]).map((b) => ({
    id: b.id,
    beneficiary_identifier: b.beneficiary_identifier,
    first_name: b.first_name,
    last_name: b.last_name,
    gender: b.gender,
    district: b.district,
    school: b.school,
    program: b.program,
    status: b.status,
    status_reason: b.status_reason,
    national_id: b.national_id,
    exams_id: b.exams_id,
    contact_email: b.contact_email,
    contact_phone: b.contact_phone,
    academic_year: b.academic_year,
    guardians: b.guardians,
    created_at: b.created_at,
    updated_at: b.updated_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Pending beneficiaries retrieved successfully',
  });
}

// ── Validate (Imported → PendingOnboarding) ──

/**
 * @openapi
 * /admin/onboarding/{id}/validate:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Validate an imported beneficiary (move to PendingOnboarding)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Beneficiary validated
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Beneficiary not found
 *       409:
 *         description: Invalid status transition
 */
export async function validateBeneficiary(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (beneficiary.status !== 'Imported') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot validate beneficiary in status ${beneficiary.status}` });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status: 'PendingOnboarding' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'validate',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status },
    new_values: { status: 'PendingOnboarding' },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
    message: 'Beneficiary validated and moved to Pending Onboarding',
  });
}

// ── Approve (PendingOnboarding → Active) ──

/**
 * @openapi
 * /admin/onboarding/{id}/approve:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Approve a beneficiary (move to Active)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Beneficiary approved
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Beneficiary not found
 *       409:
 *         description: Invalid status transition
 */
export async function approveBeneficiary(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (beneficiary.status !== 'PendingOnboarding') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot approve beneficiary in status ${beneficiary.status}` });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status: 'Active' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'approve',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status },
    new_values: { status: 'Active' },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
    message: 'Beneficiary approved and activated',
  });
}

// ── Exception (Any → Suspended) ──

/**
 * @openapi
 * /admin/onboarding/{id}/exception:
 *   post:
 *     tags: [Beneficiaries]
 *     summary: Flag a beneficiary with an exception (move to Suspended)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingAction'
 *     responses:
 *       200:
 *         description: Exception flagged
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Beneficiary not found
 */
export async function flagException(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { reason } = onboadingActionSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status: 'Suspended', status_reason: reason || 'Exception flagged' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'exception',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status, status_reason: beneficiary.status_reason },
    new_values: { status: 'Suspended', status_reason: reason || 'Exception flagged' },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status, status_reason: updated.status_reason },
    message: 'Beneficiary flagged with exception',
  });
}

// ── Resolve Exception (Suspended → PendingOnboarding) ──

/**
 * @openapi
 * /admin/onboarding/exceptions/{id}/resolve:
 *   put:
 *     tags: [Beneficiaries]
 *     summary: Resolve a beneficiary exception (move to PendingOnboarding)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OnboardingAction'
 *     responses:
 *       200:
 *         description: Exception resolved
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthenticated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Beneficiary not found
 *       409:
 *         description: Beneficiary is not in Suspended status
 */
export async function resolveException(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { reason } = onboadingActionSchema.parse(req.body);

  const beneficiary = await prisma.beneficiary.findUnique({ where: { id } });
  if (!beneficiary) {
    res.status(404).json({ status: 'error', data: null, message: 'Beneficiary not found' });
    return;
  }

  if (beneficiary.status !== 'Suspended') {
    res.status(409).json({ status: 'error', data: null, message: `Cannot resolve exception for beneficiary in status ${beneficiary.status}` });
    return;
  }

  const updated = await prisma.beneficiary.update({
    where: { id },
    data: { status: 'PendingOnboarding', status_reason: reason || null },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'resolve_exception',
    entity_type: 'Beneficiary',
    entity_id: id,
    old_values: { status: beneficiary.status, status_reason: beneficiary.status_reason },
    new_values: { status: 'PendingOnboarding', status_reason: reason || null },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status, status_reason: updated.status_reason },
    message: 'Beneficiary exception resolved',
  });
}
