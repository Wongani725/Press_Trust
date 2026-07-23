-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfa_method" TEXT NOT NULL DEFAULT 'totp';

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_user_id_idx" ON "OtpCode"("user_id");

-- CreateIndex
CREATE INDEX "OtpCode_expires_at_idx" ON "OtpCode"("expires_at");

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
