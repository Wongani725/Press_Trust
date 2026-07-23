import { InterventionStatus, ProgressionStatus } from '@prisma/client';

export type AcademicPerformanceResponse = {
  id: string;
  beneficiaryId: string;
  schoolId: string;
  academicPeriod: string;
  subjects: Record<string, unknown>;
  overallScore: number | null;
  attendancePercentage: number | null;
  progression: ProgressionStatus | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type InterventionResponse = {
  id: string;
  beneficiaryId: string;
  action: string;
  assignedTo: string;
  dueDate: string;
  status: InterventionStatus;
  resolutionNotes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AtRiskFlagResponse = {
  id: string;
  beneficiaryId: string;
  reason: string;
  flaggedBy: string;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: Date;
};

export type MonitoringVisitResponse = {
  id: string;
  entityType: string;
  entityId: string;
  visitDate: string;
  findings: string;
  followUpActions: string | null;
  conductedBy: string;
  createdAt: Date;
  updatedAt: Date;
};
