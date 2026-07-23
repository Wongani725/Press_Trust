import { describe, it, expect } from 'vitest';

describe('Prisma Schema Validation', () => {
  it('should have all required enums defined in Prisma client', () => {
    const prisma = require('@prisma/client');

    const expectedEnums = [
      'UserRole',
      'UserStatus',
      'ProgramStatus',
      'BeneficiaryStatus',
      'AwardStatus',
      'AwardType',
      'DisbursementStatus',
      'PayeeType',
      'DocumentStatus',
      'ProgressionStatus',
      'InterventionStatus',
      'EntityType',
      'NotificationChannel',
    ];

    expectedEnums.forEach((enumName) => {
      expect(prisma[enumName]).toBeDefined();
    });
  });

  it('should have correct OutcomeType enum values', () => {
    const { OutcomeType } = require('@prisma/client');
    expect(OutcomeType.Completion).toBe('Completion');
    expect(OutcomeType.Graduation).toBe('Graduation');
    expect(OutcomeType.Exit).toBe('Exit');
  });

  it('should have correct UserRole enum values', () => {
    const { UserRole } = require('@prisma/client');
    expect(UserRole.SuperAdmin).toBe('SuperAdmin');
    expect(UserRole.Operations).toBe('Operations');
    expect(UserRole.Finance).toBe('Finance');
    expect(UserRole.ME).toBe('ME');
    expect(UserRole.Auditor).toBe('Auditor');
    expect(UserRole.Sponsor).toBe('Sponsor');
  });

  it('should have correct UserStatus enum values', () => {
    const { UserStatus } = require('@prisma/client');
    expect(UserStatus.active).toBe('active');
    expect(UserStatus.inactive).toBe('inactive');
    expect(UserStatus.blocked).toBe('blocked');
  });

  it('should have correct ProgramStatus enum values', () => {
    const { ProgramStatus } = require('@prisma/client');
    expect(ProgramStatus.Draft).toBe('Draft');
    expect(ProgramStatus.Open).toBe('Open');
    expect(ProgramStatus.Closed).toBe('Closed');
    expect(ProgramStatus.Archived).toBe('Archived');
  });

  it('should have correct BeneficiaryStatus enum values', () => {
    const { BeneficiaryStatus } = require('@prisma/client');
    expect(BeneficiaryStatus.Imported).toBe('Imported');
    expect(BeneficiaryStatus.PendingOnboarding).toBe('PendingOnboarding');
    expect(BeneficiaryStatus.Active).toBe('Active');
    expect(BeneficiaryStatus.Suspended).toBe('Suspended');
    expect(BeneficiaryStatus.Closed).toBe('Closed');
  });

  it('should have correct AwardStatus enum values', () => {
    const { AwardStatus } = require('@prisma/client');
    expect(AwardStatus.Draft).toBe('Draft');
    expect(AwardStatus.Active).toBe('Active');
    expect(AwardStatus.Suspended).toBe('Suspended');
    expect(AwardStatus.Completed).toBe('Completed');
    expect(AwardStatus.Closed).toBe('Closed');
  });

  it('should have correct DisbursementStatus enum values', () => {
    const { DisbursementStatus } = require('@prisma/client');
    expect(DisbursementStatus.Requested).toBe('Requested');
    expect(DisbursementStatus.Approved).toBe('Approved');
    expect(DisbursementStatus.Paid).toBe('Paid');
    expect(DisbursementStatus.Failed).toBe('Failed');
    expect(DisbursementStatus.Reconciled).toBe('Reconciled');
  });

  it('should have all remaining enum values correct', () => {
    const prisma = require('@prisma/client');

    expect(prisma.AwardType.one_off).toBe('one_off');
    expect(prisma.AwardType.recurring).toBe('recurring');
    expect(prisma.AwardType.renewable).toBe('renewable');

    expect(prisma.PayeeType.school).toBe('school');
    expect(prisma.PayeeType.guardian).toBe('guardian');
    expect(prisma.PayeeType.vendor).toBe('vendor');

    expect(prisma.DocumentStatus.Pending).toBe('Pending');
    expect(prisma.DocumentStatus.Verified).toBe('Verified');
    expect(prisma.DocumentStatus.Rejected).toBe('Rejected');

    expect(prisma.ProgressionStatus.Promoted).toBe('Promoted');
    expect(prisma.ProgressionStatus.Repeated).toBe('Repeated');
    expect(prisma.ProgressionStatus.Completed).toBe('Completed');
    expect(prisma.ProgressionStatus.Dropped).toBe('Dropped');

    expect(prisma.InterventionStatus.Open).toBe('Open');
    expect(prisma.InterventionStatus.InProgress).toBe('InProgress');
    expect(prisma.InterventionStatus.Closed).toBe('Closed');

    expect(prisma.EntityType.beneficiary).toBe('beneficiary');
    expect(prisma.EntityType.school).toBe('school');

    expect(prisma.NotificationChannel.email).toBe('email');
    expect(prisma.NotificationChannel.in_app).toBe('in_app');
  });

  it('should have all master data models registered in Prisma client', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.Program).toBe('Program');
    expect(ModelName.FundingSource).toBe('FundingSource');
    expect(ModelName.School).toBe('School');
    expect(ModelName.SchoolBankAccount).toBe('SchoolBankAccount');
    expect(ModelName.DisbursementItem).toBe('DisbursementItem');
    expect(ModelName.ReferenceData).toBe('ReferenceData');
  });

  it('should have Program scalar fields including JSON config fields', () => {
    const { ProgramScalarFieldEnum } = require('@prisma/client');

    expect(ProgramScalarFieldEnum.eligibility_rules).toBe('eligibility_rules');
    expect(ProgramScalarFieldEnum.evaluation_rubric).toBe('evaluation_rubric');
    expect(ProgramScalarFieldEnum.workflow_config).toBe('workflow_config');
    expect(ProgramScalarFieldEnum.form_config).toBe('form_config');
    expect(ProgramScalarFieldEnum.budget_ceiling).toBe('budget_ceiling');
  });

  it('should have SchoolBankAccount with approval_status field', () => {
    const { SchoolBankAccountScalarFieldEnum } = require('@prisma/client');

    expect(SchoolBankAccountScalarFieldEnum.approval_status).toBe('approval_status');
    expect(SchoolBankAccountScalarFieldEnum.account_number).toBe('account_number');
  });

  it('should have ReferenceData with compound unique constraint fields', () => {
    const { ReferenceDataScalarFieldEnum } = require('@prisma/client');

    expect(ReferenceDataScalarFieldEnum.type).toBe('type');
    expect(ReferenceDataScalarFieldEnum.code).toBe('code');
  });

  it( 'should have beneficiary lifecycle models in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.Beneficiary).toBe('Beneficiary');
    expect(ModelName.Guardian).toBe('Guardian');
    expect(ModelName.Document).toBe('Document');
  });

  it('should have Beneficiary with correct scalar fields', () => {
    const { BeneficiaryScalarFieldEnum } = require('@prisma/client');

    expect(BeneficiaryScalarFieldEnum.beneficiary_identifier).toBe('beneficiary_identifier');
    expect(BeneficiaryScalarFieldEnum.first_name).toBe('first_name');
    expect(BeneficiaryScalarFieldEnum.status).toBe('status');
  });

  it('should have Guardian linked to Beneficiary', () => {
    const { GuardianScalarFieldEnum } = require('@prisma/client');

    expect(GuardianScalarFieldEnum.beneficiary_id).toBe('beneficiary_id');
    expect(GuardianScalarFieldEnum.name).toBe('name');
    expect(GuardianScalarFieldEnum.relationship).toBe('relationship');
  });

  it('should have Document polymorphic fields and versioning', () => {
    const { DocumentScalarFieldEnum } = require('@prisma/client');

    expect(DocumentScalarFieldEnum.documentable_type).toBe('documentable_type');
    expect(DocumentScalarFieldEnum.documentable_id).toBe('documentable_id');
    expect(DocumentScalarFieldEnum.version).toBe('version');
    expect(DocumentScalarFieldEnum.status).toBe('status');
  });

  it('should have Award with full fields including beneficiary and renewal', () => {
    const { AwardScalarFieldEnum, ModelName } = require('@prisma/client');

    expect(ModelName.Award).toBe('Award');
    expect(AwardScalarFieldEnum.beneficiary_id).toBe('beneficiary_id');
    expect(AwardScalarFieldEnum.balance_remaining).toBe('balance_remaining');
    expect(AwardScalarFieldEnum.parent_award_id).toBe('parent_award_id');
    expect(AwardScalarFieldEnum.award_type).toBe('award_type');
    expect(AwardScalarFieldEnum.budget_utilization_updated).toBe('budget_utilization_updated');
  });

  it('should have financial tracking models in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.Disbursement).toBe('Disbursement');
    expect(ModelName.DisbursementEvidence).toBe('DisbursementEvidence');
    expect(ModelName.Reversal).toBe('Reversal');
  });

  it('should have Disbursement with full approval trail fields', () => {
    const { DisbursementScalarFieldEnum } = require('@prisma/client');

    expect(DisbursementScalarFieldEnum.created_by).toBe('created_by');
    expect(DisbursementScalarFieldEnum.approved_by).toBe('approved_by');
    expect(DisbursementScalarFieldEnum.approved_at).toBe('approved_at');
    expect(DisbursementScalarFieldEnum.paid_at).toBe('paid_at');
    expect(DisbursementScalarFieldEnum.reconciled_at).toBe('reconciled_at');
    expect(DisbursementScalarFieldEnum.reconciled_by).toBe('reconciled_by');
    expect(DisbursementScalarFieldEnum.status).toBe('status');
    expect(DisbursementScalarFieldEnum.payee_type).toBe('payee_type');
    expect(DisbursementScalarFieldEnum.academic_period).toBe('academic_period');
  });

  it('should have DisbursementEvidence linking disbursement to document', () => {
    const { DisbursementEvidenceScalarFieldEnum } = require('@prisma/client');

    expect(DisbursementEvidenceScalarFieldEnum.disbursement_id).toBe('disbursement_id');
    expect(DisbursementEvidenceScalarFieldEnum.document_id).toBe('document_id');
    expect(DisbursementEvidenceScalarFieldEnum.uploaded_by).toBe('uploaded_by');
  });

  it('should have Reversal supporting reversal and returned_funds types', () => {
    const { ReversalScalarFieldEnum } = require('@prisma/client');

    expect(ReversalScalarFieldEnum.disbursement_id).toBe('disbursement_id');
    expect(ReversalScalarFieldEnum.type).toBe('type');
    expect(ReversalScalarFieldEnum.amount).toBe('amount');
    expect(ReversalScalarFieldEnum.reason).toBe('reason');
  });

  it('should have M&E models in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.AcademicPerformance).toBe('AcademicPerformance');
    expect(ModelName.Intervention).toBe('Intervention');
    expect(ModelName.AtRiskFlag).toBe('AtRiskFlag');
    expect(ModelName.MonitoringVisit).toBe('MonitoringVisit');
  });

  it('should have AcademicPerformance with subjects JSON and progression', () => {
    const { AcademicPerformanceScalarFieldEnum } = require('@prisma/client');

    expect(AcademicPerformanceScalarFieldEnum.subjects).toBe('subjects');
    expect(AcademicPerformanceScalarFieldEnum.academic_period).toBe('academic_period');
    expect(AcademicPerformanceScalarFieldEnum.progression).toBe('progression');
    expect(AcademicPerformanceScalarFieldEnum.overall_score).toBe('overall_score');
  });

  it('should have Intervention with status, assigned user, and due date', () => {
    const { InterventionScalarFieldEnum } = require('@prisma/client');

    expect(InterventionScalarFieldEnum.assigned_to).toBe('assigned_to');
    expect(InterventionScalarFieldEnum.due_date).toBe('due_date');
    expect(InterventionScalarFieldEnum.status).toBe('status');
    expect(InterventionScalarFieldEnum.action).toBe('action');
  });

  it('should have AtRiskFlag with unique beneficiary tracking', () => {
    const { AtRiskFlagScalarFieldEnum } = require('@prisma/client');

    expect(AtRiskFlagScalarFieldEnum.beneficiary_id).toBe('beneficiary_id');
    expect(AtRiskFlagScalarFieldEnum.resolved).toBe('resolved');
    expect(AtRiskFlagScalarFieldEnum.reason).toBe('reason');
  });

  it('should have MonitoringVisit with polymorphic entity linking', () => {
    const { MonitoringVisitScalarFieldEnum } = require('@prisma/client');

    expect(MonitoringVisitScalarFieldEnum.entity_type).toBe('entity_type');
    expect(MonitoringVisitScalarFieldEnum.entity_id).toBe('entity_id');
    expect(MonitoringVisitScalarFieldEnum.visit_date).toBe('visit_date');
    expect(MonitoringVisitScalarFieldEnum.findings).toBe('findings');
  });

  it('should have Outcome model in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');
    expect(ModelName.Outcome).toBe('Outcome');
  });

  it('should have Outcome with beneficiary, program, and outcome type fields', () => {
    const { OutcomeScalarFieldEnum } = require('@prisma/client');

    expect(OutcomeScalarFieldEnum.beneficiary_id).toBe('beneficiary_id');
    expect(OutcomeScalarFieldEnum.program_id).toBe('program_id');
    expect(OutcomeScalarFieldEnum.outcome_type).toBe('outcome_type');
    expect(OutcomeScalarFieldEnum.outcome_date).toBe('outcome_date');
    expect(OutcomeScalarFieldEnum.reason).toBe('reason');
    expect(OutcomeScalarFieldEnum.recorded_by).toBe('recorded_by');
  });

  it('should have Role model in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.Role).toBe('Role');
  });

  it('should have Role with correct scalar fields', () => {
    const { RoleScalarFieldEnum } = require('@prisma/client');

    expect(RoleScalarFieldEnum.name).toBe('name');
    expect(RoleScalarFieldEnum.description).toBe('description');
    expect(RoleScalarFieldEnum.permissions).toBe('permissions');
    expect(RoleScalarFieldEnum.status).toBe('status');
  });

  it('should have User linked to Role via role_id', () => {
    const { UserScalarFieldEnum } = require('@prisma/client');

    expect(UserScalarFieldEnum.role_id).toBe('role_id');
    expect(UserScalarFieldEnum.role_name).toBe('role_name');
  });

  it('should have reporting models in ModelName enum', () => {
    const { ModelName } = require('@prisma/client');

    expect(ModelName.ReportDefinition).toBe('ReportDefinition');
    expect(ModelName.NotificationLog).toBe('NotificationLog');
    expect(ModelName.ExportLog).toBe('ExportLog');
  });

  it('should have ReportDefinition with JSON fields and filters', () => {
    const { ReportDefinitionScalarFieldEnum } = require('@prisma/client');

    expect(ReportDefinitionScalarFieldEnum.fields).toBe('fields');
    expect(ReportDefinitionScalarFieldEnum.filters).toBe('filters');
    expect(ReportDefinitionScalarFieldEnum.name).toBe('name');
  });

  it('should have NotificationLog with channel, recipient, and status', () => {
    const { NotificationLogScalarFieldEnum } = require('@prisma/client');

    expect(NotificationLogScalarFieldEnum.recipient).toBe('recipient');
    expect(NotificationLogScalarFieldEnum.channel).toBe('channel');
    expect(NotificationLogScalarFieldEnum.status).toBe('status');
  });

  it('should have ExportLog tracking user, type, format, and filters', () => {
    const { ExportLogScalarFieldEnum } = require('@prisma/client');

    expect(ExportLogScalarFieldEnum.user_id).toBe('user_id');
    expect(ExportLogScalarFieldEnum.export_type).toBe('export_type');
    expect(ExportLogScalarFieldEnum.format).toBe('format');
    expect(ExportLogScalarFieldEnum.filters).toBe('filters');
  });
});
