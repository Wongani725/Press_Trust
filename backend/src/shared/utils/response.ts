import { Response } from 'express';

export function success<T>(res: Response, data: T, message = 'Success', statusCode = 200): void {
  res.status(statusCode).json({
    status: 'success',
    data,
    message,
  });
}

export function paginated<T>(
  res: Response,
  items: T[],
  meta: { page: number; limit: number; total: number },
  message = 'Records retrieved successfully'
): void {
  res.json({
    status: 'success',
    data: {
      items,
      meta: {
        page: meta.page,
        limit: meta.limit,
        total: meta.total,
        totalPages: Math.ceil(meta.total / meta.limit),
      },
    },
    message,
  });
}

export function error(
  res: Response,
  message: string,
  statusCode = 400,
  data?: unknown
): void {
  res.status(statusCode).json({
    status: 'error',
    data: data ?? null,
    message,
  });
}
