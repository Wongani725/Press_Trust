-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SuperAdmin', 'Operations', 'Finance', 'ME', 'Auditor', 'Sponsor');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'inactive', 'blocked');

-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('Draft', 'Open', 'Closed', 'Archived');

-- CreateEnum
CREATE TYPE "BeneficiaryStatus" AS ENUM ('Imported', 'PendingOnboarding', 'Active', 'Suspended', 'Closed');

-- CreateEnum
CREATE TYPE "AwardStatus" AS ENUM ('Draft', 'Active', 'Suspended', 'Completed', 'Closed');

-- CreateEnum
CREATE TYPE "AwardType" AS ENUM ('one_off', 'recurring', 'renewable');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('Requested', 'Approved', 'Paid', 'Failed', 'Reconciled');

-- CreateEnum
CREATE TYPE "PayeeType" AS ENUM ('school', 'guardian', 'vendor');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('Pending', 'Verified', 'Rejected');

-- CreateEnum
CREATE TYPE "ProgressionStatus" AS ENUM ('Promoted', 'Repeated', 'Completed', 'Dropped');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('Open', 'InProgress', 'Closed');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('beneficiary', 'school');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'in_app');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mfa_secret" TEXT,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "role" "UserRole" NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProgram" (
    "user_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,

    CONSTRAINT "UserProgram_pkey" PRIMARY KEY ("user_id","program_id")
);

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "filters" JSONB,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportLog" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "export_type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filters" JSONB,
    "exported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_values" JSONB,
    "new_values" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProgramStatus" NOT NULL DEFAULT 'Draft',
    "application_open_date" TIMESTAMP(3),
    "application_close_date" TIMESTAMP(3),
    "budget_ceiling" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "budget_utilized" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "award_types" "AwardType"[],
    "eligibility_rules" JSONB,
    "evaluation_rubric" JSONB,
    "workflow_config" JSONB,
    "form_config" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingSource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "total_allocation" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "utilized_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'secondary',
    "district" TEXT NOT NULL,
    "location" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "registration_status" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolBankAccount" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "bank_name" TEXT NOT NULL,
    "branch" TEXT,
    "account_number" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "approval_status" TEXT NOT NULL DEFAULT 'approved',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "DisbursementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceData" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "ReferenceData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Beneficiary" (
    "id" UUID NOT NULL,
    "beneficiary_identifier" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT NOT NULL,
    "national_id" TEXT,
    "exams_id" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "district" TEXT NOT NULL,
    "school_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "status" "BeneficiaryStatus" NOT NULL DEFAULT 'Imported',
    "status_reason" TEXT,
    "academic_year" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" TEXT,
    "consent_provided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "documentable_id" UUID NOT NULL,
    "documentable_type" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'Pending',
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "expiry_date" TIMESTAMP(3),
    "virus_scan_status" TEXT NOT NULL DEFAULT 'pending',
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "funding_source_id" UUID,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance_remaining" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "award_type" "AwardType",
    "status" "AwardStatus" NOT NULL DEFAULT 'Draft',
    "status_reason" TEXT,
    "parent_award_id" UUID,
    "budget_utilization_updated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" UUID NOT NULL,
    "award_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL,
    "academic_period" TEXT NOT NULL,
    "payee_type" "PayeeType" NOT NULL,
    "payee_id" TEXT,
    "payee_name" TEXT,
    "payee_bank_account" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'Requested',
    "failure_reason" TEXT,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "reconciled_at" TIMESTAMP(3),
    "reconciled_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementEvidence" (
    "id" UUID NOT NULL,
    "disbursement_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisbursementEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicPerformance" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "academic_period" TEXT NOT NULL,
    "subjects" JSONB NOT NULL,
    "overall_score" DECIMAL(65,30),
    "attendance_percentage" DECIMAL(65,30),
    "progression" "ProgressionStatus",
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "assigned_to" UUID NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "InterventionStatus" NOT NULL DEFAULT 'Open',
    "resolution_notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtRiskFlag" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "flagged_by" UUID NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtRiskFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringVisit" (
    "id" UUID NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "findings" TEXT NOT NULL,
    "follow_up_actions" TEXT,
    "conducted_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reversal" (
    "id" UUID NOT NULL,
    "disbursement_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_type_entity_id_idx" ON "AuditLog"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_user_id_idx" ON "AuditLog"("user_id");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementItem_name_key" ON "DisbursementItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceData_type_code_key" ON "ReferenceData"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiary_beneficiary_identifier_key" ON "Beneficiary"("beneficiary_identifier");

-- CreateIndex
CREATE INDEX "Document_documentable_type_documentable_id_idx" ON "Document"("documentable_type", "documentable_id");

-- CreateIndex
CREATE INDEX "AcademicPerformance_beneficiary_id_academic_period_idx" ON "AcademicPerformance"("beneficiary_id", "academic_period");

-- CreateIndex
CREATE INDEX "Intervention_beneficiary_id_idx" ON "Intervention"("beneficiary_id");

-- CreateIndex
CREATE INDEX "Intervention_status_idx" ON "Intervention"("status");

-- CreateIndex
CREATE INDEX "AtRiskFlag_beneficiary_id_idx" ON "AtRiskFlag"("beneficiary_id");

-- CreateIndex
CREATE INDEX "MonitoringVisit_entity_type_entity_id_idx" ON "MonitoringVisit"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProgram" ADD CONSTRAINT "UserProgram_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportLog" ADD CONSTRAINT "ExportLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolBankAccount" ADD CONSTRAINT "SchoolBankAccount_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_funding_source_id_fkey" FOREIGN KEY ("funding_source_id") REFERENCES "FundingSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_parent_award_id_fkey" FOREIGN KEY ("parent_award_id") REFERENCES "Award"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_award_id_fkey" FOREIGN KEY ("award_id") REFERENCES "Award"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementEvidence" ADD CONSTRAINT "DisbursementEvidence_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "Disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementEvidence" ADD CONSTRAINT "DisbursementEvidence_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPerformance" ADD CONSTRAINT "AcademicPerformance_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPerformance" ADD CONSTRAINT "AcademicPerformance_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPerformance" ADD CONSTRAINT "AcademicPerformance_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_flagged_by_fkey" FOREIGN KEY ("flagged_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringVisit" ADD CONSTRAINT "MonitoringVisit_conducted_by_fkey" FOREIGN KEY ("conducted_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reversal" ADD CONSTRAINT "Reversal_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "Disbursement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reversal" ADD CONSTRAINT "Reversal_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
