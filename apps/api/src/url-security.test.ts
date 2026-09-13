import { describe, expect, it } from "vitest";
import { assertSafeUrl } from "./url-security";

describe("assertSafeUrl", () => {
  it("allows a normal HTTPS URL", async () => {
    await expect(
      assertSafeUrl("https://example.com/api/jobs"),
    ).resolves.toBeInstanceOf(URL);
  });

  it("rejects localhost", async () => {
    await expect(
      assertSafeUrl("http://localhost:4000"),
    ).rejects.toThrow();
  });

  it("rejects loopback IPv4", async () => {
    await expect(
      assertSafeUrl("http://127.0.0.1:4000"),
    ).rejects.toThrow();
  });

  it("rejects private IPv4", async () => {
    await expect(
      assertSafeUrl("http://192.168.1.10"),
    ).rejects.toThrow();
  });

  it("rejects another private IPv4 range", async () => {
    await expect(
      assertSafeUrl("http://10.0.0.5"),
    ).rejects.toThrow();
  });

  it("rejects loopback IPv6", async () => {
    await expect(
      assertSafeUrl("http://[::1]:4000"),
    ).rejects.toThrow();
  });

  it("rejects URLs containing credentials", async () => {
    await expect(
      assertSafeUrl("https://user:password@example.com"),
    ).rejects.toThrow();
  });

  it("rejects non-HTTP protocols", async () => {
    await expect(
      assertSafeUrl("file:///etc/passwd"),
    ).rejects.toThrow();
  });

  it("rejects .local hostnames", async () => {
    await expect(
      assertSafeUrl("http://service.local"),
    ).rejects.toThrow();
  });
});