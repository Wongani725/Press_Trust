import { Request, Response } from 'express';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    status: 'error',
    data: null,
    message: `Route ${req.method} ${req.path} not found`,
  });
}
