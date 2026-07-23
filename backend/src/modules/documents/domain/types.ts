import { DocumentStatus } from '@prisma/client';

export type CreateDocumentInput = {
  documentableId: string;
  documentableType: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  documentType: string;
  uploadedBy: string;
};

export type DocumentResponse = {
  id: string;
  documentableId: string;
  documentableType: string;
  filePath: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  documentType: string;
  status: DocumentStatus;
  rejectionReason: string | null;
  version: number;
  expiryDate: string | null;
  virusScanStatus: string;
  uploadedBy: string;
  createdAt: Date;
  updatedAt: Date;
};
