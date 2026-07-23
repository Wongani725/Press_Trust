import prisma from '../../infrastructure/database/prisma';

export async function logAudit(params: {
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values?: unknown;
  new_values?: unknown;
  ip_address?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      user_id: params.user_id ?? null,
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      old_values: params.old_values ? JSON.parse(JSON.stringify(params.old_values)) : null,
      new_values: params.new_values ? JSON.parse(JSON.stringify(params.new_values)) : null,
      ip_address: params.ip_address ?? null,
    },
  });
}
