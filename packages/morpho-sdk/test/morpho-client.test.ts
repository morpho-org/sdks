import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { UnsupportedChainError } from "../src/index.js";
import { morphoFromTestClient } from "./helpers/morphoTestClient.js";
import { test } from "./setup.js";

describe("MorphoClient", () => {
  test("should create a morpho client", ({ client }) => {
    const morpho = morphoFromTestClient(client);

    expect(morpho).toBeDefined();
    expect(morpho.config).toBeDefined();
    expect(morpho.config.transports[mainnet.id]).toBeDefined();
    expect(morpho.vaultV2).toBeDefined();
    expect(typeof morpho.vaultV2).toBe("function");
  });

  test("getViemClient throws UnsupportedChainError for unconfigured chain", ({
    client,
  }) => {
    const morpho = morphoFromTestClient(client);

    expect(() => morpho.getViemClient(137)).toThrow(UnsupportedChainError);
  });
});
