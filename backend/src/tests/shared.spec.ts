import { describe, it, expect, vi } from 'vitest';
import { success, paginated, error } from '../shared/utils/response';
import { parsePagination, buildMeta } from '../shared/utils/pagination';

describe('Response Helpers', () => {
  it('should return success response with data', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    success(res, { message: 'ok' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { message: 'ok' }, message: 'Success' });
  });

  it('should return success response with custom status code', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    success(res, { id: '1' }, 'Created', 201);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ status: 'success', data: { id: '1' }, message: 'Created' });
  });

  it('should return paginated response with meta', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const data = [{ id: '1' }, { id: '2' }];
    paginated(res, data, { page: 1, limit: 20, total: 50 });

    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      data: {
        items: data,
        meta: { page: 1, limit: 20, total: 50, totalPages: 3 },
      },
      message: 'Records retrieved successfully',
    });
  });

  it('should return error response', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    error(res, 'Resource not found', 404);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Resource not found',
    });
  });

  it('should return error response with details', () => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    error(res, 'Invalid input', 422, { details: [{ field: 'email', message: 'Invalid email' }] });

    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: { details: [{ field: 'email', message: 'Invalid email' }] },
      message: 'Invalid input',
    });
  });
});

describe('Pagination Utility', () => {
  it('should return defaults when no query params', () => {
    const result = parsePagination({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.skip).toBe(0);
  });

  it('should parse page and limit from query', () => {
    const result = parsePagination({ page: '3', limit: '10' });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.skip).toBe(20);
  });

  it('should enforce max limit of 100', () => {
    const result = parsePagination({ limit: '500' });
    expect(result.limit).toBe(100);
  });

  it('should enforce minimum page of 1', () => {
    const result = parsePagination({ page: '0' });
    expect(result.page).toBe(1);
  });

  it('should build correct meta', () => {
    const meta = buildMeta(100, { page: 2, limit: 20, skip: 20 });
    expect(meta.totalPages).toBe(5);
    expect(meta.total).toBe(100);
    expect(meta.page).toBe(2);
  });

  it('should handle zero total', () => {
    const meta = buildMeta(0, { page: 1, limit: 20, skip: 0 });
    expect(meta.totalPages).toBe(0);
  });
});

describe('Error Middleware', () => {
  it('should return 500 for unhandled errors', async () => {
    const { errorHandler } = await import('../api/middleware/error.middleware');

    const err = new Error('Something broke');
    const req = { method: 'GET', path: '/test' } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'An unexpected error occurred',
    });
  });
});

describe('Not Found Middleware', () => {
  it('should return 404 for unknown routes', async () => {
    const { notFoundHandler } = await import('../api/middleware/not-found.middleware');

    const req = { method: 'GET', path: '/unknown' } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      data: null,
      message: 'Route GET /unknown not found',
    });
  });
});
