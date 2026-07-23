import { DisbursementStatus, PayeeType } from '@prisma/client';

export type CreateDisbursementInput = {
  awardId: string;
  amount: number;
  category: string;
  academicPeriod: string;
  payeeType: PayeeType;
  payeeId?: string;
  payeeName?: string;
  payeeBankAccount?: string;
  notes?: string;
};

export type CreateBatchDisbursementInput = {
  disbursements: CreateDisbursementInput[];
};

export type DisbursementResponse = {
  id: string;
  awardId: string;
  beneficiaryId: string;
  programId: string;
  amount: number;
  category: string;
  academicPeriod: string;
  payeeType: PayeeType;
  payeeId: string | null;
  payeeName: string | null;
  payeeBankAccount: string | null;
  status: DisbursementStatus;
  failureReason: string | null;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  reconciledAt: Date | null;
  reconciledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};
