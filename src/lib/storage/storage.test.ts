import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signMock } = vi.hoisted(() => ({ signMock: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    sign(input: Request, init?: RequestInit) {
      return signMock(input, init);
    }
  },
}));

import {
  createObjectKey,
  createPresignedDownload,
  createPresignedUpload,
  DOCUMENT_MAX_BYTES,
  deleteObject,
  IMAGE_MAX_BYTES,
  InvalidPayloadError,
  InvalidStorageKeyError,
  isStorageConfigured,
  objectReadUrl,
  PayloadTooLargeError,
  PublicUrlNotConfiguredError,
  parseStorageConfig,
  publicObjectUrl,
  requireStorageConfig,
  StorageNotConfiguredError,
  StorageRequestError,
  UnsupportedMediaTypeError,
  validateUpload,
} from "./index";

const REQUIRED_ENV = {
  R2_ACCOUNT_ID: "account-id",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET: "golf-media",
};

beforeEach(() => {
  for (const [name, value] of Object.entries(REQUIRED_ENV)) vi.stubEnv(name, value);
  vi.stubEnv("R2_ENDPOINT", "");
  vi.stubEnv("R2_PUBLIC_URL", "");

  signMock.mockReset();
  signMock.mockImplementation(async (input: Request) => {
    const url = new URL(input.url);
    url.searchParams.set("X-Amz-Signature", "test-signature");
    return new Request(url, { method: input.method, headers: input.headers });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("storage configuration", () => {
  it("parses the four required values and defaults the endpoint", () => {
    expect(parseStorageConfig(REQUIRED_ENV)).toEqual({
      accountId: "account-id",
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
      bucket: "golf-media",
      endpoint: "https://account-id.r2.cloudflarestorage.com",
      publicUrl: null,
    });
  });

  it("trims values and keeps the optional endpoint and public URL", () => {
    const config = parseStorageConfig({
      ...REQUIRED_ENV,
      R2_BUCKET: " golf-media ",
      R2_ENDPOINT: "https://storage.example.com/",
      R2_PUBLIC_URL: "https://cdn.example.com/",
    });
    expect(config?.bucket).toBe("golf-media");
    expect(config?.endpoint).toBe("https://storage.example.com");
    expect(config?.publicUrl).toBe("https://cdn.example.com");
  });

  it.each(Object.keys(REQUIRED_ENV))("returns null when %s is missing", (name) => {
    const env = { ...REQUIRED_ENV, [name]: "" };
    expect(parseStorageConfig(env)).toBeNull();
  });

  it("never puts a secret value in the missing-config error", () => {
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_BUCKET", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "super-secret-value");

    let error: unknown;
    try {
      requireStorageConfig();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(StorageNotConfiguredError);
    expect((error as Error).message).not.toContain("super-secret-value");
    expect(JSON.stringify(error)).not.toContain("super-secret-value");
  });

  it("reports whether storage is configured", () => {
    expect(isStorageConfigured()).toBe(true);
    vi.stubEnv("R2_BUCKET", "");
    expect(isStorageConfigured()).toBe(false);
  });
});

describe("upload validation", () => {
  it("accepts JPEG, PNG, WebP and PDF", () => {
    expect(validateUpload("image/jpeg", 1).extension).toBe("jpg");
    expect(validateUpload("image/png", 1).extension).toBe("png");
    expect(validateUpload("image/webp", 1).extension).toBe("webp");
    expect(validateUpload("application/pdf", 1).extension).toBe("pdf");
  });

  it("rejects another type with a typed error", () => {
    expect(() => validateUpload("image/gif", 100)).toThrow(UnsupportedMediaTypeError);
    expect(() => validateUpload("text/plain", 100)).toThrow(UnsupportedMediaTypeError);
  });

  it("caps images at 5 MB and PDFs at 20 MB", () => {
    expect(IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
    expect(DOCUMENT_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(validateUpload("image/png", IMAGE_MAX_BYTES).maxBytes).toBe(IMAGE_MAX_BYTES);
    expect(() => validateUpload("image/png", IMAGE_MAX_BYTES + 1)).toThrow(PayloadTooLargeError);
    expect(validateUpload("application/pdf", DOCUMENT_MAX_BYTES).maxBytes).toBe(DOCUMENT_MAX_BYTES);
    expect(() => validateUpload("application/pdf", DOCUMENT_MAX_BYTES + 1)).toThrow(
      PayloadTooLargeError,
    );
  });

  it("rejects a size that is not a positive integer", () => {
    expect(() => validateUpload("image/png", 0)).toThrow(InvalidPayloadError);
    expect(() => validateUpload("image/png", -1)).toThrow(InvalidPayloadError);
    expect(() => validateUpload("image/png", 1.5)).toThrow(InvalidPayloadError);
    expect(() => validateUpload("image/png", Number.NaN)).toThrow(InvalidPayloadError);
  });

  it("creates a club and use-case scoped key", () => {
    const clubId = "6fa99409-3515-4253-88a1-5dad321ef573";
    const logo = createObjectKey(clubId, "logo", "image/png");
    expect(logo.startsWith(`${clubId}/r2/logos/`)).toBe(true);
    expect(logo.endsWith(".png")).toBe(true);
    expect(createObjectKey(clubId, "course-map", "image/webp")).toContain("/r2/course-maps/");
    expect(createObjectKey(clubId, "document", "application/pdf")).toContain("/r2/documents/");
  });

  it("rejects an unsafe club id", () => {
    expect(() => createObjectKey("../other", "logo", "image/png")).toThrow(InvalidStorageKeyError);
  });
});

describe("presigned uploads and downloads", () => {
  it("signs a PUT with the content type and expiry", async () => {
    const result = await createPresignedUpload("club/r2/logos/a.png", "image/png", {
      bytes: 100,
    });

    expect(result.expiresIn).toBe(900);
    expect(result.method).toBe("PUT");
    expect(result.key).toBe("club/r2/logos/a.png");
    expect(result.headers).toEqual({ "Content-Type": "image/png" });
    const url = new URL(result.uploadUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://account-id.r2.cloudflarestorage.com/golf-media/club/r2/logos/a.png",
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-Signature")).toBe("test-signature");

    const request = signMock.mock.calls[0]?.[0] as Request;
    const init = signMock.mock.calls[0]?.[1] as { aws?: { signQuery?: boolean } };
    expect(request.method).toBe("PUT");
    expect(request.headers.get("content-type")).toBe("image/png");
    expect(init.aws).toEqual({ signQuery: true });
  });

  it("rejects an oversized payload before signing", async () => {
    await expect(
      createPresignedUpload("club/r2/logos/a.png", "image/png", {
        bytes: IMAGE_MAX_BYTES + 1,
      }),
    ).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(signMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported type before signing", async () => {
    await expect(
      createPresignedUpload("club/r2/logos/a.gif", "image/gif", { bytes: 10 }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeError);
    expect(signMock).not.toHaveBeenCalled();
  });

  it("signs a GET with a custom expiry", async () => {
    const signed = await createPresignedDownload("club/r2/documents/report.pdf", 300);
    expect(signed.method).toBe("GET");
    expect(signed.key).toBe("club/r2/documents/report.pdf");
    expect(signed.expiresIn).toBe(300);
    const parsed = new URL(signed.url);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBe("test-signature");

    const request = signMock.mock.calls[0]?.[0] as Request;
    expect(request.method).toBe("GET");
  });
});

describe("public and signed read URLs", () => {
  it("builds a public URL only when R2_PUBLIC_URL is configured", () => {
    expect(publicObjectUrl("club/r2/logos/a.png")).toBeNull();
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com/");
    expect(publicObjectUrl("club/r2/logos/a b.png")).toBe(
      "https://cdn.example.com/club/r2/logos/a%20b.png",
    );
  });

  it("selects the public URL only when the caller asks for it", async () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
    const result = await objectReadUrl("club/r2/logos/a.png", { visibility: "public" });
    expect(result).toEqual({
      url: "https://cdn.example.com/club/r2/logos/a.png",
      visibility: "public",
    });
    expect(signMock).not.toHaveBeenCalled();
  });

  it("defaults to a signed URL", async () => {
    vi.stubEnv("R2_PUBLIC_URL", "https://cdn.example.com");
    const result = await objectReadUrl("club/r2/logos/a.png");
    expect(result.visibility).toBe("private");
    expect(result.url).toContain("X-Amz-Signature=test-signature");
  });

  it("refuses a public read when no public URL is configured", async () => {
    await expect(
      objectReadUrl("club/r2/logos/a.png", { visibility: "public" }),
    ).rejects.toBeInstanceOf(PublicUrlNotConfiguredError);
  });
});

describe("deleteObject", () => {
  it("sends one signed bucket request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await deleteObject("club/r2/logos/a.png");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const url = String(call?.[0]);
    const init = call?.[1] as RequestInit;
    expect(url).toContain("X-Amz-Signature=test-signature");
    expect(init.method).toBe("DELETE");
  });

  it("throws a typed error when the bucket refuses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteObject("club/r2/logos/a.png")).rejects.toBeInstanceOf(StorageRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsafe key before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteObject("../other/a.png")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
