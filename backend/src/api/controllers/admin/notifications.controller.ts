import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';
import { AVAILABLE_EVENTS } from '../../../modules/notifications';
import { sendEmail } from '../../../infrastructure/email/email.service';

const templateCreateSchema = z.object({
  name: z.string().min(1).max(200),
  channel: z.enum(['email', 'in_app']),
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

const templateUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  channel: z.enum(['email', 'in_app']).optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
});

const triggerCreateSchema = z.object({
  name: z.string().min(1).max(200),
  event_name: z.string().min(1),
  template_id: z.string().uuid(),
  conditions: z.record(z.string(), z.unknown()).optional(),
});

const triggerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  event_name: z.string().min(1).optional(),
  template_id: z.string().uuid().optional(),
  conditions: z.record(z.string(), z.unknown()).optional(),
});

// ── Templates ──

/**
 * @openapi
 * /admin/notification-templates:
 *   get:
 *     tags: [Notifications]
 *     summary: List notification templates with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [email, in_app] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of notification templates
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                     name: Award Approval Email
 *                     channel: email
 *                     subject: Your scholarship award has been approved
 *                     body: "Dear {{first_name}}, your award for {{program}} has been approved."
 *                     variables: [first_name, program]
 *                     created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     creator:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Grace Banda
 *                       email: grace.banda@presstrust.mw
 *                     _count: { triggers: 2 }
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-15T09:30:00.000Z
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Notification templates retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 */
export async function listTemplates(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.channel) where.channel = req.query.channel;

  const [items, total] = await Promise.all([
    prisma.notificationTemplate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { creator: { select: { id: true, name: true, email: true } }, _count: { select: { triggers: true } } },
    }),
    prisma.notificationTemplate.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Notification templates retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/notification-templates:
 *   post:
 *     tags: [Notifications]
 *     summary: Create a notification template
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, channel, subject, body]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               channel: { type: string, enum: [email, in_app] }
 *               subject: { type: string, maxLength: 500 }
 *               body: { type: string }
 *               variables: { type: array, items: { type: string } }
 *           example:
 *             name: Award Approval Email
 *             channel: email
 *             subject: Your scholarship award has been approved
 *             body: "Dear {{first_name}}, your award for {{program}} has been approved."
 *             variables: [first_name, program]
 *     responses:
 *       201:
 *         description: Notification template created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 name: Award Approval Email
 *                 channel: email
 *                 subject: Your scholarship award has been approved
 *                 body: "Dear {{first_name}}, your award for {{program}} has been approved."
 *                 variables: [first_name, program]
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Notification template created successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       500:
 *         description: Invalid payload or unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: An unexpected error occurred
 */
export async function createTemplate(req: Request, res: Response): Promise<void> {
  const body = templateCreateSchema.parse(req.body);

  const record = await prisma.notificationTemplate.create({
    data: {
      name: body.name,
      channel: body.channel,
      subject: body.subject,
      body: body.body,
      variables: (body.variables || []) as any,
      created_by: req.user!.userId,
    },
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'CREATE_NOTIFICATION_TEMPLATE',
    entity_type: 'NotificationTemplate',
    entity_id: record.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: record, message: 'Notification template created successfully' });
}

/**
 * @openapi
 * /admin/notification-templates/{id}:
 *   get:
 *     tags: [Notifications]
 *     summary: Get a notification template by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification template retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 name: Award Approval Email
 *                 channel: email
 *                 subject: Your scholarship award has been approved
 *                 body: "Dear {{first_name}}, your award for {{program}} has been approved."
 *                 variables: [first_name, program]
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 creator:
 *                   id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Grace Banda
 *                   email: grace.banda@presstrust.mw
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Notification template retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification template not found
 */
