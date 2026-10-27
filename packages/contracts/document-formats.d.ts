export type DocumentUploadFormat = "pdf" | "doc" | "docx" | "md" | "txt";
export const MAX_DOCUMENT_UPLOAD_BYTES: number;
export const DOCUMENT_UPLOAD_ACCEPT: string;
export function documentUploadFormat(
  name: string,
  mime: string,
): DocumentUploadFormat | undefined;
