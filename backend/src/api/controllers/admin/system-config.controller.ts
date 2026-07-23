import { Request, Response } from 'express';
import { z } from 'zod';
import { getAllConfigs, getConfig, updateConfig, getCategories } from '../../../modules/system-config';

const updateSchema = z.object({
  value: z.string().nullable(),
});

/**
 * @openapi
 * /admin/system-config:
 *   get:
 *     tags: [System]
 *     summary: List all system configuration entries
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System configuration entries
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - key: smtp_host
 *                     label: SMTP Host
 *                     type: string
 *                     category: smtp
 *                     description: SMTP server hostname
 *                     value: smtp.presstrust.mw
 *                     isOverridden: true
 *                     updatedAt: '2026-01-10T09:00:00.000Z'
 *                   - key: lockout_threshold
 *                     label: Account Lockout Threshold
 *                     type: number
 *                     category: security
 *                     description: Failed login attempts before lockout
 *                     value: '5'
 *                     isOverridden: false
 *                     updatedAt: null
 *               message: System configuration retrieved successfully
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
export async function listConfigs(req: Request, res: Response): Promise<void> {
  const configs = await getAllConfigs();
  res.json({ status: 'success', data: { items: configs }, message: 'System configuration retrieved successfully' });
}

/**
 * @openapi
 * /admin/system-config/{key}:
 *   get:
 *     tags: [System]
 *     summary: Get a single system configuration entry by key
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         example: smtp_host
 *     responses:
 *       200:
 *         description: Configuration entry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 key: smtp_host
 *                 label: SMTP Host
 *                 type: string
 *                 category: smtp
 *                 description: SMTP server hostname
 *                 value: smtp.presstrust.mw
 *                 isOverridden: true
 *                 updatedAt: '2026-01-10T09:00:00.000Z'
 *               message: Configuration value retrieved successfully
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
 *         description: Unknown configuration key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Unknown configuration key
 */
export async function getConfigByKey(req: Request, res: Response): Promise<void> {
  const entry = await getConfig(req.params.key);
  if (!entry) {
    res.status(404).json({ status: 'error', data: null, message: 'Unknown configuration key' });
    return;
  }
  res.json({ status: 'success', data: entry, message: 'Configuration value retrieved successfully' });
}

/**
 * @openapi
 * /admin/system-config/{key}:
 *   put:
 *     tags: [System]
 *     summary: Update the value of a system configuration entry
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *         example: smtp_host
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [value]
 *             properties:
 *               value: { type: string, nullable: true }
 *           example:
 *             value: smtp.newhost.mw
 *     responses:
 *       200:
 *         description: Configuration updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 key: smtp_host
 *                 label: SMTP Host
 *                 type: string
 *                 category: smtp
 *                 description: SMTP server hostname
 *                 value: smtp.newhost.mw
 *                 isOverridden: true
 *                 updatedAt: '2026-01-20T14:00:00.000Z'
 *               message: Configuration updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Validation error
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
 *         description: Unknown configuration key
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Unknown configuration key
 */
export async function updateConfigByKey(req: Request, res: Response): Promise<void> {
  const body = updateSchema.parse(req.body);

  const entry = await updateConfig(req.params.key, body.value, req.user!.userId);
  if (!entry) {
    res.status(404).json({ status: 'error', data: null, message: 'Unknown configuration key' });
    return;
  }

  res.json({ status: 'success', data: entry, message: 'Configuration updated successfully' });
}

/**
 * @openapi
 * /admin/system-config/categories:
 *   get:
 *     tags: [System]
 *     summary: List distinct system configuration categories and entry counts
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Configuration categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 categories:
 *                   - category: smtp
 *                     count: 6
 *                   - category: security
 *                     count: 3
 *                   - category: upload
 *                     count: 1
 *                   - category: retention
 *                     count: 3
 *               message: Configuration categories retrieved successfully
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
export async function listCategories(_req: Request, res: Response): Promise<void> {
  const categories = getCategories();
  res.json({ status: 'success', data: { categories }, message: 'Configuration categories retrieved successfully' });
}
