import cron from 'node-cron';
import prisma from '../../infrastructure/database/prisma';

let task: cron.ScheduledTask | null = null;

export function startOtpCleanup(): void {
  if (task) return;

  task = cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await prisma.otpCode.deleteMany({
        where: { expires_at: { lt: new Date() } },
      });
      if (result.count > 0) {
        console.log(`[OtpCleanup] Removed ${result.count} expired OTP codes`);
      }
    } catch (err) {
      console.error('[OtpCleanup] Error cleaning expired OTP codes:', err);
    }
  });

  console.log('[OtpCleanup] Started (checking every 5 minutes)');
}

export function stopOtpCleanup(): void {
  if (task) {
    task.stop();
    task = null;
    console.log('[OtpCleanup] Stopped');
  }
}
