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

export async function listAvailableEvents(_req: Request, res: Response): Promise<void> {
  res.json({ status: 'success', data: { events: AVAILABLE_EVENTS }, message: 'Available events retrieved successfully' });
}

// ── Notification Logs ──

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

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  const existing = await prisma.inAppNotification.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.user_id !== req.user!.userId) {
    res.status(404).json({ status: 'error', data: null, message: 'Notification not found' });
    return;
  }

  await prisma.inAppNotification.update({ where: { id: req.params.id }, data: { read: true } });

  res.json({ status: 'success', data: null, message: 'Notification marked as read' });
}

export async function unreadCount(req: Request, res: Response): Promise<void> {
  const count = await prisma.inAppNotification.count({
    where: { user_id: req.user!.userId, read: false },
  });

  res.json({ status: 'success', data: { count }, message: 'Unread count retrieved successfully' });
}
