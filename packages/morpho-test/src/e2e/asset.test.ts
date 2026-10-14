import { getChainAddresses } from "@morpho-org/blue-sdk";
import { ChainId } from "@morpho-org/morpho-ts";
import { hexToString, keccak256 } from "viem";
import { describe, expect, test } from "vitest";
import {
  E2E_ASSET,
  E2E_ASSET_BYTECODE,
  E2E_ASSET_STORAGE,
  getE2eAsset,
} from "./asset.js";

const shortStrings = [
  { value: E2E_ASSET_STORAGE[0]!.value, expected: "Wrapped Ether" },
  { value: E2E_ASSET_STORAGE[1]!.value, expected: "WETH" },
] as const;

describe("getE2eAsset", () => {
  test("uses the registered wrapped-native token when available", () => {
    const { wNative } = getChainAddresses(ChainId.EthMainnet);
    expect(wNative).toBeDefined();
    expect(getE2eAsset(ChainId.EthMainnet)).toStrictEqual({
      address: wNative,
      requiresInstall: false,
    });
  });

  test.each([ChainId.ArcMainnet, ChainId.TempoMainnet, ChainId.StableMainnet])(
    "uses the fork-installed asset on chain %i",
    (chainId) => {
      expect(getE2eAsset(chainId)).toStrictEqual({
        address: E2E_ASSET,
        requiresInstall: true,
      });
    },
  );
});

describe("E2E_ASSET_BYTECODE", () => {
  test("matches the canonical mainnet WETH9 runtime code hash", () => {
    expect(keccak256(E2E_ASSET_BYTECODE)).toBe(
      "0xd0a06b12ac47863b5c7be4185c2deaad1c61557033f56c7d4ea74429cbb25e23",
    );
  });
});

describe("E2E_ASSET_STORAGE", () => {
  test("stores name, symbol, and 18 decimals in slots 0, 1, and 2", () => {
    expect(
      E2E_ASSET_STORAGE.every(
        ({ slot, value }) => slot.length === 66 && value.length === 66,
      ),
    ).toBe(true);
    expect(E2E_ASSET_STORAGE.map(({ slot }) => BigInt(slot))).toStrictEqual([
      0n,
      1n,
      2n,
    ]);
    expect(BigInt(E2E_ASSET_STORAGE[2]!.value)).toBe(18n);
  });

  test.each(shortStrings)(
    "encodes $expected using Solidity short-string storage",
    ({ value, expected }) => {
      const length = Number.parseInt(value.slice(-2), 16) / 2;
      expect(hexToString(`0x${value.slice(2, 2 + length * 2)}`)).toBe(expected);
    },
  );
});
