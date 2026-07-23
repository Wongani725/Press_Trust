-- CreateEnum
CREATE TYPE "OutcomeType" AS ENUM ('Completion', 'Graduation', 'Exit');

-- CreateTable
CREATE TABLE "Outcome" (
    "id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "outcome_type" "OutcomeType" NOT NULL,
    "outcome_date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outcome_beneficiary_id_idx" ON "Outcome"("beneficiary_id");

-- CreateIndex
CREATE INDEX "Outcome_program_id_idx" ON "Outcome"("program_id");

-- CreateIndex
CREATE INDEX "Outcome_outcome_type_idx" ON "Outcome"("outcome_type");

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_beneficiary_id_fkey" FOREIGN KEY ("beneficiary_id") REFERENCES "Beneficiary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
