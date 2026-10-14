import { ChainId, getChainAddress, MathLib } from "@morpho-org/blue-sdk";
import { midnightAdapterAbi, vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import {
  MarketUtils,
  MarketParams as MidnightMarketParams,
  midnightAbi,
  Offer,
  OfferUtils,
  SetterRatifierUtils,
  setterRatifierAbi,
  Tree,
} from "@morpho-org/midnight-sdk";
import { Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  advanceVaultV2MidnightFixtureTime,
  BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  createVaultV2MidnightAdapterFixture,
  takeVaultV2MidnightAdapterOffer,
  testAccount,
} from "@morpho-org/test/fixtures";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  encodeFunctionData,
  erc20Abi,
  type Hash,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  type ActionRequirement,
  InputExceedsMaxError,
  isRequirementApproval,
  morphoViemExtension,
  type Transaction,
  VaultV2SingleAdapterRequiredError,
  VaultV2UnsupportedExitAdapterError,
} from "../../../src/index.js";
import {
  deployMorphoMarketV1AdapterV2,
  submitAndAcceptVaultV2Call,
} from "../../helpers/vaultV2.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  redactForkUrl: true,
});

const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
const salt = (value: bigint): Hash => padHex(toHex(value), { size: 32 });

/** Creates a Vault V2 holding one Midnight adapter and one MorphoMarketV1AdapterV2. */
const setUpMixedVault = async (
  client: AnvilTestClient<typeof base>,
  markets?: readonly MidnightMarketParams[],
) => {
  const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
    client,
    asset: usdc,
    salts: [salt(1n)],
    markets,
  });
  const blueAdapter = await deployMorphoMarketV1AdapterV2(
    client as AnvilTestClient,
    vault,
  );
  await submitAndAcceptVaultV2Call(client as AnvilTestClient, {
    vault,
    data: encodeFunctionData({
      abi: vaultV2Abi,
      functionName: "addAdapter",
      args: [blueAdapter],
    }),
  });

  return { vault, midnightAdapter: adapters[0]!.address };
};

const vaultEntity = (client: AnvilTestClient<typeof base>, vault: Address) =>
  client.extend(morphoViemExtension()).morpho.vaultV2(vault, base.id);

const execute = async (
  client: AnvilTestClient<typeof base>,
  action: {
    readonly getRequirements: () => Promise<readonly ActionRequirement[]>;
    readonly buildTx: () => Transaction;
  },
) => {
  for (const requirement of await action.getRequirements()) {
    if (!isRequirementApproval(requirement))
      throw new Error(`Unexpected requirement "${requirement.action.type}"`);
    await client.sendTransaction(requirement);
  }
  await client.sendTransaction(action.buildTx());
};

