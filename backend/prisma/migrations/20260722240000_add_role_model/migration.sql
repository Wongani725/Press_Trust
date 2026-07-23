-- Create Role table
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- Unique index on role name
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- Add nullable role_id and role_name to User
ALTER TABLE "User" ADD COLUMN "role_id" UUID;
ALTER TABLE "User" ADD COLUMN "role_name" "UserRole";

-- Insert default roles
INSERT INTO "Role" ("id", "name", "description", "permissions", "status", "created_at", "updated_at")
VALUES
    (gen_random_uuid(), 'SuperAdmin', 'Full system access; user management, role assignment, system config, audit logs', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Operations', 'Program management, beneficiary intake, onboarding, awards, documents', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Finance', 'Disbursement creation and approval, reconciliation, financial reports, bank accounts', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'ME', 'Academic performance, at-risk flags, interventions, monitoring visits, outcomes', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Auditor', 'Read-only access to all records, audit logs, export logs', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    (gen_random_uuid(), 'Sponsor', 'View-only access to program portfolio and approved reports', '{}', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Update existing users: set role_id from matching role name
UPDATE "User"
SET "role_id" = (SELECT "id" FROM "Role" WHERE "Role"."name" = "User"."role"::text),
    "role_name" = "User"."role";

-- Make role_id and role_name required
ALTER TABLE "User" ALTER COLUMN "role_id" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "role_name" SET NOT NULL;

-- Add foreign key from User to Role
ALTER TABLE "User" ADD CONSTRAINT "User_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old role column
ALTER TABLE "User" DROP COLUMN "role";
