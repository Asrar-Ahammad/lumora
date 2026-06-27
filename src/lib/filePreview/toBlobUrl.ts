const MIME_TYPE_MAP: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/**
 * Converts a raw decrypted ArrayBuffer to an Object URL representing a Blob
 * with the correct MIME type. Accept either an extension (e.g. "docx") or full MIME type.
 */
export function toBlobUrl(data: ArrayBuffer, mimeTypeOrExt: string): string {
  const mimeType = MIME_TYPE_MAP[mimeTypeOrExt.toLowerCase()] || mimeTypeOrExt;
  const blob = new Blob([data], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Wraps URL.revokeObjectURL to release memory allocated for Object URLs
 */
export function revokeBlobUrl(url: string): void {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}
