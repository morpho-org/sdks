import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
import {
  midnightAdapterAbi,
  midnightAdapterFactoryAbi,
  vaultV2Abi,
} from "@morpho-org/morpho-ts/abis";
import { getErpcForkUrl } from "@morpho-org/test";
import {
  advanceVaultV2MidnightFixtureTime,
  BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  createVaultV2MidnightAdapterFixture,
  MAX_MIDNIGHT_ADAPTER_MARKETS,
  takeVaultV2MidnightAdapterOffer,
  testAccount,
} from "@morpho-org/test/fixtures";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  concatHex,
  encodeAbiParameters,
  erc20Abi,
  keccak256,
  maxUint128,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "../src/index.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  redactForkUrl: true,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const setterRatifier = getChainAddress(ChainId.BaseMainnet, "setterRatifier");
const oracle = "0x0000000000000000000000000000000000080000";
const offerMaker = testAccount(1);
const units = parseUnits("1", 6);

const market = new MarketParams({
  chainId: base.id,
  midnight,
  loanToken: usdc,
  collateralParams: [
    {
      token: wNative,
      lltv: 770000000000000000n,
      liquidationCursor: 300000000000000000n,
      oracle,
    },
  ],
  maturity: 2_000_000_000n,
  rcfThreshold: 0n,
  enterGate: zeroAddress,
  liquidatorGate: zeroAddress,
});

describe("Vault V2 Midnight adapter funding on Base", () => {
  test("takes a ratified borrower offer into the adapter", async ({
    client,
  }) => {
    const { vault, adapters, durations } =
      await createVaultV2MidnightAdapterFixture({
        client,
        asset: usdc,
        salts: [
          padHex(toHex(3n), { size: 32 }),
          padHex(toHex(4n), { size: 32 }),
        ],
        markets: [market],
      });
    expect(durations).toEqual([
      86_400n,
      604_800n,
      2_592_000n,
      7_776_000n,
      15_552_000n,
    ]);
    const firstAdapter = adapters[0];
    const secondAdapter = adapters[1];
    if (firstAdapter === undefined || secondAdapter === undefined) {
      throw new Error("Expected two adapters");
    }
    expect(firstAdapter.address).not.toBe(secondAdapter.address);
    const adapter = firstAdapter.address;
    const factory = getChainAddress(
      ChainId.BaseMainnet,
      "midnightAdapterFactory",
    );
    for (const { address, salt } of adapters) {
      await expect(
        client.readContract({
          address: factory,
          abi: midnightAdapterFactoryAbi,
          functionName: "isMidnightAdapter",
          args: [address],
        }),
      ).resolves.toBe(true);
      await expect(
        client.readContract({
          address: factory,
          abi: midnightAdapterFactoryAbi,
          functionName: "midnightAdapter",
          args: [vault, salt],
        }),
      ).resolves.toBe(address);
      const adapterId = await client.readContract({
        address,
        abi: midnightAdapterAbi,
        functionName: "adapterId",
      });
      expect(adapterId).toBe(
        keccak256(
          encodeAbiParameters(
            [{ type: "string" }, { type: "address" }],
            ["this", address],
          ),
        ),
      );
      await expect(
        client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "MAX_MARKETS",
        }),
      ).resolves.toBe(BigInt(MAX_MIDNIGHT_ADAPTER_MARKETS));
      await expect(
        client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "durations",
        }),
      ).resolves.toEqual(durations);
      await expect(
        client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "maxTtm",
        }),
      ).resolves.toBe(0xffff_ffff);
      await expect(
        client.readContract({
          address: vault,
          abi: vaultV2Abi,
          functionName: "isAllocator",
          args: [address],
        }),
      ).resolves.toBe(true);

      const durationIds = durations.map((duration) =>
        keccak256(
          encodeAbiParameters(
            [{ type: "string" }, { type: "address" }, { type: "uint256" }],
            ["duration", address, duration],
          ),
        ),
      );
      const marketIds = await client.readContract({
        address,
        abi: midnightAdapterAbi,
        functionName: "ids",
        args: [MarketUtils.toStruct(market)],
      });
      for (const id of [adapterId, ...durationIds, ...marketIds]) {
        await expect(
          client.readContract({
            address: vault,
            abi: vaultV2Abi,
            functionName: "absoluteCap",
            args: [id],
          }),
        ).resolves.toBe(maxUint128);
        await expect(
          client.readContract({
            address: vault,
            abi: vaultV2Abi,
            functionName: "relativeCap",
            args: [id],
          }),
        ).resolves.toBe(10n ** 18n);
      }
    }

    const collateralAssets = parseEther("10");
    await client.setBalance({
      address: offerMaker.address,
      value: parseEther("1"),
    });
    await client.deal({
      erc20: wNative,
      account: offerMaker.address,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: offerMaker,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    await client.writeContract({
      account: offerMaker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [
        MarketUtils.toStruct(market),
        0n,
        collateralAssets,
        offerMaker.address,
      ],
    });
    await client.writeContract({
      account: offerMaker,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [setterRatifier, true, offerMaker.address],
    });

    const tree = Tree.create([
      Offer.create({
        market,
        buy: false,
        maker: offerMaker.address,
        expiry: market.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: units,
      }),
    ]);
    await client.writeContract({
      account: offerMaker,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [offerMaker.address, tree.root, true],
    });
    const item = SetterRatifierUtils.ratify({ tree })[0];
    if (item === undefined) throw new Error("Expected a ratified offer");

    const vaultAssets = parseUnits("2", 6);
    await client.deal({ erc20: usdc, amount: vaultAssets });
    await client.approve({
      address: usdc,
      args: [vault, vaultAssets],
    });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [vaultAssets, client.account.address],
    });
    await takeVaultV2MidnightAdapterOffer({
      client,
      adapter,
      args: [
        OfferUtils.toStruct({ offer: item.offer }),
        item.ratifierData,
        units,
        "0x",
      ],
    });

    await expect(
      client.readContract({
        address: adapter,
        abi: midnightAdapterAbi,
        functionName: "marketIdsLength",
      }),
    ).resolves.toBe(1n);
    const [position] = await client.readContract({
      address: adapter,
      abi: midnightAdapterAbi,
      functionName: "marketData",
      args: [MarketUtils.toId(market)],
    });
    expect(position).toBeGreaterThan(0n);
    const timestampBefore = await client.timestamp();
    await advanceVaultV2MidnightFixtureTime({ client, seconds: 86_400n });
    expect(await client.timestamp()).toBeGreaterThanOrEqual(
      timestampBefore + 86_400n,
    );
  });

  test("supports custom Vault V2 salts", async ({ client }) => {
    const adapterSalt = padHex(toHex(5n), { size: 32 });
    const defaultSaltFixture = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      salts: [adapterSalt],
    });
    const customSaltFixture = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      vaultSalt: padHex(toHex(1n), { size: 32 }),
      salts: [adapterSalt],
    });
    expect(defaultSaltFixture.vault).not.toBe(customSaltFixture.vault);

    const factory = getChainAddress(
      ChainId.BaseMainnet,
      "midnightAdapterFactory",
    );
    for (const fixture of [defaultSaltFixture, customSaltFixture]) {
      const adapter = fixture.adapters[0];
      if (adapter === undefined) throw new Error("Expected an adapter");
      await expect(
        client.readContract({
          address: factory,
          abi: midnightAdapterFactoryAbi,
          functionName: "midnightAdapter",
          args: [fixture.vault, adapterSalt],
        }),
      ).resolves.toBe(adapter.address);
    }
  });
});
