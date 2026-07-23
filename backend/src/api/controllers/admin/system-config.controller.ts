import { Request, Response } from 'express';
import { z } from 'zod';
import { getAllConfigs, getConfig, updateConfig, getCategories } from '../../../modules/system-config';

const updateSchema = z.object({
  value: z.string().nullable(),
});

export async function listConfigs(req: Request, res: Response): Promise<void> {
  const configs = await getAllConfigs();
  res.json({ status: 'success', data: { items: configs }, message: 'System configuration retrieved successfully' });
}

export async function getConfigByKey(req: Request, res: Response): Promise<void> {
  const entry = await getConfig(req.params.key);
  if (!entry) {
    res.status(404).json({ status: 'error', data: null, message: 'Unknown configuration key' });
    return;
  }
  res.json({ status: 'success', data: entry, message: 'Configuration value retrieved successfully' });
}

export async function updateConfigByKey(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);

  const entry = await updateConfig(req.params.key, body.value, req.user!.userId);
  if (!entry) {
    res.status(404).json({ status: 'error', data: null, message: 'Unknown configuration key' });
    return;
  }

  res.json({ status: 'success', data: entry, message: 'Configuration updated successfully' });
}

export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = getCategories();
  res.json({ status: 'success', data: { categories }, message: 'Configuration categories retrieved successfully' });
}
