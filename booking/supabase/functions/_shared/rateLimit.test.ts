import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractClientIp } from "./rateLimit.ts";

// ---- extractClientIp --------------------------------------------------

Deno.test("extractClientIp: x-forwarded-for の先頭値を使う", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.1, 10.0.0.1" },
  });
  assertEquals(extractClientIp(req), "203.0.113.1");
});

Deno.test("extractClientIp: 前後の空白を取り除く", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "  203.0.113.1  , 10.0.0.1" },
  });
  assertEquals(extractClientIp(req), "203.0.113.1");
});

Deno.test("extractClientIp: 単一値でもそのまま使う", () => {
  const req = new Request("https://example.com", {
    headers: { "x-forwarded-for": "203.0.113.1" },
  });
  assertEquals(extractClientIp(req), "203.0.113.1");
});

Deno.test("extractClientIp: ヘッダーが無ければ unknown にフォールバック", () => {
  const req = new Request("https://example.com");
  assertEquals(extractClientIp(req), "unknown");
});
