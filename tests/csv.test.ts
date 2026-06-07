import { describe, it, expect } from "vitest"
import { toCsv, parseCsv } from "@/lib/csv"

describe("toCsv", () => {
  const cols = [
    { key: "id" as const, label: "ID" },
    { key: "title" as const, label: "Title" },
  ]
  it("writes a header and rows", () => {
    expect(toCsv([{ id: "1", title: "Hello" }], cols)).toBe("ID,Title\n1,Hello")
  })
  it("quotes fields with commas, quotes, newlines", () => {
    const out = toCsv([{ id: "1", title: 'a,"b"\nc' }], cols)
    expect(out).toBe('ID,Title\n1,"a,""b""\nc"')
  })
  it("header only when no rows", () => {
    expect(toCsv([], cols)).toBe("ID,Title")
  })
  it("joins array values", () => {
    const out = toCsv([{ id: "1", title: ["x", "y"] as unknown as string }], cols)
    expect(out).toBe("ID,Title\n1,x; y")
  })
})

describe("parseCsv", () => {
  it("parses simple rows keyed by header", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ])
  })
  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"x,y","he said ""hi"""')).toEqual([
      { a: "x,y", b: 'he said "hi"' },
    ])
  })
  it("handles newlines inside quotes", () => {
    expect(parseCsv('a\n"line1\nline2"')).toEqual([{ a: "line1\nline2" }])
  })
  it("skips fully blank lines and returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([{ a: "1", b: "2" }])
  })
  it("round-trips with toCsv", () => {
    const cols = [
      { key: "name" as const, label: "name" },
      { key: "note" as const, label: "note" },
    ]
    const rows = [{ name: "Acme, Inc", note: 'a "quote"' }]
    expect(parseCsv(toCsv(rows, cols))).toEqual(rows)
  })
})
