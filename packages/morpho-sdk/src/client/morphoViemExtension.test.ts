import { MarketParams } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { CbbtcUsdcMarketV1 } from "../../test/fixtures/marketV1.js";
import { MarketIdMismatchError } from "../types/index.js";
import { morphoViemExtension } from "./morphoViemExtension.js";

const publicClient = () =>
  createPublicClient({
    chain: mainnet,
    transport: http("http://localhost"),
  });

describe("morphoViemExtension", () => {
  test("default", () => {
    const client = publicClient().extend(morphoViemExtension());

    expect(client.morpho).toBeDefined();
    expect(client.morpho.viemClient).toBeDefined();
    expect(typeof client.morpho.vaultV1).toBe("function");
    expect(typeof client.morpho.vaultV2).toBe("function");
    expect(typeof client.morpho.marketV1).toBe("function");
  });

  test("behavior: factories return entities bound to the same client", () => {
    const client = publicClient().extend(morphoViemExtension());

    const vault = client.morpho.vaultV2(
      "0x04422053aDDbc9bB2759b248B574e3FCA76Bc145",
      mainnet.id,
    );

    expect(vault).toBeDefined();
    expect(vault.getData).toBeDefined();
    expect(vault.deposit).toBeDefined();
    expect(vault.withdraw).toBeDefined();
    expect(vault.redeem).toBeDefined();
  });

  test("behavior: options default supportSignature to false", () => {
    const client = publicClient().extend(morphoViemExtension());

    expect(client.morpho.options.supportSignature).toBe(false);
  });

  test("behavior: forwards options to the morpho namespace", () => {
    const metadata = { origin: "test" };
    const client = publicClient().extend(
      morphoViemExtension({ supportSignature: true, metadata }),
    );

    expect(client.morpho.options.supportSignature).toBe(true);
    expect(client.morpho.options.metadata).toEqual(metadata);
  });

  test("behavior: the resolved options bag is frozen", () => {
    const client = publicClient().extend(
      morphoViemExtension({ metadata: { origin: "test" } }),
    );

    expect(Object.isFrozen(client.morpho.options)).toBe(true);
    expect(Object.isFrozen(client.morpho.options.metadata)).toBe(true);
  });

  test("error: MarketIdMismatchError", () => {
    const client = publicClient().extend(morphoViemExtension());
    const marketParams = new MarketParams(CbbtcUsdcMarketV1);
    Object.defineProperty(marketParams, "id", {
      value: `0x${"00".repeat(32)}`,
    });

    expect(() => client.morpho.marketV1(marketParams, mainnet.id)).toThrow(
      MarketIdMismatchError,
    );
  });
});
