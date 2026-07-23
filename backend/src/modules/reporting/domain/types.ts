export type ReportDefinitionResponse = {
  id: string;
  name: string;
  fields: Record<string, unknown>;
  filters: Record<string, unknown> | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};
