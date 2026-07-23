import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        data: null,
        message: 'Authentication required',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({
        status: 'error',
        data: null,
        message: 'Insufficient permissions',
      });
      return;
    }

    next();
  };
}
