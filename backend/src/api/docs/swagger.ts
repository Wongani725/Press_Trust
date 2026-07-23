import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../../shared/config';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Press Trust Scholarship Management System API',
      version: '1.0.0',
      description: 'REST API for the Press Trust Scholarship Management System',
    },
    servers: [
      {
        url: `http://localhost:${config.port}/api/v1`,
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success'] },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'integer' },
                mfaRequired: { type: 'boolean' },
                mfaMethod: { type: 'string', enum: ['totp', 'email_otp'] },
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    role: { type: 'string' },
                    programs: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
        MfaVerify: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string', description: '6-digit code' },
          },
        },
        MfaVerifyResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success'] },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                refreshToken: { type: 'string' },
                expiresIn: { type: 'integer' },
              },
            },
            message: { type: 'string' },
          },
        },
        MfaSetup: {
          type: 'object',
          properties: {
            method: { type: 'string', enum: ['totp', 'email_otp'], default: 'totp' },
          },
        },
        MfaSetupResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success'] },
            data: {
              type: 'object',
              properties: {
                qrCode: { type: 'string', description: 'base64 PNG (TOTP) or null' },
                method: { type: 'string' },
                sent: { type: 'boolean', description: 'true if email OTP sent' },
              },
            },
            message: { type: 'string' },
          },
        },
        RefreshRequest: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string' },
          },
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8 },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success', 'error'] },
            data: { type: 'object', nullable: true },
            message: { type: 'string' },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['success'] },
            data: {
              type: 'object',
              properties: {
                items: { type: 'array', items: { type: 'object' } },
                meta: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
        UserCreate: {
          type: 'object',
          required: ['name', 'email', 'password', 'role_id'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            role_id: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            programIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
        UserUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            role_id: { type: 'string', format: 'uuid' },
            phone: { type: 'string' },
            programIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
        UserStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive', 'blocked'] },
            reason: { type: 'string' },
          },
        },
        RoleCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            permissions: { type: 'object' },
          },
        },
        RoleUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            permissions: { type: 'object' },
          },
        },
        RolePermissionsUpdate: {
          type: 'object',
          required: ['permissions'],
          properties: {
            permissions: {
              type: 'object',
              additionalProperties: { type: 'array', items: { type: 'string' } },
              description: 'Resource → action map. Canonical keys from GET /admin/roles/permissions-catalog',
              example: {
                programs: ['read', 'create', 'update'],
                bank_accounts: ['read', 'unmask'],
              },
            },
          },
        },
        RoleStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ProgramCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            application_open_date: { type: 'string', format: 'date-time' },
            application_close_date: { type: 'string', format: 'date-time' },
            budget_ceiling: { type: 'number', minimum: 0 },
            award_types: { type: 'array', items: { type: 'string', enum: ['one_off', 'recurring', 'renewable'] } },
            funding_source_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
            required_documents: { type: 'array', items: { type: 'string' }, example: ['Birth Certificate', 'National ID', 'Latest Report Card'] },
          },
        },
        ProgramUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            application_open_date: { type: 'string', format: 'date-time' },
            application_close_date: { type: 'string', format: 'date-time' },
            award_types: { type: 'array', items: { type: 'string', enum: ['one_off', 'recurring', 'renewable'] } },
            funding_source_ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
            required_documents: { type: 'array', items: { type: 'string' } },
          },
        },
        ProgramStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Draft', 'Open', 'Closed', 'Archived'] },
            reason: { type: 'string' },
          },
        },
        ProgramBudgetUpdate: {
          type: 'object',
          required: ['budget_ceiling'],
          properties: {
            budget_ceiling: { type: 'number', minimum: 0 },
          },
        },
        ProgramConfigUpdate: {
          type: 'object',
          properties: {
            eligibility_rules: { type: 'object' },
            evaluation_rubric: { type: 'object' },
            workflow_config: { type: 'object' },
            form_config: { type: 'object' },
          },
        },
        SchoolCreate: {
          type: 'object',
          required: ['name', 'district'],
          properties: {
            name: { type: 'string' },
            type: { type: 'string', default: 'secondary' },
            district: { type: 'string' },
            location: { type: 'string' },
            contact_phone: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
            registration_status: { type: 'string' },
          },
        },
        SchoolUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            district: { type: 'string' },
            location: { type: 'string' },
            contact_phone: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
            registration_status: { type: 'string' },
          },
        },
        SchoolStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        BankAccountCreate: {
          type: 'object',
          required: ['bank_name', 'account_number', 'account_holder_name'],
          properties: {
            bank_name: { type: 'string' },
            branch: { type: 'string' },
            account_number: { type: 'string' },
            account_holder_name: { type: 'string' },
          },
        },
        BankAccountUpdate: {
          type: 'object',
          properties: {
            bank_name: { type: 'string' },
            branch: { type: 'string' },
            account_number: { type: 'string' },
            account_holder_name: { type: 'string' },
          },
        },
        BankAccountStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        FundingSourceCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            total_allocation: { type: 'number', minimum: 0 },
          },
        },
        FundingSourceUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            total_allocation: { type: 'number', minimum: 0 },
          },
        },
        FundingSourceStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        DisbursementItemCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
          },
        },
        DisbursementItemUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
        DisbursementItemStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        ReferenceDataCreate: {
          type: 'object',
          required: ['code', 'name'],
          properties: {
            code: { type: 'string' },
            name: { type: 'string' },
          },
        },
        ReferenceDataUpdate: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            name: { type: 'string' },
          },
        },
        ReferenceDataStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['active', 'inactive'] },
          },
        },
        TemplateMetadata: {
          type: 'object',
          properties: {
            headers: { type: 'array', items: { type: 'string' } },
            required: { type: 'array', items: { type: 'string' } },
            optional: { type: 'array', items: { type: 'string' } },
            schools: { type: 'array', items: { type: 'object' } },
            programs: { type: 'array', items: { type: 'object' } },
            districts: { type: 'array', items: { type: 'object' } },
            sample_academic_periods: { type: 'array', items: { type: 'string' } },
          },
        },
        ImportCreate: {
          type: 'object',
          required: ['file'],
          properties: {
            file: { type: 'string', format: 'binary' },
          },
        },
        ImportSummary: {
          type: 'object',
          properties: {
            total_rows: { type: 'integer' },
            created: { type: 'integer' },
            skipped_duplicates: { type: 'integer' },
            errors: { type: 'array', items: { type: 'object' } },
            error_log_csv: { type: 'string' },
          },
        },
        OnboardingAction: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
        BeneficiaryCreate: {
          type: 'object',
          required: ['first_name', 'last_name', 'gender', 'district', 'school_id', 'program_id'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            gender: { type: 'string' },
            district: { type: 'string' },
            school_id: { type: 'string', format: 'uuid' },
            program_id: { type: 'string', format: 'uuid' },
            date_of_birth: { type: 'string' },
            national_id: { type: 'string' },
            exams_id: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
            contact_phone: { type: 'string' },
            academic_year: { type: 'string' },
            guardian: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                relationship: { type: 'string' },
                contact_phone: { type: 'string' },
                contact_email: { type: 'string', format: 'email' },
              },
            },
          },
        },
        BeneficiaryUpdate: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            gender: { type: 'string' },
            district: { type: 'string' },
            school_id: { type: 'string', format: 'uuid' },
            program_id: { type: 'string', format: 'uuid' },
            date_of_birth: { type: 'string' },
            national_id: { type: 'string' },
            exams_id: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
            contact_phone: { type: 'string' },
            academic_year: { type: 'string' },
          },
        },
        BeneficiaryStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Imported', 'PendingOnboarding', 'Active', 'Suspended', 'Closed'] },
            reason: { type: 'string' },
          },
        },
        GuardianCreate: {
          type: 'object',
          required: ['name', 'relationship', 'contact_phone'],
          properties: {
            name: { type: 'string' },
            relationship: { type: 'string' },
            contact_phone: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
          },
        },
        GuardianUpdate: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            relationship: { type: 'string' },
            contact_phone: { type: 'string' },
            contact_email: { type: 'string', format: 'email' },
          },
        },
        DocumentCreate: {
          type: 'object',
          required: ['documentable_type', 'documentable_id', 'document_type', 'file'],
          properties: {
            documentable_type: { type: 'string' },
            documentable_id: { type: 'string', format: 'uuid' },
            document_type: {
              type: 'string',
              enum: ['application_form', 'id_copy', 'report_card', 'bank_statement', 'receipt', 'award_letter', 'disbursement_evidence', 'medical_record', 'other'],
            },
            expiry_date: { type: 'string', format: 'date-time' },
            file: { type: 'string', format: 'binary' },
          },
        },
        DocumentStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Pending', 'Verified', 'Rejected'] },
            rejection_reason: { type: 'string' },
          },
        },
        DocumentVersionUpload: {
          type: 'object',
          required: ['file'],
          properties: {
            file: { type: 'string', format: 'binary' },
          },
        },
        AwardCreate: {
          type: 'object',
          required: ['beneficiary_id', 'program_id', 'amount', 'award_type'],
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            program_id: { type: 'string', format: 'uuid' },
            funding_source_id: { type: 'string', format: 'uuid' },
            amount: { type: 'number', minimum: 0 },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
            award_type: { type: 'string', enum: ['one_off', 'recurring', 'renewable'] },
          },
        },
        AwardUpdate: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 0 },
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
            award_type: { type: 'string', enum: ['one_off', 'recurring', 'renewable'] },
            funding_source_id: { type: 'string', format: 'uuid' },
          },
        },
        AwardStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Draft', 'Active', 'Suspended', 'Completed', 'Closed'] },
            reason: { type: 'string' },
          },
        },
        AwardRenew: {
          type: 'object',
          properties: {
            start_date: { type: 'string', format: 'date-time' },
            end_date: { type: 'string', format: 'date-time' },
            amount: { type: 'number', minimum: 0 },
            award_type: { type: 'string', enum: ['one_off', 'recurring', 'renewable'] },
          },
        },
        DisbursementCreate: {
          type: 'object',
          required: ['award_id', 'amount', 'category', 'academic_period', 'payee_type', 'payee_name'],
          properties: {
            award_id: { type: 'string', format: 'uuid' },
            amount: { type: 'number', minimum: 0.01 },
            category: { type: 'string' },
            academic_period: { type: 'string' },
            payee_type: { type: 'string', enum: ['school', 'guardian', 'vendor'] },
            payee_id: { type: 'string', format: 'uuid' },
            payee_name: { type: 'string' },
            payee_bank_account: { type: 'string' },
          },
        },
        DisbursementUpdate: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 0.01 },
            category: { type: 'string' },
            academic_period: { type: 'string' },
            payee_type: { type: 'string', enum: ['school', 'guardian', 'vendor'] },
            payee_id: { type: 'string', format: 'uuid' },
            payee_name: { type: 'string' },
            payee_bank_account: { type: 'string' },
          },
        },
        DisbursementBatchCreate: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 50,
              items: { $ref: '#/components/schemas/DisbursementCreate' },
              description: 'Each item mirrors DisbursementCreate (award_id, amount, category, academic_period, payee_type, payee_name, optional payee_id / payee_bank_account)',
            },
          },
        },
        AtRiskFlagWarn: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', example: 'Performance did not improve after re-check period' },
          },
        },
        TerminationRecommendationCreate: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', example: 'Repeated academic failure despite formal warning' },
          },
        },
        DisbursementReject: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string' },
          },
        },
        DisbursementEvidenceLink: {
          type: 'object',
          required: ['document_id'],
          properties: {
            document_id: { type: 'string', format: 'uuid' },
          },
        },
        DisbursementStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Requested', 'Approved', 'Paid', 'Failed', 'Reconciled'] },
            failure_reason: { type: 'string' },
          },
        },
        DisbursementReverse: {
          type: 'object',
          required: ['reason'],
          properties: {
            amount: { type: 'number', minimum: 0.01 },
            reason: { type: 'string' },
          },
        },
        DisbursementReturn: {
          type: 'object',
          required: ['amount', 'reason'],
          properties: {
            amount: { type: 'number', minimum: 0.01 },
            reason: { type: 'string' },
          },
        },
        PerformanceCreate: {
          type: 'object',
          required: ['beneficiary_id', 'school_id', 'academic_period', 'subjects'],
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            school_id: { type: 'string', format: 'uuid' },
            academic_period: { type: 'string' },
            subjects: { type: 'object' },
            overall_score: { type: 'number', minimum: 0, maximum: 100 },
            attendance_percentage: { type: 'number', minimum: 0, maximum: 100 },
            progression: { type: 'string', enum: ['Promoted', 'Repeated', 'Completed', 'Dropped'] },
            notes: { type: 'string' },
          },
        },
        PerformanceUpdate: {
          type: 'object',
          properties: {
            subjects: { type: 'object' },
            overall_score: { type: 'number', minimum: 0, maximum: 100 },
            attendance_percentage: { type: 'number', minimum: 0, maximum: 100 },
            progression: { type: 'string', enum: ['Promoted', 'Repeated', 'Completed', 'Dropped'] },
            notes: { type: 'string' },
          },
        },
        AtRiskFlagCreate: {
          type: 'object',
          required: ['beneficiary_id', 'reason'],
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            reason: { type: 'string' },
          },
        },
        AtRiskFlagResolve: {
          type: 'object',
          required: ['justification'],
          properties: {
            justification: { type: 'string' },
          },
        },
        AutoFlagRequest: {
          type: 'object',
          properties: {
            score_threshold: { type: 'number', minimum: 0, maximum: 100, default: 50 },
            attendance_threshold: { type: 'number', minimum: 0, maximum: 100, default: 75 },
            academic_period: { type: 'string' },
          },
        },
        InterventionCreate: {
          type: 'object',
          required: ['beneficiary_id', 'action', 'assigned_to', 'due_date'],
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            action: { type: 'string' },
            assigned_to: { type: 'string', format: 'uuid' },
            due_date: { type: 'string', format: 'date-time' },
          },
        },
        InterventionUpdate: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            assigned_to: { type: 'string', format: 'uuid' },
            due_date: { type: 'string', format: 'date-time' },
          },
        },
        InterventionStatusUpdate: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['Open', 'InProgress', 'Closed'] },
            resolution_notes: { type: 'string' },
          },
        },
        MonitoringVisitCreate: {
          type: 'object',
          required: ['entity_type', 'entity_id', 'visit_date', 'findings'],
          properties: {
            entity_type: { type: 'string', enum: ['beneficiary', 'school'] },
            entity_id: { type: 'string', format: 'uuid' },
            visit_date: { type: 'string', format: 'date-time' },
            findings: { type: 'string' },
            follow_up_actions: { type: 'string' },
          },
        },
        MonitoringVisitUpdate: {
          type: 'object',
          properties: {
            entity_type: { type: 'string', enum: ['beneficiary', 'school'] },
            entity_id: { type: 'string', format: 'uuid' },
            visit_date: { type: 'string', format: 'date-time' },
            findings: { type: 'string' },
            follow_up_actions: { type: 'string' },
          },
        },
        OutcomeCreate: {
          type: 'object',
          required: ['beneficiary_id', 'program_id', 'outcome_type', 'outcome_date'],
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            program_id: { type: 'string', format: 'uuid' },
            outcome_type: { type: 'string', enum: ['Completion', 'Graduation', 'Exit'] },
            outcome_date: { type: 'string', format: 'date-time' },
            reason: { type: 'string' },
          },
        },
        OutcomeUpdate: {
          type: 'object',
          properties: {
            beneficiary_id: { type: 'string', format: 'uuid' },
            program_id: { type: 'string', format: 'uuid' },
            outcome_type: { type: 'string', enum: ['Completion', 'Graduation', 'Exit'] },
            outcome_date: { type: 'string', format: 'date-time' },
            reason: { type: 'string' },
          },
        },
        DashboardResponse: {
          type: 'object',
          properties: {
            active_beneficiaries: { type: 'integer' },
            pending_onboarding: { type: 'integer' },
            programs: { type: 'object', properties: { total: { type: 'integer' }, active: { type: 'integer' } } },
            at_risk_count: { type: 'integer' },
            disbursements: {
              type: 'object',
              properties: {
                requested: { type: 'integer' },
                approved: { type: 'integer' },
                paid: { type: 'integer' },
                reconciled: { type: 'integer' },
              },
            },
            budget: {
              type: 'object',
              properties: {
                utilized: { type: 'number' },
                ceiling: { type: 'number' },
                percentage: { type: 'number' },
              },
            },
          },
        },
        ReportQuery: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'csv', 'pdf', 'xlsx'], default: 'json' },
            program_id: { type: 'string', format: 'uuid' },
            period: { type: 'string' },
            district: { type: 'string' },
            school_id: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            from_date: { type: 'string', format: 'date-time' },
            to_date: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication and authorization' },
      { name: 'Users', description: 'User and role management' },
      { name: 'Programs', description: 'Scholarship program management' },
      { name: 'Master Data', description: 'Schools, funding sources, reference data' },
      { name: 'Beneficiaries', description: 'Beneficiary management' },
      { name: 'Documents', description: 'Document upload, verification, and versioning' },
      { name: 'Awards', description: 'Award management' },
      { name: 'Disbursements', description: 'Financial tracking and disbursements' },
      { name: 'M&E', description: 'Monitoring and evaluation' },
      { name: 'Reports', description: 'Reporting and dashboards' },
      { name: 'System', description: 'System configuration' },
    ],
  },
  apis: ['./src/api/controllers/**/*.ts', './src/api/routes/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
