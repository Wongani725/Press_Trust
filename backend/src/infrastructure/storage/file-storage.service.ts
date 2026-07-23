import fs from 'fs';
import path from 'path';
import { config } from '../../shared/config';

const UPLOAD_DIR = path.resolve(config.upload.dir);

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function getUploadPath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

export function sanitizeFilename(original: string): string {
  return original.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_');
}

export function generateStoredName(
  documentableType: string,
  documentableId: string,
  version: number,
  originalName: string
): string {
  const ext = path.extname(originalName) || '.bin';
  const timestamp = Date.now();
  const base = `${documentableType}_${documentableId}_v${version}_${timestamp}`;
  return `${base}${ext}`;
}

export async function saveFile(buffer: Buffer, storedName: string): Promise<string> {
  const filePath = getUploadPath(storedName);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

export function readFileStream(storedName: string): fs.ReadStream {
  const filePath = getUploadPath(storedName);
  return fs.createReadStream(filePath);
}

export async function deleteFile(storedName: string): Promise<void> {
  const filePath = getUploadPath(storedName);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

export function fileExists(storedName: string): boolean {
  return fs.existsSync(getUploadPath(storedName));
}
