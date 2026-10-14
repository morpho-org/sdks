import {
  type AccrualVaultV2,
  AccrualVaultV2MidnightAdapter,
  AccrualVaultV2MorphoVaultV1Adapter,
  addressesRegistry,
  type IAccrualVaultV2Adapter,
  MarketParams,
  MathLib,
} from "@morpho-org/blue-sdk";
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
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { type AnvilTestClient, getErpcForkUrl } from "@morpho-org/test";
import {
  BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  createVaultV2MidnightAdapterFixture,
  takeVaultV2MidnightAdapterOffer,
  testAccount,
} from "@morpho-org/test/fixtures";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  concatHex,
  erc20Abi,
  type Hex,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  fetchAccrualVaultV2,
  fetchVault,
  midnightAdapterAbi,
  morphoVaultV1AdapterFactoryAbi,
  vaultV2Abi,
} from "../src/index.js";
import { testTreehouseEth, vaultV2Test } from "./setup.js";
import {
  deployMorphoMarketV1Adapter,
  deployVaultV2,
  submitAndAccept,
} from "./utils.js";

// Far-future timestamp (> the Base fork block) used for deterministic interest accrual.
const ACCRUAL_TIMESTAMP = 2_000_000_000n;

// VaultV2 whose liquidity adapter wraps a MetaMorpho V1 vault (deepest adapter branch).
const vaultV2VaultV1 = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
// VaultV2 whose liquidity adapter is a MorphoMarketV1AdapterV2 (real caps and allocations).
const vaultV2MarketV1V2 = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";
const lostAssetsVaultV1 = "0x51056b3F809f4cFE17E1A8715B82f5dbbCA5a5A1";
const rejectingSharesGate = "0x1111111111111111111111111111111111111111";
const managementFeeRecipient = "0x2222222222222222222222222222222222222222";
const midnightAccrualTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  redactForkUrl: true,
});

const marketParams = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860000000000000000n,
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  oracle: "0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9",
});

function adapterIdentity(adapter: IAccrualVaultV2Adapter) {
  return {
    address: adapter.address,
    type: adapter.type,
    adapterId: adapter.adapterId,
    parentVault: adapter.parentVault,
    skimRecipient: adapter.skimRecipient,
  };
}

/**
 * Asserts that the value or thrown error class of two calls match. Used for `maxDeposit`, which
 * throws `VaultV2Errors.UnsupportedLiquidityAdapter` for a MorphoMarketV1 liquidity adapter in both
 * fetch paths.
 */
function expectSameOutcome<T>(actualFn: () => T, expectedFn: () => T) {
  let actualValue: T | undefined;
  let actualError: unknown;
  try {
    actualValue = actualFn();
  } catch (error) {
    actualError = error;
  }

  let expectedValue: T | undefined;
  let expectedError: unknown;
  try {
    expectedValue = expectedFn();
  } catch (error) {
    expectedError = error;
  }

  if (actualError !== undefined || expectedError !== undefined) {
    expect((actualError as Error)?.constructor).toBe(
      (expectedError as Error)?.constructor,
    );
    return;
  }

  expect(actualValue).toStrictEqual(expectedValue);
}

/**
 * Extracts the nested MetaMorpho V1 fields read by both fetch paths. Returns `undefined` for
 * non-`MorphoVaultV1` adapters, which have no nested vault.
 */
function vaultV1Fields(adapter: IAccrualVaultV2Adapter | undefined) {
  if (!(adapter instanceof AccrualVaultV2MorphoVaultV1Adapter))
    return undefined;
  const vault = adapter.accrualVaultV1;
  return {
    parentAllocation: adapter.parentAllocation,
    eip5267Domain: vault.eip5267Domain,
  };
}

/**
 * Asserts the deployless one-call reader is behaviourally identical to the multicall
 * (`deployless: false`) reader, including the nested MetaMorpho V1 vault's EIP-5267 domain.
 */
