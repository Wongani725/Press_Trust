import { AwardStatus, AwardType } from '@prisma/client';

export type CreateAwardInput = {
  beneficiaryId: string;
  programId: string;
  fundingSourceId?: string;
  amount: number;
  startDate?: string;
  endDate?: string;
  awardType?: AwardType;
};

export type UpdateAwardInput = Partial<CreateAwardInput> & {
  status?: AwardStatus;
  statusReason?: string;
};

export type AwardResponse = {
  id: string;
  beneficiaryId: string;
  programId: string;
  fundingSourceId: string | null;
  amount: number;
  balanceRemaining: number;
  startDate: string | null;
  endDate: string | null;
  awardType: AwardType | null;
  status: AwardStatus;
  statusReason: string | null;
  parentAwardId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
