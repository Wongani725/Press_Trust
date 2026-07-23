import { Request, Response } from 'express';

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
