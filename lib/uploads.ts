// Upload validation (MUST-HAVE #5). Enforces per-file size + MIME allow-list
// before anything is persisted. Shared by document and attachment routes.

export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per file
export const MAX_FILES_PER_REQUEST = 20

// Allow-list of MIME types we accept. Conservative by design; extend as needed.
export const ALLOWED_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
])

export interface UploadInput {
  name: string
  mimeType: string
  size: number
  dataUrl?: string
}

// Returns an error string if any file is invalid, else null.
export function validateUploads(files: UploadInput[]): string | null {
  if (files.length === 0) return "No files provided"
  if (files.length > MAX_FILES_PER_REQUEST)
    return `Too many files (max ${MAX_FILES_PER_REQUEST})`
  for (const f of files) {
    if (!f.name?.trim()) return "A file is missing its name"
    const mime = (f.mimeType || "").toLowerCase()
    if (!ALLOWED_MIME.has(mime)) return `File type not allowed: ${mime || "unknown"}`
    if (typeof f.size !== "number" || f.size <= 0)
      return `Invalid size for ${f.name}`
    if (f.size > MAX_FILE_BYTES)
      return `${f.name} exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit`
    // Guard against data-URL payloads larger than the declared size (base64 is
    // ~1.37x the byte size; allow margin).
    if (f.dataUrl && f.dataUrl.length > MAX_FILE_BYTES * 1.5)
      return `${f.name} payload too large`
  }
  return null
}
