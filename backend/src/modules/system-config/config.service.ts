import prisma from '../../infrastructure/database/prisma';
import { config } from '../../shared/config';
import { resetTransporter } from '../../infrastructure/email/email.service';
import { logAudit } from '../../shared/utils/audit';

interface ConfigDefinition {
  key: string;
  label: string;
  type: string;
  category: string;
  description: string;
  envFallback: () => string;
}

const CONFIG_DEFINITIONS: ConfigDefinition[] = [
  { key: 'smtp_host', label: 'SMTP Host', type: 'string', category: 'smtp', description: 'SMTP server hostname', envFallback: () => config.smtp.host },
  { key: 'smtp_port', label: 'SMTP Port', type: 'number', category: 'smtp', description: 'SMTP server port (465 for SSL, 587 for TLS)', envFallback: () => String(config.smtp.port) },
  { key: 'smtp_user', label: 'SMTP Username', type: 'string', category: 'smtp', description: 'SMTP authentication username', envFallback: () => config.smtp.user },
  { key: 'smtp_pass', label: 'SMTP Password', type: 'password', category: 'smtp', description: 'SMTP authentication password', envFallback: () => config.smtp.pass },
  { key: 'smtp_from', label: 'SMTP From Address', type: 'string', category: 'smtp', description: 'Default sender email address', envFallback: () => config.smtp.from },
  { key: 'smtp_encryption', label: 'SMTP Encryption', type: 'string', category: 'smtp', description: 'ssl, tls, or none', envFallback: () => 'ssl' },
  { key: 'lockout_threshold', label: 'Account Lockout Threshold', type: 'number', category: 'security', description: 'Failed login attempts before lockout', envFallback: () => String(config.security.lockoutThreshold) },
  { key: 'lockout_duration_minutes', label: 'Lockout Duration (minutes)', type: 'number', category: 'security', description: 'How long an account remains locked', envFallback: () => String(config.security.lockoutDurationMinutes) },
  { key: 'session_timeout_minutes', label: 'Session Timeout (minutes)', type: 'number', category: 'security', description: 'Inactivity timeout for JWT sessions', envFallback: () => String(config.security.sessionTimeoutMinutes) },
  { key: 'max_file_size', label: 'Max Upload File Size', type: 'number', category: 'upload', description: 'Maximum file upload size in bytes', envFallback: () => String(config.upload.maxFileSize) },
  { key: 'audit_log_retention_days', label: 'Audit Log Retention (days)', type: 'number', category: 'retention', description: 'Days to retain audit logs', envFallback: () => '90' },
  { key: 'export_log_retention_days', label: 'Export Log Retention (days)', type: 'number', category: 'retention', description: 'Days to retain export logs', envFallback: () => '30' },
  { key: 'report_file_retention_days', label: 'Report File Retention (days)', type: 'number', category: 'retention', description: 'Days to retain generated report files on disk', envFallback: () => '7' },
];

function getDefinition(key: string): ConfigDefinition | undefined {
  return CONFIG_DEFINITIONS.find((d) => d.key === key);
}

export async function seedConfigsIfEmpty(): Promise<void> {
  const count = await prisma.systemConfig.count();
  if (count > 0) return;

  for (const def of CONFIG_DEFINITIONS) {
    await prisma.systemConfig.create({
      data: {
        key: def.key,
        value: def.envFallback(),
        type: def.type,
        category: def.category,
        label: def.label,
        description: def.description,
      },
    });
  }
}

export async function getAllConfigs(): Promise<any[]> {
  const records = await prisma.systemConfig.findMany({ orderBy: { category: 'asc' } });

  return CONFIG_DEFINITIONS.map((def) => {
    const record = records.find((r) => r.key === def.key);
    return {
      key: def.key,
      label: def.label,
      type: def.type,
      category: def.category,
      description: def.description,
      value: record?.value ?? def.envFallback(),
      isOverridden: record?.value !== null && record?.value !== undefined,
      updatedAt: record?.updated_at || null,
    };
  });
}

export async function getConfig(key: string): Promise<any | null> {
  const def = getDefinition(key);
  if (!def) return null;

  const record = await prisma.systemConfig.findUnique({ where: { key } });
  return {
    key: def.key,
    label: def.label,
    type: def.type,
    category: def.category,
    description: def.description,
    value: record?.value ?? def.envFallback(),
    isOverridden: record?.value !== null && record?.value !== undefined,
    updatedAt: record?.updated_at || null,
  };
}

export async function updateConfig(key: string, value: string | null, userId: string): Promise<any | null> {
  const def = getDefinition(key);
  if (!def) return null;

  const existing = await prisma.systemConfig.findUnique({ where: { key } });

  let record;
  if (existing) {
    record = await prisma.systemConfig.update({
      where: { key },
      data: { value, updated_by: userId },
    });
  } else {
    record = await prisma.systemConfig.create({
      data: {
        key,
        value,
        type: def.type,
        category: def.category,
        label: def.label,
        description: def.description,
        updated_by: userId,
      },
    });
  }

  await logAudit({
    user_id: userId,
    action: 'UPDATE_SYSTEM_CONFIG',
    entity_type: 'SystemConfig',
    entity_id: record.id,
    old_values: existing ? { key, value: existing.value } : { key, value: null },
    new_values: { key, value },
  });

  if (key.startsWith('smtp_')) {
    resetTransporter();
  }

  return getConfig(key);
}

export function getCategories(): { category: string; count: number }[] {
  const map = new Map<string, number>();
  for (const def of CONFIG_DEFINITIONS) {
    map.set(def.category, (map.get(def.category) || 0) + 1);
  }
  return Array.from(map.entries()).map(([category, count]) => ({ category, count }));
}