function expectEquivalent(actual: AccrualVaultV2, expected: AccrualVaultV2) {
  expect(actual.address).toBe(expected.address);
  expect(actual._totalAssets).toBe(expected._totalAssets);
  expect(actual.totalSupply).toBe(expected.totalSupply);
  expect(actual.virtualShares).toBe(expected.virtualShares);
  expect(actual.maxRate).toBe(expected.maxRate);
  expect(actual.lastUpdate).toBe(expected.lastUpdate);
  expect(actual.assetBalance).toBe(expected.assetBalance);
  expect(actual.liquidityAdapter).toBe(expected.liquidityAdapter);
  expect(actual.liquidityData).toBe(expected.liquidityData);
  expect(actual.liquidityAllocations).toStrictEqual(
    expected.liquidityAllocations,
  );
  expect(actual.performanceFee).toBe(expected.performanceFee);
  expect(actual.managementFee).toBe(expected.managementFee);
  expect(actual.performanceFeeRecipient).toBe(expected.performanceFeeRecipient);
  expect(actual.managementFeeRecipient).toBe(expected.managementFeeRecipient);
  expect(actual.performanceFeeRecipientCanReceiveShares).toBe(
    expected.performanceFeeRecipientCanReceiveShares,
  );
  expect(actual.managementFeeRecipientCanReceiveShares).toBe(
    expected.managementFeeRecipientCanReceiveShares,
  );
  expect(actual.forceDeallocatePenalties).toStrictEqual(
    expected.forceDeallocatePenalties,
  );

  expect(actual.accrualAdapters.map(adapterIdentity)).toStrictEqual(
    expected.accrualAdapters.map(adapterIdentity),
  );
  actual.accrualAdapters.forEach((adapter, i) => {
    expect(adapter.realAssets(ACCRUAL_TIMESTAMP)).toBe(
      expected.accrualAdapters[i]?.realAssets(ACCRUAL_TIMESTAMP),
    );
    expect(vaultV1Fields(adapter)).toStrictEqual(
      vaultV1Fields(expected.accrualAdapters[i]),
    );
  });

  expect(vaultV1Fields(actual.accrualLiquidityAdapter)).toStrictEqual(
    vaultV1Fields(expected.accrualLiquidityAdapter),
  );

  expect(
    actual.accrualLiquidityAdapter &&
      adapterIdentity(actual.accrualLiquidityAdapter),
  ).toStrictEqual(
    expected.accrualLiquidityAdapter &&
      adapterIdentity(expected.accrualLiquidityAdapter),
  );
  if (actual.accrualLiquidityAdapter && expected.accrualLiquidityAdapter)
    expect(actual.accrualLiquidityAdapter.realAssets(ACCRUAL_TIMESTAMP)).toBe(
      expected.accrualLiquidityAdapter.realAssets(ACCRUAL_TIMESTAMP),
    );

  for (const assets of [
    parseUnits("1", 6),
    parseUnits("1000000", 6),
    MathLib.MAX_UINT_256,
  ]) {
    expectSameOutcome(
      () => actual.maxDeposit(assets),
      () => expected.maxDeposit(assets),
    );
  }
  for (const shares of [parseUnits("1", 18), parseUnits("1000000", 18)]) {
    expectSameOutcome(
      () => actual.maxWithdraw(shares),
      () => expected.maxWithdraw(shares),
    );
  }

  const actualAccrual = actual.accrueInterest(ACCRUAL_TIMESTAMP);
  const expectedAccrual = expected.accrueInterest(ACCRUAL_TIMESTAMP);
  expect(actualAccrual.vault._totalAssets).toBe(
    expectedAccrual.vault._totalAssets,
  );
  expect(actualAccrual.vault.totalSupply).toBe(
    expectedAccrual.vault.totalSupply,
  );
  expect(actualAccrual.performanceFeeShares).toBe(
    expectedAccrual.performanceFeeShares,
  );
  expect(actualAccrual.managementFeeShares).toBe(
    expectedAccrual.managementFeeShares,
  );
}

