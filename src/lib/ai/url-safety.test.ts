import { describe, expect, it } from "vitest";
import {
  chatCompletionsUrl,
  checkProviderBaseUrl,
  isPrivateIpv4,
  isPrivateIpv6,
} from "./url-safety";

describe("private address detection", () => {
  it("recognises the IPv4 ranges a provider URL must never reach", () => {
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("10.1.2.3")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("172.31.255.255")).toBe(true);
    expect(isPrivateIpv4("192.168.1.10")).toBe(true);
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("100.64.0.1")).toBe(true);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateIpv4("not-an-address")).toBe(false);
  });

  it("recognises loopback and unique-local IPv6, including IPv4-mapped forms", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("fe80::1")).toBe(true);
    expect(isPrivateIpv6("fd00::1")).toBe(true);
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:7f00:1")).toBe(true);
    expect(isPrivateIpv6("2606:4700::1111")).toBe(false);
  });
});

describe("the provider base URL guard", () => {
  it("accepts a public https URL and removes the trailing slash", () => {
    const checked = checkProviderBaseUrl("https://api.example.test/v1/");
    expect(checked).toEqual({ ok: true, url: "https://api.example.test/v1" });
  });

  it("refuses plain http", () => {
    expect(checkProviderBaseUrl("http://api.example.test/v1").ok).toBe(false);
  });

  it("refuses credentials, fragments and local hosts", () => {
    expect(checkProviderBaseUrl("https://user:pass@api.example.test/v1").ok).toBe(false);
    expect(checkProviderBaseUrl("https://api.example.test/v1#frag").ok).toBe(false);
    expect(checkProviderBaseUrl("https://localhost:3000/v1").ok).toBe(false);
    expect(checkProviderBaseUrl("https://metadata.internal/v1").ok).toBe(false);
    expect(checkProviderBaseUrl("https://169.254.169.254/latest").ok).toBe(false);
    expect(checkProviderBaseUrl("https://[::1]/v1").ok).toBe(false);
  });

  it("refuses an empty or oversized value", () => {
    expect(checkProviderBaseUrl("   ").ok).toBe(false);
    expect(checkProviderBaseUrl(`https://api.example.test/${"x".repeat(400)}`).ok).toBe(false);
  });
});

describe("the chat-completions endpoint", () => {
  it("joins the base URL without doubling a slash", () => {
    expect(chatCompletionsUrl("https://api.example.test/v1")).toBe(
      "https://api.example.test/v1/chat/completions",
    );
    expect(chatCompletionsUrl("https://api.example.test/v1/")).toBe(
      "https://api.example.test/v1/chat/completions",
    );
  });
});
