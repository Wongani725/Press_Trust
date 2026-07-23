import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../../../infrastructure/database/prisma';
import { logAudit } from '../../../shared/utils/audit';

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.object({}).passthrough().optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.object({}).passthrough().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

/**
 * @openapi
 * /admin/roles:
 *   get:
 *     tags: [Users]
 *     summary: List all roles with user count
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 items:
 *                   - id: 3fa85f64-5717-4562-b3fc-2c963f66afa6
 *                     name: SuperAdmin
 *                     description: 'Full system access; user management, role assignment, system config, audit logs'
 *                     permissions: {}
 *                     status: active
 *                     user_count: 1
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-15T09:30:00.000Z
 *                   - id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b
 *                     name: Operations
 *                     description: 'Program management, beneficiary intake, onboarding, awards, documents'
 *                     permissions: {}
 *                     status: active
 *                     user_count: 3
 *                     created_at: 2026-01-15T09:30:00.000Z
 *                     updated_at: 2026-01-15T09:30:00.000Z
 *               message: Roles retrieved successfully
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
export async function listRoles(_req: Request, res: Response): Promise<void> {
  const roles = await prisma.role.findMany({
    orderBy: { created_at: 'desc' },
    include: { _count: { select: { users: true } } },
  });

  res.json({
    status: 'success',
    data: {
      items: roles.map((r: any) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        permissions: r.permissions,
        status: r.status,
        user_count: r._count.users,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    },
    message: 'Roles retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/roles:
 *   post:
 *     tags: [Users]
 *     summary: Create a new role
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RoleCreate'
 *     responses:
 *       201:
 *         description: Role created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 9d4e2c1a-8b7f-4a3d-9e6c-1f2a3b4c5d6e
 *                 name: Program Coordinator
 *                 description: Manages beneficiary onboarding for a single program
 *                 permissions: {}
 *                 status: active
 *                 created_at: 2026-07-23T09:30:00.000Z
 *               message: Role created successfully
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
 *       409:
 *         description: Role name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Role name already exists
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
 *                   - field: name
 *                     message: String must contain at least 1 character(s)
 *               message: Request validation failed
 */
export async function createRole(req: Request, res: Response): Promise<void> {
  const { name, description, permissions } = createRoleSchema.parse(req.body);

  const existing = await prisma.role.findUnique({ where: { name } });
  if (existing) {
    res.status(409).json({ status: 'error', data: null, message: 'Role name already exists' });
    return;
  }

  const role = await prisma.role.create({
    data: { name, description, permissions: (permissions ?? {}) as any, status: 'active' },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'create',
    entity_type: 'Role',
    entity_id: role.id,
    new_values: { name, description, permissions },
  });

  res.status(201).json({
    status: 'success',
    data: {
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions,
      status: role.status,
      created_at: role.created_at,
    },
    message: 'Role created successfully',
  });
}

/**
 * @openapi
 * /admin/roles/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get role details by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Role details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b
 *                 name: Operations
 *                 description: 'Program management, beneficiary intake, onboarding, awards, documents'
 *                 permissions: {}
 *                 status: active
 *                 user_count: 3
 *                 created_at: 2026-01-15T09:30:00.000Z
 *                 updated_at: 2026-01-15T09:30:00.000Z
 *               message: Role retrieved successfully
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
 */
export async function getRole(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  const r = role as any;
  res.json({
    status: 'success',
    data: {
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      status: r.status,
      user_count: r._count.users,
      created_at: r.created_at,
      updated_at: r.updated_at,
    },
    message: 'Role retrieved successfully',
  });
}

/**
 * @openapi
 * /admin/roles/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update role details
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
 *             $ref: '#/components/schemas/RoleUpdate'
 *     responses:
 *       200:
 *         description: Role updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b
 *                 name: Operations
 *                 description: 'Program management, beneficiary intake, onboarding, awards, documents'
 *                 permissions: {}
 *                 status: active
 *                 updated_at: 2026-07-23T09:30:00.000Z
 *               message: Role updated successfully
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
 *         description: Role name already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Role name already exists
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
 *                   - field: name
 *                     message: String must contain at least 1 character(s)
 *               message: Request validation failed
 */
