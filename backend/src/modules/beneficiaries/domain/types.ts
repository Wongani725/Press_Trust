import { BeneficiaryStatus } from '@prisma/client';

export type CreateBeneficiaryInput = {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender: string;
  nationalId?: string;
  examsId?: string;
  contactEmail?: string;
  contactPhone?: string;
  district: string;
  schoolId: string;
  programId: string;
  academicYear?: string;
};

export type UpdateBeneficiaryInput = Partial<CreateBeneficiaryInput> & {
  status?: BeneficiaryStatus;
  statusReason?: string;
};

export type BeneficiaryResponse = {
  id: string;
  beneficiaryIdentifier: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string;
  nationalId: string | null;
  examsId: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  district: string;
  schoolId: string;
  programId: string;
  status: BeneficiaryStatus;
  statusReason: string | null;
  academicYear: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BeneficiaryStatusCount = {
  status: BeneficiaryStatus;
  count: number;
};
