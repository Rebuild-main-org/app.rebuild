// Support report types + their templates. Client-safe (no server-only deps) so
// both the New-ticket form (prefills the body template) and the API (maps the
// type to GitHub labels + a title prefix) share one source of truth.

export type ReportType = "bug" | "feature" | "question" | "performance" | "billing" | "other"

export interface ReportTypeMeta {
  value: ReportType
  label: string
  // Extra GitHub labels for the auto-opened issue (besides the base "support").
  ghLabels: string[]
  // Markdown body template prefilled in the form when this type is chosen.
  template: string
}

export const REPORT_TYPES: ReportTypeMeta[] = [
  {
    value: "bug",
    label: "🐞 Bug",
    ghLabels: ["bug"],
    template: [
      "### What happened?",
      "",
      "### Steps to reproduce",
      "1. ",
      "2. ",
      "3. ",
      "",
      "### Expected result",
      "",
      "### Actual result",
      "",
      "### Environment (page URL, browser, OS)",
      "",
    ].join("\n"),
  },
  {
    value: "feature",
    label: "✨ Feature request",
    ghLabels: ["enhancement"],
    template: [
      "### Problem to solve",
      "",
      "### Proposed solution",
      "",
      "### Who benefits / how often",
      "",
      "### Alternatives considered",
      "",
    ].join("\n"),
  },
  {
    value: "question",
    label: "❓ Question / Help",
    ghLabels: ["question"],
    template: [
      "### Your question",
      "",
      "### What you've already tried",
      "",
      "### Relevant page / workspace",
      "",
    ].join("\n"),
  },
  {
    value: "performance",
    label: "🐢 Performance",
    ghLabels: ["performance"],
    template: [
      "### What feels slow?",
      "",
      "### Where (page / action)",
      "",
      "### When did it start?",
      "",
    ].join("\n"),
  },
  {
    value: "billing",
    label: "💳 Billing / Account",
    ghLabels: ["billing"],
    template: [
      "### Account / workspace",
      "",
      "### Invoice or charge reference",
      "",
      "### What's the issue?",
      "",
    ].join("\n"),
  },
  {
    value: "other",
    label: "💬 Other",
    ghLabels: [],
    template: "### Details\n\n",
  },
]

export const DEFAULT_REPORT_TYPE: ReportType = "bug"

const BY_VALUE = new Map(REPORT_TYPES.map((t) => [t.value, t]))

// Resolve a (possibly untrusted) value to a known report type, falling back to
// the default — so the API can trust the result.
export function reportType(value: string | undefined | null): ReportTypeMeta {
  return BY_VALUE.get((value ?? "") as ReportType) ?? BY_VALUE.get(DEFAULT_REPORT_TYPE)!
}
