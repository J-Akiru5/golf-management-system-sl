import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptProviderKey,
  encryptProviderKey,
  isSecretStorageConfigured,
  keyHint,
  type StoredProviderKey,
} from "./secrets";

/**
 * A fixed test vector, produced once with the same algorithm and AAD as `secrets.ts`.
 *
 * The key is 32 bytes 0x00..0x1f, the IV is 12 bytes 0x00..0x0b, the provider is "gemini" and the
 * plaintext is the obviously fake string below. This test lives in both apps with identical values:
 * if either copy changes the AAD, the encoding or the algorithm, its test fails. The key is a test
 * value and must never be used anywhere else.
 */
const TEST_KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const TEST_PLAINTEXT = "test-vector-key-1234";
const TEST_VECTOR = {
  provider: "gemini",
  keyCiphertext: "M2elb+iTp3j5LuWm2owBQLLktAA=",
  keyIv: "AAECAwQFBgcICQoL",
  keyTag: "kREUaUxdjPH8s4Ghx4JrlA==",
  keyVersion: 1,
} satisfies StoredProviderKey;

beforeEach(() => {
  vi.stubEnv("AI_SECRET_KEY", TEST_KEY);
  vi.stubEnv("AI_SECRET_KEY_VERSION", "1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider key encryption", () => {
  it("decrypts the shared fixed vector", () => {
    expect(decryptProviderKey(TEST_VECTOR)).toBe(TEST_PLAINTEXT);
  });

  it("refuses the vector on another provider's row", () => {
    expect(decryptProviderKey({ ...TEST_VECTOR, provider: "openai_compat" })).toBeNull();
  });

  it("refuses a tampered ciphertext", () => {
    const bytes = Buffer.from(TEST_VECTOR.keyCiphertext, "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    expect(
      decryptProviderKey({ ...TEST_VECTOR, keyCiphertext: bytes.toString("base64") }),
    ).toBeNull();
  });

  it("round-trips a value with a fresh IV each time", () => {
    const first = encryptProviderKey("openai_compat", "sk-test-abcdefgh");
    const second = encryptProviderKey("openai_compat", "sk-test-abcdefgh");
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.iv).not.toBe(second?.iv);
    expect(
      decryptProviderKey({
        provider: "openai_compat",
        keyCiphertext: first?.ciphertext ?? null,
        keyIv: first?.iv ?? null,
        keyTag: first?.tag ?? null,
        keyVersion: first?.keyVersion ?? null,
      }),
    ).toBe("sk-test-abcdefgh");
  });

  it("keeps only the last four characters as the hint", () => {
    expect(keyHint("sk-test-abcdefgh")).toBe("efgh");
    expect(keyHint("abcd")).toBe("abcd");
  });

  it("reports whether storage is configured", () => {
    expect(isSecretStorageConfigured()).toBe(true);
    vi.stubEnv("AI_SECRET_KEY", "");
    expect(isSecretStorageConfigured()).toBe(false);
    expect(encryptProviderKey("gemini", "value")).toBeNull();
  });

  it("decrypts the previous generation after a rotation", () => {
    vi.stubEnv("AI_SECRET_KEY_VERSION", "2");
    vi.stubEnv("AI_SECRET_KEY_PREVIOUS", TEST_KEY);
    expect(decryptProviderKey(TEST_VECTOR)).toBe(TEST_PLAINTEXT);
  });
});