export async function getTemplate(req: Request, res: Response): Promise<void> {
  const record = await prisma.notificationTemplate.findUnique({
    where: { id: req.params.id },
    include: { creator: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
    return;
  }

  res.json({ status: 'success', data: record, message: 'Notification template retrieved successfully' });
}

/**
 * @openapi
 * /admin/notification-templates/{id}:
 *   put:
 *     tags: [Notifications]
 *     summary: Update a notification template
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
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               channel: { type: string, enum: [email, in_app] }
 *               subject: { type: string, maxLength: 500 }
 *               body: { type: string }
 *               variables: { type: array, items: { type: string } }
 *           example:
 *             subject: Your scholarship award has been approved!
 *     responses:
 *       200:
 *         description: Notification template updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 name: Award Approval Email
 *                 channel: email
 *                 subject: Your scholarship award has been approved!
 *                 body: "Dear {{first_name}}, your award for {{program}} has been approved."
 *                 variables: [first_name, program]
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-20T11:05:00.000Z
 *               message: Notification template updated successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification template not found
 */
export async function updateTemplate(req: Request, res: Response): Promise<void> {
  const body = templateUpdateSchema.parse(req.body);

  const existing = await prisma.notificationTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
    return;
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.channel !== undefined) data.channel = body.channel;
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.body !== undefined) data.body = body.body;
  if (body.variables !== undefined) data.variables = body.variables;

  const updated = await prisma.notificationTemplate.update({ where: { id: req.params.id }, data });

  await logAudit({
    user_id: req.user!.userId,
    action: 'UPDATE_NOTIFICATION_TEMPLATE',
    entity_type: 'NotificationTemplate',
    entity_id: updated.id,
    old_values: existing,
    new_values: data,
  });

  res.json({ status: 'success', data: updated, message: 'Notification template updated successfully' });
}

/**
 * @openapi
 * /admin/notification-templates/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification template (and its logs and triggers)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification template deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Notification template deleted successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification template not found
 */
export async function deleteTemplate(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationTemplate.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
    return;
  }

  await prisma.notificationLog.deleteMany({ where: { template_id: req.params.id } });
  await prisma.notificationTrigger.deleteMany({ where: { template_id: req.params.id } });
  await prisma.notificationTemplate.delete({ where: { id: req.params.id } });

  await logAudit({
    user_id: req.user!.userId,
    action: 'DELETE_NOTIFICATION_TEMPLATE',
    entity_type: 'NotificationTemplate',
    entity_id: req.params.id,
    old_values: { name: existing.name },
  });

  res.json({ status: 'success', data: null, message: 'Notification template deleted successfully' });
}

/**
 * @openapi
 * /admin/notification-templates/{id}/test:
 *   post:
 *     tags: [Notifications]
 *     summary: Send a test notification (email or in-app) using this template to the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Test notification sent or created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Test email sent successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification template or user not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification template not found
 *       500:
 *         description: Failed to send the test email
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: "Failed to send test email: SMTP connection timed out"
 */
export async function testTemplate(req: Request, res: Response): Promise<void> {
  const template = await prisma.notificationTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
    return;
  }

  if (template.channel === 'email') {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ status: 'error', data: null, message: 'User not found' });
      return;
    }

    const variables = (template.variables as string[]) || [];
    const sampleVars: Record<string, string> = {};
    for (const v of variables) {
      sampleVars[v] = `[${v}]`;
    }
    const subject = template.subject.replace(/\{\{(\w+)\}\}/g, (_, k) => sampleVars[k] || `{{${k}}}`);
    const body = template.body.replace(/\{\{(\w+)\}\}/g, (_, k) => sampleVars[k] || `{{${k}}}`);

    try {
      await sendEmail({ to: user.email, subject, text: body });
      res.json({ status: 'success', data: null, message: 'Test email sent successfully' });
    } catch (err: any) {
      res.status(500).json({ status: 'error', data: null, message: `Failed to send test email: ${err.message}` });
    }
  } else {
    await prisma.inAppNotification.create({
      data: {
        user_id: req.user!.userId,
        title: template.subject,
        body: template.body,
      },
    });
    res.json({ status: 'success', data: null, message: 'Test in-app notification created' });
  }
}

// ── Triggers ──

