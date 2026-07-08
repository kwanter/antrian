import { describe, expect, it, afterEach } from "vitest";
import { cn, resolveBackendUrl } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and dedupes tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "text-lg", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("resolveBackendUrl", () => {
  const originalEnv = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    }
  });

  it("defaults to localhost backend root when env unset", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(resolveBackendUrl("/storage/tts/abc.wav")).toBe(
      "http://localhost:8000/storage/tts/abc.wav"
    );
  });

  it("strips /api/v1 suffix with trailing slash", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://antrian.example.test/api/v1/";
    expect(resolveBackendUrl("/storage/tts/abc.wav")).toBe(
      "https://antrian.example.test/storage/tts/abc.wav"
    );
  });

  it("strips /api/v1 suffix without trailing slash", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://antrian.example.test/api/v1";
    expect(resolveBackendUrl("/storage/tts/abc.wav")).toBe(
      "https://antrian.example.test/storage/tts/abc.wav"
    );
  });

  it("preserves arbitrary paths on the backend root", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.test/some/prefix/api/v1";
    expect(resolveBackendUrl("/storage/tts/abc.wav")).toBe(
      "https://api.example.test/some/prefix/storage/tts/abc.wav"
    );
  });
});