describe("MorphoVaultV2 on a vault holding a Midnight adapter", () => {
  test("default: deposit, withdraw and redeem on a Blue + Midnight vault match the preview", async ({
    client,
  }) => {
    const { vault } = await setUpMixedVault(client);
    const entity = vaultEntity(client, vault);
    const userAddress = client.account.address;
    const amount = parseUnits("100", 6);
    await client.deal({ erc20: usdc, amount });

    const vaultData = await entity.getData();
    expect(vaultData.accrualAdapters.map(({ type }) => type).sort()).toEqual([
      "VaultV2MidnightAdapter",
      "VaultV2MorphoMarketV1AdapterV2",
    ]);
    await execute(client, entity.deposit({ amount, userAddress, vaultData }));
    const { timestamp } = await client.getBlock();
    expect(await client.balanceOf({ erc20: vault })).toBe(
      vaultData.accrueInterest(timestamp).vault.toShares(amount),
    );

    const withdrawn = parseUnits("40", 6);
    await execute(
      client,
      entity.withdraw({
        amount: withdrawn,
        userAddress,
        vaultData: await entity.getData(),
      }),
    );
    expect(await client.balanceOf({ erc20: usdc })).toBe(withdrawn);

    const shares = await client.balanceOf({ erc20: vault });
    const redeemedAssets = (await entity.getData()).toAssets(shares);
    await execute(client, entity.redeem({ shares, userAddress }));
    expect(await client.balanceOf({ erc20: vault })).toBe(0n);
    expect(await client.balanceOf({ erc20: usdc })).toBe(
      withdrawn + redeemedAssets,
    );
  });

  test("behavior: the previewed share price matches onchain after Midnight credit accrues", async ({
    client,
  }) => {
    const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
    const setterRatifier = getChainAddress(
      ChainId.BaseMainnet,
      "setterRatifier",
    );
    const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
    const oracle = "0x0000000000000000000000000000000000080000";
    const market = new MidnightMarketParams({
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
      maturity: 1_800_000_000n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const { vault, midnightAdapter } = await setUpMixedVault(client, [market]);
    const entity = vaultEntity(client, vault);
    const userAddress = client.account.address;
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setMaxRate",
      args: [MathLib.WAD / Time.s.from.y(1n)],
    });
    const amount = parseUnits("100", 6);
    await client.deal({ erc20: usdc, amount: 2n * amount });
    await execute(
      client,
      entity.deposit({
        amount,
        userAddress,
        vaultData: await entity.getData(),
      }),
    );

    // A maker sells 50 USDC of fixed-rate credit, which the adapter buys from the vault's idle assets.
    const maker = testAccount(1);
    const collateral = parseEther("10");
    await client.setBalance({ address: maker.address, value: parseEther("1") });
    await client.deal({
      erc20: wNative,
      account: maker.address,
      amount: collateral,
    });
    await client.writeContract({
      account: maker,
      address: wNative,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateral],
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
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateral, maker.address],
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [setterRatifier, true, maker.address],
    });
    const units = parseUnits("50", 6);
    const tree = Tree.create([
      Offer.create({
        market,
        buy: false,
        maker: maker.address,
        expiry: market.maturity,
        tick: 5_000n,
        ratifier: setterRatifier,
        maxUnits: units,
      }),
    ]);
    await client.writeContract({
      account: maker,
      address: setterRatifier,
      abi: setterRatifierAbi,
      functionName: "setIsRootRatified",
      args: [maker.address, tree.root, true],
    });
    const item = SetterRatifierUtils.ratify({ tree })[0]!;
    await takeVaultV2MidnightAdapterOffer({
      client,
      adapter: midnightAdapter,
      args: [
        OfferUtils.toStruct({ offer: item.offer }),
        item.ratifierData,
        units,
        "0x",
      ],
    });

    const vaultData = await entity.getData();
    expect(vaultData.assetBalance).toBeLessThan(amount);
    await advanceVaultV2MidnightFixtureTime({
      client,
      seconds: Time.s.from.d(1n),
    });
    const sharesBefore = await client.balanceOf({ erc20: vault });
    // The SDK checks the deadline against the wall clock, the chain against the block timestamp.
    const chainNow = await client.timestamp();
    const wallNow = Time.timestamp();
    await execute(
      client,
      entity.deposit({
        amount,
        userAddress,
        vaultData,
        deadline: (chainNow > wallNow ? chainNow : wallNow) + Time.s.from.h(2n),
      }),
    );

    const accrued = vaultData.accrueInterest(
      (await client.getBlock()).timestamp,
    ).vault;
    expect(accrued._totalAssets).toBeGreaterThan(vaultData._totalAssets);
    expect(
      await client.readContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "totalAssets",
      }),
    ).toBe(accrued._totalAssets + amount);
    expect((await client.balanceOf({ erc20: vault })) - sharesBefore).toBe(
      accrued.toShares(amount),
    );
  });

  test("error: InputExceedsMaxError before submission through a Midnight liquidity adapter", async ({
    client,
  }) => {
    const { vault, midnightAdapter } = await setUpMixedVault(client);
    const entity = vaultEntity(client, vault);
    const userAddress = client.account.address;
    const idle = parseUnits("10", 6);
    await client.deal({ erc20: usdc, amount: 2n * idle });
    await client.approve({ address: usdc, args: [vault, 2n * idle] });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [idle, userAddress],
    });
    await client.writeContract({
      address: vault,
      abi: vaultV2Abi,
      functionName: "setLiquidityAdapterAndData",
      args: [midnightAdapter, "0x"],
    });

    await expect(
      client.simulateContract({
        address: vault,
        abi: [
          ...vaultV2Abi,
          ...midnightAdapterAbi.filter(({ type }) => type === "error"),
        ],
        functionName: "deposit",
        args: [idle, userAddress],
      }),
    ).rejects.toThrow("SelfAllocationOnly");

    const vaultData = await entity.getData();
    expect(vaultData.accrualLiquidityAdapter?.type).toBe(
      "VaultV2MidnightAdapter",
    );
    expect(() =>
      entity.deposit({ amount: idle, userAddress, vaultData }),
    ).toThrow(InputExceedsMaxError);
    expect(() =>
      entity.withdraw({ amount: idle + 1n, userAddress, vaultData }),
    ).toThrow(InputExceedsMaxError);
    const shares = await client.balanceOf({ erc20: vault });
    await expect(
      entity.redeem({ shares: 2n * shares, userAddress }).getRequirements(),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    // Exits within idle assets never call the Midnight adapter.
    const withdrawn = idle / 2n;
    await execute(
      client,
      entity.withdraw({ amount: withdrawn, userAddress, vaultData }),
    );
    expect(await client.balanceOf({ erc20: usdc })).toBe(idle + withdrawn);
  });

  test("error: exits reject Blue + Midnight and sole-Midnight vaults", async ({
    client,
  }) => {
    const userAddress = client.account.address;
    const { vault: mixedVault } = await setUpMixedVault(client);
    const { vault: midnightVault } = await createVaultV2MidnightAdapterFixture({
      client,
      asset: usdc,
      vaultSalt: salt(2n),
      salts: [salt(3n)],
    });

    for (const [vault, error] of [
      [mixedVault, VaultV2SingleAdapterRequiredError],
      [midnightVault, VaultV2UnsupportedExitAdapterError],
    ] as const) {
      const entity = vaultEntity(client, vault);
      const vaultData = await entity.getData();
      expect(() =>
        entity.inKindRedeem({
          amount: 1n,
          marketParamsList: [],
          vaultData,
          userAddress,
        }),
      ).toThrow(error);
      expect(() =>
        entity.forceWithdraw({ exitAssets: 1n, vaultData, userAddress }),
      ).toThrow(error);
    }
  });
});
