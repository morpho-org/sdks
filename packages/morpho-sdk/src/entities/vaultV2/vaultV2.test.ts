import { MarketParams } from "@morpho-org/blue-sdk";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { WethUsdsBlue } from "../../../test/fixtures/blue.js";
import { KeyrockUsdcVaultV2 } from "../../../test/fixtures/vaultV2.js";
import { morphoViemExtension } from "../../client/index.js";
import { ChainIdMismatchError } from "../../types/index.js";

describe("MorphoVaultV2 chain validation", () => {
  test("getData throws ChainIdMismatchError when client chain differs", async () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("error: ChainIdMismatchError when the client has no chain", async () => {
    const publicClient = createPublicClient({
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);

    await expect(vault.getData()).rejects.toThrow(ChainIdMismatchError);
  });

  test("deposit throws ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    expect(() =>
      vault.deposit({
        amount: 1n,
        userAddress: KeyrockUsdcVaultV2.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
  });

  test("withdraw, redeem, forceWithdraw, and forceRedeem throw ChainIdMismatchError when client chain differs", () => {
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });
    const vault = publicClient
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id + 1);

    expect(() =>
      vault.withdraw({
        amount: 1n,
        userAddress: KeyrockUsdcVaultV2.address,
        vaultData: {} as never,
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.redeem({ shares: 1n, userAddress: KeyrockUsdcVaultV2.address }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.forceWithdraw({
        exitAssets: 1n,
        vaultData: {} as never,
        userAddress: KeyrockUsdcVaultV2.address,
      }),
    ).toThrow(ChainIdMismatchError);
    expect(() =>
      vault.forceRedeem({
        deallocations: [],
        redeem: { shares: 1n },
        userAddress: KeyrockUsdcVaultV2.address,
      }),
    ).toThrow(ChainIdMismatchError);
  });
});

describe("MorphoVaultV2.forceRedeem", () => {
  test("copies inputs when creating a handle", () => {
    const vault = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    })
      .extend(morphoViemExtension())
      .morpho.vaultV2(KeyrockUsdcVaultV2.address, mainnet.id);
    const firstDeallocation = {
      adapter: KeyrockUsdcVaultV2.address,
      marketParams: new MarketParams(WethUsdsBlue),
      amount: 10n,
    };
    const deallocations = [firstDeallocation];
    const redeem = { shares: 5n };
    const handle = vault.forceRedeem({
      deallocations,
      redeem,
      userAddress: KeyrockUsdcVaultV2.address,
    });
    const before = handle.buildTx();

    firstDeallocation.amount = 99n;
    (firstDeallocation.marketParams as { lltv: bigint }).lltv =
      945_000_000_000_000_000n;
    expect(handle.buildTx().data).toBe(before.data);
    firstDeallocation.marketParams = new MarketParams({
      ...WethUsdsBlue,
      lltv: 945_000_000_000_000_000n,
    });
    deallocations.push({
      adapter: KeyrockUsdcVaultV2.address,
      marketParams: new MarketParams(WethUsdsBlue),
      amount: 1n,
    });
    redeem.shares = 77n;

    expect(handle.buildTx().data).toBe(before.data);
  });
});
