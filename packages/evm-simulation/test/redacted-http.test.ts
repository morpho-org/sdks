import { createPublicClient } from "viem";
import { afterEach, describe, expect, test, vi } from "vitest";
import { redactedHttp } from "./redacted-http.js";

afterEach(() => vi.unstubAllGlobals());

describe("redactedHttp", () => {
  test("forwards successful RPC responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" }),
      ),
    );
    const client = createPublicClient({
      transport: redactedHttp("https://rpc.example?secret=test-credential"),
    });
    expect(await client.getBlockNumber()).toBe(1n);
  });

  test.each(["transport", "http", "rpc"])(
    "withholds endpoint and credential details after a %s failure",
    async (kind) => {
      const url = "https://rpc.example?secret=test-credential";
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          if (kind === "transport") throw new Error(`Unavailable: ${url}`);
          if (kind === "http")
            return new Response(`Unavailable: ${url}`, { status: 503 });
          return Response.json({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32000, message: `Unavailable: ${url}` },
          });
        }),
      );
      const client = createPublicClient({ transport: redactedHttp(url) });
      const error = await client
        .getBlockNumber()
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("endpoint details withheld");
      const seen = new Set<unknown>();
      let current: unknown = error;
      while (current != null) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        const details = [
          String(current),
          JSON.stringify(current),
          current instanceof Error ? current.stack : undefined,
        ].join("\n");
        expect(details).not.toContain("test-credential");
        expect(details).not.toContain("rpc.example");
        current =
          typeof current === "object" && "cause" in current
            ? current.cause
            : undefined;
      }
    },
  );
});
