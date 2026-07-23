export type CreateSchoolInput = {
  name: string;
  type?: string;
  district: string;
  location?: string;
  contactPhone?: string;
  contactEmail?: string;
  registrationStatus?: string;
};

export type UpdateSchoolInput = Partial<CreateSchoolInput> & {
  status?: string;
};

export type SchoolResponse = {
  id: string;
  name: string;
  type: string;
  district: string;
  location: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  registrationStatus: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};
