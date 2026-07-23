import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { hashPassword } from '../../../modules/users/domain/password.service';
import { logAudit } from '../../../shared/utils/audit';
import { parsePagination, buildMeta } from '../../../shared/utils/pagination';

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role_id: z.string().uuid(),
  phone: z.string().optional(),
  programIds: z.array(z.string().uuid()).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role_id: z.string().uuid().optional(),
  phone: z.string().optional(),
  programIds: z.array(z.string().uuid()).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'blocked']),
  reason: z.string().optional(),
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     tags: [Users]
 *     summary: List users with pagination and filters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated list of users
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     name: Operations Manager
 *                     email: operations@presstrust.mw
 *                     role: { id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b, name: Operations }
 *                     phone: '+265991234567'
 *                     status: active
 *                     mfa_enabled: true
 *                     failed_login_attempts: 0
 *                     locked_until: null
 *                     last_login: 2026-07-22T07:15:00.000Z
 *                     programs: [9d4e2c1a-8b7f-4a3d-9e6c-1f2a3b4c5d6e]
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-07-22T07:15:00.000Z
 *                   - id: 6f5e4d3c-2b1a-4c9d-8e7f-0a1b2c3d4e5f
 *                     name: Finance Officer
 *                     email: finance@presstrust.mw
 *                     role: { id: 7d8e9f0a-2b3c-4d5e-9f0a-1b2c3d4e5f6a, name: Finance }
 *                     phone: '+265992345678'
 *                     status: active
 *                     mfa_enabled: false
 *                     failed_login_attempts: 0
 *                     locked_until: null
 *                     last_login: 2026-07-21T14:00:00.000Z
 *                     programs: []
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-07-21T14:00:00.000Z
 *                 meta: { page: 1, limit: 20, total: 2, totalPages: 1 }
 *               message: Users retrieved successfully
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
export async function listUsers(req: Request, res: Response): Promise<void> {
  const { page, limit, skip } = parsePagination(req.query);
  const roleId = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const q = req.query.q as string | undefined;

  const where: Record<string, unknown> = {};
  if (roleId) where.role_id = roleId;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { role: { select: { id: true, name: true } }, programs: { select: { program_id: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const data = users.map((u: any) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    status: u.status,
    mfa_enabled: u.mfa_enabled,
    failed_login_attempts: u.failed_login_attempts,
    locked_until: u.locked_until,
    last_login: u.last_login,
    programs: u.programs.map((p: any) => p.program_id),
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));

  res.json({
    status: 'success',
    data: { items: data, meta: buildMeta(total, { page, limit, skip }) },
    message: 'Users retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a new internal user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserCreate'
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: New Program Officer
 *                 email: newofficer@presstrust.mw
 *                 role: { id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b, name: Operations }
 *                 phone: '+265991112233'
 *                 status: active
 *                 programs: [9d4e2c1a-8b7f-4a3d-9e6c-1f2a3b4c5d6e]
 *                 created_at: 2026-07-23T09:30:00.000Z
 *               message: User created successfully
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
 *         description: Role not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Role not found
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Email already in use
 *       422:
 *         description: Request validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 details:
 *                   - field: email
 *                     message: Invalid email
 *                   - field: password
 *                     message: String must contain at least 8 character(s)
 *               message: Request validation failed
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  const { name, email, password, role_id, phone, programIds } = createUserSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ status: 'error', data: null, message: 'Email already in use' });
    return;
  }

  const role = await prisma.role.findUnique({ where: { id: role_id } });
  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password_hash,
      role_id,
      role_name: role.name as any,
      phone,
      status: 'active',
      mfa_enabled: false,
      programs: programIds ? { create: programIds.map((program_id: string) => ({ program_id })) } : undefined,
    },
    include: { role: { select: { id: true, name: true } }, programs: { select: { program_id: true } } },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'User',
    entity_id: user.id,
    new_values: { name, email, role_id, phone, programIds },
  });

  const u = user as any;
  res.status(201).json({
    status: 'success',
    data: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      programs: u.programs.map((p: any) => p.program_id),
      created_at: u.created_at,
    },
    message: 'User created successfully',
  });
}

/**
 * @openapi
 * /admin/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user details by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Operations Manager
 *                 email: operations@presstrust.mw
 *                 role: { id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b, name: Operations }
 *                 phone: '+265991234567'
 *                 status: active
 *                 mfa_enabled: true
 *                 failed_login_attempts: 0
 *                 locked_until: null
 *                 last_login: 2026-07-22T07:15:00.000Z
 *                 programs:
 *                   - id: 9d4e2c1a-8b7f-4a3d-9e6c-1f2a3b4c5d6e
 *                     name: Press Trust Secondary School Scholarship 2026
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-07-22T07:15:00.000Z
 *               message: User retrieved successfully
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: User not found
 */