export async function updateRole(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const body = updateRoleSchema.parse(req.body);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  if (body.name && body.name !== role.name) {
    const existing = await prisma.role.findUnique({ where: { name: body.name } });
    if (existing) {
      res.status(409).json({ status: 'error', data: null, message: 'Role name already exists' });
      return;
    }
  }

  const oldValues = { name: role.name, description: role.description, permissions: role.permissions };

  const updated = await prisma.role.update({
    where: { id },
    data: {
      name: body.name,
      description: body.description,
      permissions: body.permissions as any,
    },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'update',
    entity_type: 'Role',
    entity_id: id,
    old_values: oldValues,
    new_values: body,
  });

  res.json({
    status: 'success',
    data: {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      permissions: updated.permissions,
      status: updated.status,
      updated_at: updated.updated_at,
    },
    message: 'Role updated successfully',
  });
}

/**
 * @openapi
 * /admin/roles/{id}/status:
 *   patch:
 *     tags: [Users]
 *     summary: Activate or deactivate a role
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
 *             $ref: '#/components/schemas/RoleStatusUpdate'
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
 *                 id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b
 *                 status: inactive
 *               message: Role status updated to inactive
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
 *                     message: 'Invalid enum value. Expected ''active'' | ''inactive'', received ''suspended'''
 *               message: Request validation failed
 */
export async function updateRoleStatus(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { status } = updateStatusSchema.parse(req.body);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  const updated = await prisma.role.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'status_change',
    entity_type: 'Role',
    entity_id: id,
    old_values: { status: role.status },
    new_values: { status },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, status: updated.status },
    message: `Role status updated to ${status}`,
  });
}

/**
 * @openapi
 * /admin/roles/{id}/permissions:
 *   put:
 *     tags: [Users]
 *     summary: Update role permissions
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
 *             $ref: '#/components/schemas/RolePermissionsUpdate'
 *     responses:
 *       200:
 *         description: Permissions updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data:
 *                 id: 6c9f2e3a-1b4d-4e5f-8a6b-2d3c4e5f6a7b
 *                 permissions:
 *                   beneficiaries: [read, create, update]
 *                   disbursements: [read]
 *               message: Role permissions updated successfully
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
 *                   - field: permissions
 *                     message: Required
 *               message: Request validation failed
 */
export async function updateRolePermissions(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  const { permissions } = z.object({ permissions: z.object({}).passthrough() }).parse(req.body);

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  const oldPermissions = role.permissions;
  const updated = await prisma.role.update({
    where: { id },
    data: { permissions: permissions as any },
  });

  await logAudit({
    user_id: req.user?.userId,
    action: 'permissions_update',
    entity_type: 'Role',
    entity_id: id,
    old_values: { permissions: oldPermissions },
    new_values: { permissions },
  });

  res.json({
    status: 'success',
    data: { id: updated.id, permissions: updated.permissions },
    message: 'Role permissions updated successfully',
  });
}

/**
 * @openapi
 * /admin/roles/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a role (blocked if assigned to users)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Role deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: success
 *               data: null
 *               message: Role deleted successfully
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
 *       422:
 *         description: Cannot delete role assigned to users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               status: error
 *               data: null
 *               message: Cannot delete role assigned to users
 */
export async function deleteRole(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;

  const role = await prisma.role.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  });

  if (!role) {
    res.status(404).json({ status: 'error', data: null, message: 'Role not found' });
    return;
  }

  const r = role as any;
  if (r._count.users > 0) {
    res.status(422).json({ status: 'error', data: null, message: 'Cannot delete role assigned to users' });
    return;
  }

  await prisma.role.delete({ where: { id } });

  await logAudit({
    user_id: req.user?.userId,
    action: 'delete',
    entity_type: 'Role',
    entity_id: id,
    old_values: { name: role.name },
  });

  res.json({ status: 'success', data: null, message: 'Role deleted successfully' });
}