describe("fetchAccrualVaultV2 deployless path", () => {
  vaultV2Test(
    "skips a reverting shares gate when both fees are zero",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(anvilClient, usdc);

      await client.setCode({
        address: rejectingSharesGate,
        bytecode: "0x60006000fd",
      });
      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setReceiveSharesGate",
        args: [rejectingSharesGate],
      });

      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2(vaultAddress, client),
        fetchAccrualVaultV2(vaultAddress, client, { deployless: false }),
      ]);

      expect(deployless.performanceFee).toBe(0n);
      expect(deployless.managementFee).toBe(0n);
      expect(deployless.performanceFeeRecipientCanReceiveShares).toBe(true);
      expect(deployless.managementFeeRecipientCanReceiveShares).toBe(true);
      expectEquivalent(deployless, multicall);
    },
  );

  vaultV2Test(
    "matches onchain accrual when fee recipients cannot receive shares",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(anvilClient, usdc);
      const depositedAssets = parseUnits("1000", 6);

      await client.deal({ erc20: usdc, amount: depositedAssets });
      await client.approve({
        address: usdc,
        args: [vaultAddress, depositedAssets],
      });
      await client.writeContract({
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [depositedAssets, client.account.address],
      });

      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setPerformanceFeeRecipient",
        args: [client.account.address],
      });
      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setManagementFeeRecipient",
        args: [managementFeeRecipient],
      });
      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setPerformanceFee",
        args: [parseUnits("10", 16)],
      });
      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setManagementFee",
        args: [parseUnits("5", 16) / Time.s.from.y(1n)],
      });
      await client.writeContract({
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setMaxRate",
        args: [MathLib.WAD / Time.s.from.y(1n)],
      });

      await submitAndAccept(anvilClient, {
        address: vaultAddress,
        abi: vaultV2Abi,
        functionName: "setReceiveSharesGate",
        args: [rejectingSharesGate],
      });

      await client.deal({
        erc20: usdc,
        account: vaultAddress,
        amount: parseUnits("1100", 6),
      });
      await client.setNextBlockTimestamp({ timestamp: ACCRUAL_TIMESTAMP });
      await client.mine({ blocks: 1 });
      const block = await client.getBlock({ blockTag: "latest" });

      const scenarios = [
        {
          rejectedRecipient: client.account.address,
          performanceFeeRecipientCanReceiveShares: false,
          managementFeeRecipientCanReceiveShares: true,
        },
        {
          rejectedRecipient: managementFeeRecipient,
          performanceFeeRecipientCanReceiveShares: true,
          managementFeeRecipientCanReceiveShares: false,
        },
      ] as const;

      for (const scenario of scenarios) {
        // Runtime bytecode returning `false` only for `scenario.rejectedRecipient`.
        const gateBytecode =
          `0x60043573${scenario.rejectedRecipient.slice(2)}141560005260206000f3` as Hex;
        await client.setCode({
          address: rejectingSharesGate,
          bytecode: gateBytecode,
        });

        const [deployless, multicall, onchainAccrual] = await Promise.all([
          fetchAccrualVaultV2(vaultAddress, client),
          fetchAccrualVaultV2(vaultAddress, client, { deployless: false }),
          client.readContract({
            address: vaultAddress,
            abi: vaultV2Abi,
            functionName: "accrueInterestView",
          }),
        ]);

        expect(deployless.performanceFeeRecipientCanReceiveShares).toBe(
          scenario.performanceFeeRecipientCanReceiveShares,
        );
        expect(deployless.managementFeeRecipientCanReceiveShares).toBe(
          scenario.managementFeeRecipientCanReceiveShares,
        );
        expectEquivalent(deployless, multicall);

        const sdkAccrual = deployless.accrueInterest(block.timestamp);
        expect(sdkAccrual.vault._totalAssets).toBe(onchainAccrual[0]);
        expect(sdkAccrual.performanceFeeShares).toBe(onchainAccrual[1]);
        expect(sdkAccrual.managementFeeShares).toBe(onchainAccrual[2]);
        if (scenario.performanceFeeRecipientCanReceiveShares) {
          expect(onchainAccrual[1]).toBeGreaterThan(0n);
          expect(onchainAccrual[2]).toBe(0n);
        } else {
          expect(onchainAccrual[1]).toBe(0n);
          expect(onchainAccrual[2]).toBeGreaterThan(0n);
        }
      }
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoVaultV1 liquidity adapter",
    async ({ client }) => {
      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2(vaultV2VaultV1, client),
        fetchAccrualVaultV2(vaultV2VaultV1, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoVaultV1Adapter",
      );
      expectEquivalent(deployless, multicall);
    },
  );

  testTreehouseEth(
    "matches V1.1 accounting and ignores residual shares at zero allocation",
    async ({ client }) => {
      const anvilClient = client as AnvilTestClient;
      const sourceVault = await fetchVault(lostAssetsVaultV1, client);
      const parentVault = await deployVaultV2(anvilClient, sourceVault.asset);
      const morphoVaultV1AdapterFactory =
        addressesRegistry[client.chain.id].morphoVaultV1AdapterFactory!;
      const creationHash = await client.writeContract({
        address: morphoVaultV1AdapterFactory,
        abi: morphoVaultV1AdapterFactoryAbi,
        functionName: "createMorphoVaultV1Adapter",
        args: [parentVault, lostAssetsVaultV1],
      });
      await client.waitForTransactionReceipt({ hash: creationHash });
      const adapterAddress = await client.readContract({
        address: morphoVaultV1AdapterFactory,
        abi: morphoVaultV1AdapterFactoryAbi,
        functionName: "morphoVaultV1Adapter",
        args: [parentVault, lostAssetsVaultV1],
      });
      await submitAndAccept(anvilClient, {
        address: parentVault,
        abi: vaultV2Abi,
        functionName: "addAdapter",
        args: [adapterAddress],
      });
      const shares = sourceVault.totalSupply / 1_000n;
      await client.deal({
        erc20: lostAssetsVaultV1,
        account: adapterAddress,
        amount: shares,
      });
      const block = await client.getBlock();
      const [deploylessVault, sequentialVault] = await Promise.all([
        fetchAccrualVaultV2(parentVault, client, {
          blockNumber: block.number,
        }),
        fetchAccrualVaultV2(parentVault, client, {
          blockNumber: block.number,
          deployless: false,
        }),
      ]);
      expectEquivalent(deploylessVault, sequentialVault);
      const deployless = deploylessVault.accrualAdapters.find(
        (adapter) => adapter.address === adapterAddress,
      ) as AccrualVaultV2MorphoVaultV1Adapter | undefined;
      const sequential = sequentialVault.accrualAdapters.find(
        (adapter) => adapter.address === adapterAddress,
      ) as AccrualVaultV2MorphoVaultV1Adapter | undefined;

      expect(deployless).toBeInstanceOf(AccrualVaultV2MorphoVaultV1Adapter);
      expect(sequential).toBeInstanceOf(AccrualVaultV2MorphoVaultV1Adapter);
      expect(sequential?.shares).toBe(shares);
      expect(sequential?.parentAllocation).toBe(0n);
      expect(sequential?.accrualVaultV1.lostAssets).toBeGreaterThan(0n);
      expect(deployless?.accrualVaultV1.lostAssets).toBe(
        sequential?.accrualVaultV1.lostAssets,
      );
      expect(deployless?.accrualVaultV1.totalAssets).toBe(
        sequential?.accrualVaultV1.totalAssets,
      );
      expect(deployless?.accrualVaultV1.totalSupply).toBe(
        sequential?.accrualVaultV1.totalSupply,
      );
      expect(deployless?.accrualVaultV1.lastTotalAssets).toBe(
        sequential?.accrualVaultV1.lastTotalAssets,
      );
      expect(deployless?.realAssets(block.timestamp)).toBe(
        sequential?.realAssets(block.timestamp),
      );
      expect(sequential?.realAssets(block.timestamp)).toBe(0n);
      expect(deployless?.maxWithdraw("0x")).toStrictEqual(
        sequential?.maxWithdraw("0x"),
      );
      expect(sequential?.maxWithdraw("0x").value).toBe(0n);
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoMarketV1 liquidity adapter",
    async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        { marketParams, deposit: parseUnits("1000", 6) },
      );

      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2(vaultAddress, client),
        fetchAccrualVaultV2(vaultAddress, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoMarketV1Adapter",
      );
      expectEquivalent(deployless, multicall);
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a vault without a liquidity adapter",
    async ({ client }) => {
      // A freshly-deployed VaultV2 has no liquidity adapter and no regular adapters, exercising the
      // `hasLiquidityAdapter === false` and `isLiquidityAdapterKnown === false` decoding branches.
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2(vaultAddress, client),
        fetchAccrualVaultV2(vaultAddress, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter).toBeUndefined();
      expect(deployless.liquidityAllocations).toBeUndefined();
      expect(deployless.accrualAdapters).toHaveLength(0);
      expectEquivalent(deployless, multicall);
    },
  );

  vaultV2Test(
    "matches fetchAccrualVaultV2 for a MorphoMarketV1AdapterV2 liquidity adapter",
    async ({ client }) => {
      const [deployless, multicall] = await Promise.all([
        fetchAccrualVaultV2(vaultV2MarketV1V2, client, { deployless: "force" }),
        fetchAccrualVaultV2(vaultV2MarketV1V2, client, { deployless: false }),
      ]);

      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MorphoMarketV1AdapterV2",
      );
      expectEquivalent(deployless, multicall);
    },
  );
});