/**
 * @openapi
 * /admin/notification-triggers:
 *   get:
 *     tags: [Notifications]
 *     summary: List notification triggers with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: event_name
 *         schema: { type: string }
 *       - in: query
 *         name: enabled
 *         schema: { type: boolean }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of notification triggers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: e5f6a7b8-2222-4a2b-9b0a-4a2b6c1e0002
 *                     name: Notify on Award Activation
 *                     event_name: award.activated
 *                     template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                     conditions: null
 *                     enabled: true
 *                     created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     template: { id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001, name: Award Approval Email, channel: email }
 *                     creator:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Grace Banda
 *                       email: grace.banda@presstrust.mw
 *                     created_at: 2026-01-15T09:40:00.000Z
 *                     updated_at: 2026-01-15T09:40:00.000Z
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Notification triggers retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 */
export async function listTriggers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.event_name) where.event_name = req.query.event_name;
  if (req.query.enabled !== undefined) where.enabled = req.query.enabled === 'true';

  const [items, total] = await Promise.all([
    prisma.notificationTrigger.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { template: { select: { id: true, name: true, channel: true } }, creator: { select: { id: true, name: true, email: true } } },
    }),
    prisma.notificationTrigger.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Notification triggers retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/notification-triggers:
 *   post:
 *     tags: [Notifications]
 *     summary: Create a notification trigger for an application event
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, event_name, template_id]
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               event_name: { type: string }
 *               template_id: { type: string, format: uuid }
 *               conditions: { type: object }
 *           example:
 *             name: Notify on Award Activation
 *             event_name: award.activated
 *             template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *     responses:
 *       201:
 *         description: Notification trigger created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: e5f6a7b8-2222-4a2b-9b0a-4a2b6c1e0002
 *                 name: Notify on Award Activation
 *                 event_name: award.activated
 *                 template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 conditions: null
 *                 enabled: true
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 created_at: 2026-01-15T09:40:00.000Z
 *                 updated_at: 2026-01-15T09:40:00.000Z
 *               message: Notification trigger created successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification template not found
 *       422:
 *         description: Invalid event name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: "Invalid event name. Available: beneficiary.created, beneficiary.imported, beneficiary.status_changed, award.created, award.activated, award.closed, disbursement.approved, disbursement.paid, disbursement.reconciled, disbursement.failed, me.performance_recorded, me.at_risk_flagged, me.at_risk_resolved, me.intervention_closed"
 */
export async function createTrigger(req: Request, res: Response): Promise<void> {
  const body = triggerCreateSchema.parse(req.body);

  const template = await prisma.notificationTemplate.findUnique({ where: { id: body.template_id } });
  if (!template) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
    return;
  }

  if (!AVAILABLE_EVENTS.includes(body.event_name as any)) {
    res.status(422).json({ status: 'error', data: null, message: `Invalid event name. Available: ${AVAILABLE_EVENTS.join(', ')}` });
    return;
  }

  const record = await prisma.notificationTrigger.create({
    data: {
      name: body.name,
      event_name: body.event_name,
      template_id: body.template_id,
      conditions: (body.conditions as any) || null,
      created_by: req.user!.userId,
    },
  });

  await logAudit({
    user_id: req.user!.userId,
    action: 'CREATE_NOTIFICATION_TRIGGER',
    entity_type: 'NotificationTrigger',
    entity_id: record.id,
    new_values: body,
  });

  res.status(201).json({ status: 'success', data: record, message: 'Notification trigger created successfully' });
}

/**
 * @openapi
 * /admin/notification-triggers/{id}:
 *   get:
 *     tags: [Notifications]
 *     summary: Get a notification trigger by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification trigger retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: e5f6a7b8-2222-4a2b-9b0a-4a2b6c1e0002
 *                 name: Notify on Award Activation
 *                 event_name: award.activated
 *                 template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 conditions: null
 *                 enabled: true
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 template: { id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001, name: Award Approval Email, channel: email }
 *                 creator:
 *                   id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                   name: Grace Banda
 *                   email: grace.banda@presstrust.mw
 *                 created_at: 2026-01-15T09:40:00.000Z
 *                 updated_at: 2026-01-15T09:40:00.000Z
 *               message: Notification trigger retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification trigger not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification trigger not found
 */
export async function getTrigger(req: Request, res: Response): Promise<void> {
  const record = await prisma.notificationTrigger.findUnique({
    where: { id: req.params.id },
    include: { template: { select: { id: true, name: true, channel: true } }, creator: { select: { id: true, name: true, email: true } } },
  });

  if (!record) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification trigger not found' });
    return;
  }

  res.json({ status: 'success', data: record, message: 'Notification trigger retrieved successfully' });
}

