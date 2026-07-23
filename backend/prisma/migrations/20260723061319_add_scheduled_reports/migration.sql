/*
  Warnings:

  - Added the required column `source` to the `ReportDefinition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ReportDefinition" ADD COLUMN     "description" TEXT,
ADD COLUMN     "sort_by" TEXT,
ADD COLUMN     "sort_order" TEXT DEFAULT 'desc',
ADD COLUMN     "source" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ScheduledReport" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "cron_expression" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "recipients" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRunLog" (
    "id" UUID NOT NULL,
    "schedule_id" UUID,
    "report_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "error_message" TEXT,
    "file_url" TEXT,
    "row_count" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "triggered_by" TEXT NOT NULL,

    CONSTRAINT "ReportRunLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "ReportDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledReport" ADD CONSTRAINT "ScheduledReport_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRunLog" ADD CONSTRAINT "ReportRunLog_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "ScheduledReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRunLog" ADD CONSTRAINT "ReportRunLog_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "ReportDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
