import { ProgramStatus, AwardType } from '@prisma/client';

export type CreateProgramInput = {
  name: string;
  description?: string;
  applicationOpenDate?: string;
  applicationCloseDate?: string;
  budgetCeiling?: number;
  awardTypes?: AwardType[];
  eligibilityRules?: Record<string, unknown>;
  evaluationRubric?: Record<string, unknown>;
  workflowConfig?: Record<string, unknown>;
  formConfig?: Record<string, unknown>;
};

export type UpdateProgramInput = Partial<CreateProgramInput> & {
  status?: ProgramStatus;
};

export type ProgramResponse = {
  id: string;
  name: string;
  description: string | null;
  status: ProgramStatus;
  applicationOpenDate: Date | null;
  applicationCloseDate: Date | null;
  budgetCeiling: number;
  budgetUtilized: number;
  awardTypes: AwardType[];
  eligibilityRules: Record<string, unknown> | null;
  evaluationRubric: Record<string, unknown> | null;
  workflowConfig: Record<string, unknown> | null;
  formConfig: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};