/**
 * @openapi
 * /admin/notification-triggers/{id}:
 *   put:
 *     tags: [Notifications]
 *     summary: Update a notification trigger
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
 *             type: object
 *             properties:
 *               name: { type: string, maxLength: 200 }
 *               event_name: { type: string }
 *               template_id: { type: string, format: uuid }
 *               conditions: { type: object }
 *           example:
 *             name: Notify Ops on Award Activation
 *     responses:
 *       200:
 *         description: Notification trigger updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: e5f6a7b8-2222-4a2b-9b0a-4a2b6c1e0002
 *                 name: Notify Ops on Award Activation
 *                 event_name: award.activated
 *                 template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 conditions: null
 *                 enabled: true
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 created_at: 2026-01-15T09:40:00.000Z
 *                 updated_at: 2026-01-20T12:00:00.000Z
 *               message: Notification trigger updated successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification trigger or template not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification trigger not found
 *       422:
 *         description: Invalid event name
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: "Invalid event name. Available: beneficiary.created, beneficiary.imported, beneficiary.status_changed, award.created, award.activated, award.closed, disbursement.approved, disbursement.paid, disbursement.reconciled, disbursement.failed, me.performance_recorded, me.at_risk_flagged, me.at_risk_resolved, me.intervention_closed"
 */
export async function updateTrigger(req: Request, res: Response): Promise<void> {
  const body = triggerUpdateSchema.parse(req.body);

  const existing = await prisma.notificationTrigger.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification trigger not found' });
    return;
  }

  if (body.event_name && !AVAILABLE_EVENTS.includes(body.event_name as any)) {
    res.status(422).json({ status: 'error', data: null, message: `Invalid event name. Available: ${AVAILABLE_EVENTS.join(', ')}` });
    return;
  }

  if (body.template_id) {
    const template = await prisma.notificationTemplate.findUnique({ where: { id: body.template_id } });
    if (!template) {
      res.status(404).json({ status: 'error', data: null, message: 'Notification template not found' });
      return;
    }
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.event_name !== undefined) data.event_name = body.event_name;
  if (body.template_id !== undefined) data.template_id = body.template_id;
  if (body.conditions !== undefined) data.conditions = body.conditions;

  const updated = await prisma.notificationTrigger.update({ where: { id: req.params.id }, data });

  await logAudit({
    user_id: req.user!.userId,
    action: 'UPDATE_NOTIFICATION_TRIGGER',
    entity_type: 'NotificationTrigger',
    entity_id: updated.id,
    old_values: existing,
    new_values: data,
  });

  res.json({ status: 'success', data: updated, message: 'Notification trigger updated successfully' });
}

/**
 * @openapi
 * /admin/notification-triggers/{id}:
 *   delete:
 *     tags: [Notifications]
 *     summary: Delete a notification trigger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification trigger deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Notification trigger deleted successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification trigger not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification trigger not found
 */
export async function deleteTrigger(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationTrigger.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification trigger not found' });
    return;
  }

  await prisma.notificationTrigger.delete({ where: { id: req.params.id } });

  await logAudit({
    user_id: req.user!.userId,
    action: 'DELETE_NOTIFICATION_TRIGGER',
    entity_type: 'NotificationTrigger',
    entity_id: req.params.id,
    old_values: { name: existing.name },
  });

  res.json({ status: 'success', data: null, message: 'Notification trigger deleted successfully' });
}

/**
 * @openapi
 * /admin/notification-triggers/{id}/toggle:
 *   patch:
 *     tags: [Notifications]
 *     summary: Enable or disable a notification trigger
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification trigger toggled
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: e5f6a7b8-2222-4a2b-9b0a-4a2b6c1e0002
 *                 name: Notify on Award Activation
 *                 event_name: award.activated
 *                 template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                 conditions: null
 *                 enabled: false
 *                 created_by: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 created_at: 2026-01-15T09:40:00.000Z
 *                 updated_at: 2026-01-20T12:10:00.000Z
 *               message: Trigger disabled successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 *       404:
 *         description: Notification trigger not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification trigger not found
 */
