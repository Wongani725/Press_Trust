import { Request, Response } from 'express';

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check endpoint
 *     description: Public endpoint used by load balancers and uptime monitors to verify the service is running. Requires no authentication.
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 status: ok
 *                 timestamp: 2026-07-23T09:15:42.123Z
 *                 uptime: 86412.53
 *               message: Service is healthy
 */
export function getHealth(req: Request, res: Response): void {
  res.status(200).json({
    status: 'success',
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
    message: 'Service is healthy',
  });
}
