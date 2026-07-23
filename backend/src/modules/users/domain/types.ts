import { UserRole, UserStatus } from '@prisma/client';

export type CreateUserInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
  programIds?: string[];
};

export type UpdateUserInput = {
  name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
};

export type UserResponse = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  status: UserStatus;
  lastLogin: Date | null;
  programIds: string[];
  createdAt: Date;
  updatedAt: Date;
};