export async function toggleTrigger(req: Request, res: Response): Promise<void> {
  const existing = await prisma.notificationTrigger.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification trigger not found' });
    return;
  }

  const updated = await prisma.notificationTrigger.update({
    where: { id: req.params.id },
    data: { enabled: !existing.enabled },
  });

  res.json({ status: 'success', data: updated, message: `Trigger ${updated.enabled ? 'enabled' : 'disabled'} successfully` });
}

/**
 * @openapi
 * /admin/notification-triggers/events:
 *   get:
 *     tags: [Notifications]
 *     summary: List the application event names available for trigger configuration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available events retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 events:
 *                   - beneficiary.created
 *                   - beneficiary.imported
 *                   - beneficiary.status_changed
 *                   - award.created
 *                   - award.activated
 *                   - award.closed
 *                   - disbursement.approved
 *                   - disbursement.paid
 *                   - disbursement.reconciled
 *                   - disbursement.failed
 *                   - me.performance_recorded
 *                   - me.at_risk_flagged
 *                   - me.at_risk_resolved
 *                   - me.intervention_closed
 *               message: Available events retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 */
export async function listAvailableEvents(_req: Request, res: Response): Promise<void> {
  res.json({ status: 'success', data: { events: AVAILABLE_EVENTS }, message: 'Available events retrieved successfully' });
}

// ── Notification Logs ──

/**
 * @openapi
 * /admin/notification-logs:
 *   get:
 *     tags: [Notifications]
 *     summary: List notification delivery logs with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [sent, failed] }
 *       - in: query
 *         name: channel
 *         schema: { type: string, enum: [email, in_app] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of notification logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: f1a2b3c4-3333-4a2b-9b0a-4a2b6c1e0003
 *                     user_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     recipient: grace.banda@presstrust.mw
 *                     channel: email
 *                     template_id: d1e2f3a4-1111-4a2b-9b0a-4a2b6c1e0001
 *                     subject: Your scholarship award has been approved
 *                     status: sent
 *                     error_message: null
 *                     sent_at: 2026-01-16T08:00:00.000Z
 *                     user:
 *                       id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                       name: Grace Banda
 *                       email: grace.banda@presstrust.mw
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Notification logs retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       403:
 *         description: Forbidden
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Insufficient permissions
 */
export async function listNotificationLogs(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where: Record<string, unknown> = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.channel) where.channel = req.query.channel;

  const [items, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { sent_at: 'desc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.notificationLog.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Notification logs retrieved successfully',
  });
}

// ── In-App Notifications (user-facing) ──

/**
 * @openapi
 * /admin/notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List in-app notifications for the current user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of the current user's notifications
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 9c8b7a6d-4444-4a2b-9b0a-4a2b6c1e0004
 *                     user_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     title: Award Approved
 *                     body: Your scholarship award has been approved
 *                     read: false
 *                     created_at: 2026-01-16T08:00:00.000Z
 *                 meta: { page: 1, limit: 20, total: 1, totalPages: 1 }
 *               message: Notifications retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 */
export async function listMyNotifications(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);

  const where = { user_id: req.user!.userId };

  const [items, total] = await Promise.all([
    prisma.inAppNotification.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.inAppNotification.count({ where }),
  ]);

  res.json({
    status: 'success',
    data: { items, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Notifications retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one of the current user's notifications as read
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Notification marked as read
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Notification marked as read
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 *       404:
 *         description: Notification not found (or does not belong to the current user)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Notification not found
 */
export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const existing = await prisma.inAppNotification.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.user_id !== req.user!.userId) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification not found' });
    return;
  }

  await prisma.inAppNotification.update({ where: { id: req.params.id }, data: { read: true } });

  res.json({ status: 'success', data: null, message: 'Notification marked as read' });
}

/**
 * @openapi
 * /admin/notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Get the count of unread notifications for the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unread count retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 count: 3
 *               message: Unread count retrieved successfully
 *       401:
 *         description: Unauthenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Missing or invalid authorization header
 */
export async function unreadCount(req: Request, res: Response): Promise<void> {
  const count = await prisma.inAppNotification.count({
    where: { user_id: req.user!.userId, read: false },
  });

  res.json({ status: 'success', data: { count }, message: 'Unread count retrieved successfully' });
}
