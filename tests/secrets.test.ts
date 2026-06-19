import { describe, it, expect, beforeAll } from "vitest"

beforeAll(() => {
  process.env.SECRETS_MASTER_KEY = "test-master-key-0123456789abcdef" // >= 32 chars
})

import { encryptSecret, decryptSecret } from "@/lib/secrets"

describe("BYOK vault (envelope AES-256-GCM)", () => {
  it("round-trips a secret per org", () => {
    const ct = encryptSecret("org-A", "sk-ant-supersecret")
    expect(ct).not.toContain("sk-ant-supersecret") // stored encrypted
    expect(decryptSecret("org-A", ct)).toBe("sk-ant-supersecret")
  })

  it("a ciphertext from org A cannot be decrypted as org B (per-org key)", () => {
    const ct = encryptSecret("org-A", "topsecret")
    expect(() => decryptSecret("org-B", ct)).toThrow() // GCM auth fails
  })

  it("tampering with the ciphertext is rejected", () => {
    const ct = encryptSecret("org-A", "topsecret")
    const tampered = Buffer.from(ct, "base64")
    tampered[tampered.length - 1] ^= 0xff
    expect(() => decryptSecret("org-A", tampered.toString("base64"))).toThrow()
  })
})
