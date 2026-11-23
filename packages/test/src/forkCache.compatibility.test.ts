import { describe, expect, test, vi } from "vitest";

const { probe } = vi.hoisted(() => ({ probe: vi.fn() }));

vi.mock("node:zlib", () => ({
  get zstdCompressSync() {
    probe();
    return undefined;
  },
  zstdDecompressSync: undefined,
}));

import { isolateForkCache } from "./forkCache.js";

describe("isolateForkCache", () => {
  test("behavior: loads without zstd exports and falls back to the shared cache", async () => {
    expect(probe).not.toHaveBeenCalled();
    await expect(isolateForkCache()).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledOnce();
  });
});
