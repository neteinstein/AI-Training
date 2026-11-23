/**
 * What trainers may upload. Must stay in step with the `course-materials` bucket in
 * supabase/migrations (allowed MIME types and the 50 MiB limit): the bucket is what enforces
 * the rules; these checks give a clear message before the upload starts.
 */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Extension -> the MIME type sent with the upload. */
export const UPLOAD_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  odp: "application/vnd.oasis.opendocument.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

export const UPLOAD_ACCEPT = Object.keys(UPLOAD_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");

export type UploadProblem = "empty" | "tooLarge" | "type";

export function fileExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : "";
}

/** The MIME type to store for a file, decided by its extension; null when it is not allowed. */
export function uploadMimeType(fileName: string): string | null {
  return UPLOAD_TYPES[fileExtension(fileName)] ?? null;
}

export function checkUpload(file: { name: string; size: number }): UploadProblem | null {
  if (file.size <= 0) return "empty";
  if (file.size > MAX_UPLOAD_BYTES) return "tooLarge";
  if (!uploadMimeType(file.name)) return "type";
  return null;
}

/**
 * Object key for a new upload: `{courseId}/{uuid}.{ext}`. Keys only accept a limited
 * character set, so the original filename is stored separately in the database.
 */
export function storageKey(courseId: string, fileName: string, uuid: string): string {
  return `${courseId}/${uuid}.${fileExtension(fileName)}`;
}

/** A filename safe to show and to offer as a download name. */
export function cleanFileName(fileName: string): string {
  const cleaned = fileName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .trim();
  return cleaned.slice(0, 200) || "file";
}

/** "2,4 MB" / "2.4 MB": a file size for people, in the page's language. */
export function formatFileSize(bytes: number, locale: string): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return `${number} ${units[unit]}`;
}
