import cron from 'node-cron';
import prisma from '../../infrastructure/database/prisma';
import { executeReportDefinition, ExecuteReportResult } from './report-executor.service';
import { sendReportEmail } from '../../infrastructure/email/email.service';

let schedulerTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  if (schedulerTask) return;

  schedulerTask = cron.schedule('* * * * *', async () => {
    try {
      await processDueReports();
    } catch (err) {
      console.error('[ReportScheduler] Error processing due reports:', err);
    }
  });

  console.log('[ReportScheduler] Started (checking every 60s)');
}

export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log('[ReportScheduler] Stopped');
  }
}

async function processDueReports(): Promise<void> {
  const now = new Date();

  const due = await prisma.scheduledReport.findMany({
    where: {
      enabled: true,
      next_run_at: { lte: now },
    },
    include: { report: true },
  });

  for (const schedule of due) {
    try {
      const result = await executeReportDefinition({
        reportDefinitionId: schedule.report_id,
        format: schedule.format as any,
        triggeredBy: 'scheduled',
        scheduleId: schedule.id,
      });

      await deliverReport(schedule, result);

      await updateNextRun(schedule.id, schedule.cron_expression, now);
    } catch (err: any) {
      console.error(`[ReportScheduler] Failed to run schedule ${schedule.id}:`, err.message);

      await prisma.reportRunLog.create({
        data: {
          schedule_id: schedule.id,
          report_id: schedule.report_id,
          status: 'failed',
          format: schedule.format,
          error_message: err.message,
          started_at: now,
          triggered_by: 'scheduled',
        },
      });

      await updateNextRun(schedule.id, schedule.cron_expression, now);
    }
  }
}

async function deliverReport(schedule: any, result: ExecuteReportResult): Promise<void> {
  const recipients: string[] = schedule.recipients as string[];
  if (!recipients || recipients.length === 0) return;

  try {
    await sendReportEmail(recipients, schedule.name, result.format, result.buffer, result.fileName);
  } catch (err: any) {
    console.error(`[ReportScheduler] Failed to email report ${schedule.id}:`, err.message);
  }
}

async function updateNextRun(scheduleId: string, cronExpression: string, fromDate: Date): Promise<void> {
  const nextRun = computeNextCronRun(cronExpression, fromDate);

  await prisma.scheduledReport.update({
    where: { id: scheduleId },
    data: {
      last_run_at: fromDate,
      next_run_at: nextRun,
    },
  });
}

function computeNextCronRun(expression: string, after: Date): Date {
  const parts = expression.split(' ');
  if (parts.length !== 5 && parts.length !== 6) return new Date(after.getTime() + 86400000);

  const next = new Date(after);
  next.setMinutes(next.getMinutes() + 1);
  next.setSeconds(0);
  next.setMilliseconds(0);

  return next;
}