describe("fetchAccrualVaultV2 with Midnight adapters", () => {
  midnightAccrualTest(
    "matches deployless, fallback, and onchain accrual for mixed adapters",
    async ({ client }) => {
      const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
      const wNative = getChainAddress(ChainId.BaseMainnet, "wNative");
      const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
      const setterRatifier = getChainAddress(
        ChainId.BaseMainnet,
        "setterRatifier",
      );
      const oracle = "0x0000000000000000000000000000000000080000";
      const offerMaker = testAccount(1);
      const units = parseUnits("1", 6);
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
        maturity: 2_100_000_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      });
      const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
        client,
        asset: usdc,
        salts: [padHex(toHex(21n), { size: 32 })],
        markets: [market],
      });
      const midnightAdapter = adapters[0]?.address;
      if (midnightAdapter === undefined)
        throw new Error("Expected a Midnight adapter");

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

      const depositedAssets = parseUnits("2", 6);
      await client.deal({ erc20: usdc, amount: depositedAssets });
      await client.approve({
        address: usdc,
        args: [vault, depositedAssets],
      });
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [depositedAssets, client.account.address],
      });
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

      await deployMorphoMarketV1Adapter(client as AnvilTestClient, vault, "1", {
        marketParams,
        deposit: parseUnits("1000", 6),
      });
      await submitAndAccept(client as AnvilTestClient, {
        address: vault,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [midnightAdapter, "0x"],
      });

      const [deployless, fallback] = await Promise.all([
        fetchAccrualVaultV2(vault, client, { deployless: "force" }),
        fetchAccrualVaultV2(vault, client, { deployless: false }),
      ]);
      expectEquivalent(deployless, fallback);
      expect(deployless.accrualAdapters.map((adapter) => adapter.type)).toEqual(
        expect.arrayContaining([
          "VaultV2MidnightAdapter",
          "VaultV2MorphoMarketV1Adapter",
        ]),
      );
      expect(deployless.accrualLiquidityAdapter?.type).toBe(
        "VaultV2MidnightAdapter",
      );
      const timestamp = await client.timestamp();
      const midnightLiquidityAccrual = deployless.accrualLiquidityAdapter;
      if (!(midnightLiquidityAccrual instanceof AccrualVaultV2MidnightAdapter))
        throw new Error("Expected a Midnight accrual liquidity adapter");
      expect(midnightLiquidityAccrual.realAssets(timestamp)).toBeGreaterThan(
        0n,
      );
      expect(midnightLiquidityAccrual.realAssets(timestamp)).toBe(
        fallback.accrualLiquidityAdapter?.realAssets(timestamp),
      );
      const midnightAccrual = deployless.accrualAdapters.find(
        (adapter) => adapter.type === "VaultV2MidnightAdapter",
      );
      const fallbackMidnightAccrual = fallback.accrualAdapters.find(
        (adapter) => adapter.type === "VaultV2MidnightAdapter",
      );
      const blueAccrual = deployless.accrualAdapters.find(
        (adapter) => adapter.type === "VaultV2MorphoMarketV1Adapter",
      );
      if (!(midnightAccrual instanceof AccrualVaultV2MidnightAdapter))
        throw new Error("Expected a Midnight accrual adapter");
      expect(midnightAccrual?.marketIds.length).toBeGreaterThan(0);
      expect(midnightAccrual?.realAssets(timestamp)).toBeGreaterThan(0n);
      expect(midnightAccrual?.realAssets(timestamp)).toBe(
        fallbackMidnightAccrual?.realAssets(timestamp),
      );
      expect(midnightAccrual?.realAssets(timestamp)).toBe(
        await client.readContract({
          address: midnightAdapter,
          abi: midnightAdapterAbi,
          functionName: "realAssets",
        }),
      );
      expect(blueAccrual?.realAssets(timestamp)).toBeGreaterThan(0n);

      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "accrueInterest",
      });
      expect(
        deployless.accrueInterest((await client.getBlock()).timestamp).vault
          ._totalAssets,
      ).toBe(
        await client.readContract({
          address: vault,
          abi: vaultV2Abi,
          functionName: "totalAssets",
        }),
      );

      const timestampBeforeProjection = await client.timestamp();
      await client.removeBlockTimestampInterval();
      await client.increaseTime({ seconds: 86_400 });
      await client.mine({ blocks: 1 });
      const projectedAt = await client.timestamp();
      expect(projectedAt).toBeGreaterThanOrEqual(
        timestampBeforeProjection + 80_000n,
      );
      const forwardProjection = deployless.accrueInterest(projectedAt);
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "accrueInterest",
      });
      expect(forwardProjection.vault._totalAssets).toBe(
        await client.readContract({
          address: vault,
          abi: vaultV2Abi,
          functionName: "totalAssets",
        }),
      );
    },
  );

  midnightAccrualTest(
    "matches deployless and fallback for a non-member Midnight liquidity adapter",
    async ({ client }) => {
      const usdc = getChainAddress(ChainId.BaseMainnet, "usdc");
      const { vault, adapters } = await createVaultV2MidnightAdapterFixture({
        client,
        asset: usdc,
        vaultSalt: padHex(toHex(22n), { size: 32 }),
        salts: [
          padHex(toHex(23n), { size: 32 }),
          padHex(toHex(24n), { size: 32 }),
        ],
      });
      const liquidityAdapter = adapters[1]?.address;
      if (liquidityAdapter === undefined)
        throw new Error("Expected a second Midnight adapter");

      await submitAndAccept(client as AnvilTestClient, {
        address: vault,
        abi: vaultV2Abi,
        functionName: "removeAdapter",
        args: [liquidityAdapter],
      });
      await submitAndAccept(client as AnvilTestClient, {
        address: vault,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [liquidityAdapter, "0x"],
      });

      const [deployless, fallback] = await Promise.all([
        fetchAccrualVaultV2(vault, client, { deployless: "force" }),
        fetchAccrualVaultV2(vault, client, { deployless: false }),
      ]);

      expectEquivalent(deployless, fallback);
      expect(deployless.adapters).not.toContain(liquidityAdapter);
      expect(deployless.liquidityAllocations).toEqual(
        fallback.liquidityAllocations,
      );
      expect(deployless.accrualLiquidityAdapter).toEqual(
        fallback.accrualLiquidityAdapter,
      );
      expect(deployless.accrualLiquidityAdapter).toBeInstanceOf(
        AccrualVaultV2MidnightAdapter,
      );
      expect(deployless.accrualLiquidityAdapter?.address).toBe(
        liquidityAdapter,
      );
    },
  );
});
