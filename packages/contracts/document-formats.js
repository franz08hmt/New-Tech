/** Shared file-picker/boundary allowlist, not a content or authorization check. */
export const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_UPLOAD_ACCEPT =
  ".pdf,.doc,.docx,.md,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain";
const types = {
  pdf: ["application/pdf"],
  doc: ["application/msword", "application/octet-stream", ""],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip",
    "application/octet-stream",
    "",
  ],
  md: [
    "text/markdown",
    "text/x-markdown",
    "text/plain",
    "application/octet-stream",
    "",
  ],
  txt: ["text/plain", "application/octet-stream", ""],
};
export function documentUploadFormat(name, mime) {
  const extension = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase();
  return Object.hasOwn(types, extension ?? "") &&
    types[extension].includes(mime.toLowerCase())
    ? extension
    : undefined;
}
