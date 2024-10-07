import { describe, expect } from "vitest";

import { ChainId } from "@morpho-org/blue-sdk";
import { renderHook } from "@morpho-org/test";
import { useChainId } from "../../src/index.js";
import { test } from "./setup.js";

describe("useChainId", () => {
  test("should render", async ({ config }) => {
    const { result } = await renderHook(config, () => useChainId());

    expect(result.current).toEqual(ChainId.EthMainnet);
  });
});