export async function getUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({
    where: { id },
    include: { role: { select: { id: true, name: true } }, programs: { include: { program: { select: { id: true, name: true } } } } },
  });

  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const u = user as any;
  res.json({
    status: 'success',
    data: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      mfa_enabled: u.mfa_enabled,
      failed_login_attempts: u.failed_login_attempts,
      locked_until: u.locked_until,
      last_login: u.last_login,
      programs: u.programs.map((p: any) => ({ id: p.program.id, name: p.program.name })),
      created_at: u.created_at,
      updated_at: u.updated_at,
    },
    message: 'User retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update user details
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdate'
 *     responses:
 *       200:
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 name: Operations Manager
 *                 email: operations@presstrust.mw
 *                 role: { id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b, name: Operations }
 *                 phone: '+265991234567'
 *                 status: active
 *                 updated_at: 2026-07-23T09:30:00.000Z
 *               message: User updated successfully
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
 *         description: User or role not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: User not found
 *       409:
 *         description: Email already in use
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Email already in use
 *       422:
 *         description: Request validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 details:
 *                   - field: email
 *                     message: Invalid email
 *               message: Request validation failed
 */
export async function updateUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateUserSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  if (body.email && body.email !== user.email) {
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      res.status(409).json({ status: 'error', data: null, message: 'Email already in use' });
      return;
    }
  }

  if (body.role_id) {
    const role = await prisma.role.findUnique({ where: { id: body.role_id } });
    if (!role) {
      res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
      return;
    }
  }

  const oldValues = { name: user.name, email: user.email, role_id: user.role_id, phone: user.phone };

  const updateData: Record<string, unknown> = {};
  if (body.name) updateData.name = body.name;
  if (body.email) updateData.email = body.email;
  if (body.role_id) {
    updateData.role_id = body.role_id;
    const role = await prisma.role.findUnique({ where: { id: body.role_id } });
    if (role) updateData.role_name = role.name;
  }
  if (body.phone !== undefined) updateData.phone = body.phone;

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    include: { role: { select: { id: true, name: true } } },
  });

  if (body.programIds) {
    await prisma.userProgram.deleteMany({ where: { user_id: id } });
    if (body.programIds.length > 0) {
      await prisma.userProgram.createMany({
        data: body.programIds.map((program_id: string) => ({ user_id: id, program_id })),
      });
    }
  }

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'User',
    entity_id: id,
    old_values: oldValues,
    new_values: updateData,
  });

  const u = updated as any;
  res.json({
    status: 'success',
    data: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      phone: u.phone,
      status: u.status,
      updated_at: u.updated_at,
    },
    message: 'User updated successfully',
  });
}

/**
 * @openapi
 * /admin/users/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Update user status (active/inactive/blocked)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserStatusUpdate'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 status: blocked
 *               message: User status updated to blocked
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: User not found
 *       422:
 *         description: Request validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data:
 *                 details:
 *                   - field: status
 *                     message: 'Invalid enum value. Expected ''active'' | ''inactive'' | ''blocked'', received ''suspended'''
 *               message: Request validation failed
 */
export async function updateUserStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status, reason } = updateStatusSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const oldStatus = user.status;
  const updated = await prisma.user.update({
    where: { id },
    data: { status, locked_until: status === 'blocked' ? user.locked_until : null },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'User',
    entity_id: id,
    old_values: { status: oldStatus },
    new_values: { status, reason },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
    message: `User status updated to ${status}`,
  });
}

/**
 * @openapi
 * /admin/users/{id}/unlock:
 *   post:
 *     tags: [Users]
 *     summary: Unlock a locked user account
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Account unlocked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 unlocked: true
 *               message: User account unlocked successfully
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: User not found
 */
export async function unlockUser(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { failed_login_attempts: 0, locked_until: null },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'unlock',
    entity_type: 'User',
    entity_id: id,
    old_values: { failed_login_attempts: user.failed_login_attempts, locked_until: user.locked_until },
    new_values: { failed_login_attempts: 0, locked_until: null },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, unlocked: true },
    message: 'User account unlocked successfully',
  });
}

/**
 * @openapi
 * /admin/users/{id}/mfa/reset:
 *   post:
 *     tags: [Users]
 *     summary: Reset user MFA secret and disable MFA
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: MFA reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                 mfa_enabled: false
 *               message: User MFA reset successfully
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
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: User not found
 */
export async function resetUserMfa(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    res.status(404).json({ status: 'error', data: null, message: 'User not found' });
    return;
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { mfa_secret: null, mfa_enabled: false },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'mfa_reset',
    entity_type: 'User',
    entity_id: id,
    old_values: { mfa_enabled: user.mfa_enabled },
    new_values: { mfa_enabled: false },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, mfa_enabled: false },
    message: 'User MFA reset successfully',
  });
}
