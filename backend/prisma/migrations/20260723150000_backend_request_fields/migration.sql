-- AlterTable
ALTER TABLE "Program" ADD COLUMN "required_documents" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Beneficiary" ADD COLUMN "termination_reason" TEXT,
ADD COLUMN "termination_recommended_by" UUID,
ADD COLUMN "termination_recommended_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AtRiskFlag" ADD COLUMN "warning_issued" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "warning_reason" TEXT,
ADD COLUMN "warning_at" TIMESTAMP(3),
ADD COLUMN "warning_by" UUID;

-- CreateTable
CREATE TABLE "ProgramFundingSource" (
    "program_id" UUID NOT NULL,
    "funding_source_id" UUID NOT NULL,

    CONSTRAINT "ProgramFundingSource_pkey" PRIMARY KEY ("program_id","funding_source_id")
);

-- AddForeignKey
ALTER TABLE "ProgramFundingSource" ADD CONSTRAINT "ProgramFundingSource_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramFundingSource" ADD CONSTRAINT "ProgramFundingSource_funding_source_id_fkey" FOREIGN KEY ("funding_source_id") REFERENCES "FundingSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Beneficiary" ADD CONSTRAINT "Beneficiary_termination_recommended_by_fkey" FOREIGN KEY ("termination_recommended_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtRiskFlag" ADD CONSTRAINT "AtRiskFlag_warning_by_fkey" FOREIGN KEY ("warning_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
