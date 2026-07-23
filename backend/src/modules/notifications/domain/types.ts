import { NotificationChannel } from '@prisma/client';

export type NotificationLogResponse = {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  templateId: string;
  status: string;
  errorMessage: string | null;
  sentAt: Date;
};

export type ExportLogResponse = {
  id: string;
  userId: string;
  exportType: string;
  format: string;
  filters: Record<string, unknown> | null;
  exportedAt: Date;
};
