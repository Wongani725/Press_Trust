import prisma from '../../infrastructure/database/prisma';
import { sendEmail } from '../../infrastructure/email/email.service';
import { eventBus } from '../../shared/events/event-bus';
import { NotificationChannel } from '@prisma/client';

export const AVAILABLE_EVENTS = [
  'beneficiary.created',
  'beneficiary.imported',
  'beneficiary.status_changed',
  'award.created',
  'award.activated',
  'award.closed',
  'disbursement.approved',
  'disbursement.paid',
  'disbursement.reconciled',
  'disbursement.failed',
  'me.performance_recorded',
  'me.at_risk_flagged',
  'me.at_risk_resolved',
  'me.intervention_closed',
] as const;

export type AppEvent = (typeof AVAILABLE_EVENTS)[number];

function renderTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
  });
}

async function evaluateTriggers(event: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const triggers = await prisma.notificationTrigger.findMany({
      where: { event_name: event, enabled: true },
      include: { template: true },
    });

    for (const trigger of triggers) {
      try {
        await processTrigger(trigger, payload);
      } catch (err: any) {
        console.error(`[Notification] Failed to process trigger ${trigger.id}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[Notification] Error evaluating triggers for ${event}:`, err.message);
  }
}

async function processTrigger(trigger: any, payload: Record<string, unknown>): Promise<void> {
  const template = trigger.template;
  if (!template) return;

  const variables = { ...payload };
  const subject = renderTemplate(template.subject, variables);
  const body = renderTemplate(template.body, variables);

  const recipientValue = payload.email as string || payload.recipient as string || '';

  if (template.channel === 'email' && recipientValue) {
    try {
      await sendEmail({
        to: recipientValue,
        subject,
        text: body,
      });

      await logNotification({
        user_id: payload.userId as string || null,
        recipient: recipientValue,
        channel: 'email',
        template_id: template.id,
        subject,
        status: 'sent',
      });
    } catch (err: any) {
      await logNotification({
        user_id: payload.userId as string || null,
        recipient: recipientValue,
        channel: 'email',
        template_id: template.id,
        subject,
        status: 'failed',
        error_message: err.message,
      });
    }
  } else if (template.channel === 'in_app') {
    const userId = payload.userId as string;
    if (userId) {
      await prisma.inAppNotification.create({
        data: {
          user_id: userId,
          title: subject,
          body,
        },
      });

      await logNotification({
        user_id: userId,
        recipient: userId,
        channel: 'in_app',
        template_id: template.id,
        subject,
        status: 'sent',
      });
    }
  }
}

interface LogNotificationParams {
  user_id?: string | null;
  recipient: string;
  channel: string;
  template_id?: string;
  subject?: string;
  status: string;
  error_message?: string;
}

async function logNotification(params: LogNotificationParams): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      user_id: params.user_id || null,
      recipient: params.recipient,
      channel: params.channel as NotificationChannel,
      template_id: params.template_id || null,
      subject: params.subject || null,
      status: params.status,
      error_message: params.error_message || null,
    },
  });
}

export function initNotificationSystem(): void {
  for (const event of AVAILABLE_EVENTS) {
    eventBus.on(event, (payload) => evaluateTriggers(event, payload));
  }
}
