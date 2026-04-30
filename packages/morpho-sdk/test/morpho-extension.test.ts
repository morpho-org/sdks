import { mainnet } from "viem/chains";
import { describe, expect } from "vitest";
import { morphoViemExtension } from "../src/client/index.js";
import { test } from "./setup.js";

describe("Morpho viem extension", () => {
  test("should extend viem client with morpho namespace", ({ client }) => {
    const extendedClient = client.extend(morphoViemExtension());

    expect(extendedClient).toBeDefined();
    expect(extendedClient.morpho).toBeDefined();
    expect(extendedClient.morpho.vaultV2).toBeDefined();
    expect(typeof extendedClient.morpho.vaultV2).toBe("function");
  });

  test("should allow accessing vaultV2 through morpho namespace", ({
    client,
  }) => {
    const extendedClient = client.extend(morphoViemExtension());

    const vault = extendedClient.morpho.vaultV2(
      "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145",
      mainnet.id,
    );

    expect(vault).toBeDefined();
    expect(vault.getData).toBeDefined();
    expect(vault.deposit).toBeDefined();
    expect(vault.withdraw).toBeDefined();
    expect(vault.redeem).toBeDefined();
  });

  test("should accept metadata parameter", ({ client }) => {
    const metadata = { origin: "test" };
    const extendedClient = client.extend(morphoViemExtension({ metadata }));

    expect(extendedClient.morpho).toBeDefined();
    expect(extendedClient.morpho.vaultV2).toBeDefined();
  });
});
