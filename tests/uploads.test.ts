import { describe, it, expect } from "vitest"
import {
  validateUploads,
  MAX_FILE_BYTES,
  MAX_FILES_PER_REQUEST,
} from "@/lib/uploads"

const file = (over: Partial<Parameters<typeof validateUploads>[0][number]> = {}) => ({
  name: "doc.pdf",
  mimeType: "application/pdf",
  size: 1024,
  ...over,
})

describe("validateUploads", () => {
  it("accepts a valid file", () => {
    expect(validateUploads([file()])).toBeNull()
  })

  it("rejects an empty list", () => {
    expect(validateUploads([])).toBe("No files provided")
  })

  it("rejects too many files", () => {
    const many = Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, () => file())
    expect(validateUploads(many)).toMatch(/Too many files/)
  })

  it("rejects a disallowed MIME type", () => {
    expect(validateUploads([file({ mimeType: "application/x-msdownload" })])).toMatch(
      /not allowed/
    )
  })

  it("rejects an oversized file", () => {
    expect(validateUploads([file({ size: MAX_FILE_BYTES + 1 })])).toMatch(/limit/)
  })

  it("rejects a missing name", () => {
    expect(validateUploads([file({ name: "" })])).toMatch(/missing its name/)
  })

  it("rejects an oversized data URL payload", () => {
    const huge = "x".repeat(Math.ceil(MAX_FILE_BYTES * 1.5) + 1)
    expect(validateUploads([file({ dataUrl: huge })])).toMatch(/too large/)
  })
})
