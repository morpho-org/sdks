import {
  AccrualVaultV2,
  AccrualVaultV2MidnightAdapter,
  addressesRegistry,
  CapacityLimitReason,
  MarketParams,
  MathLib,
  VaultV2MidnightAdapter,
  VaultV2MidnightAdapterUtils,
  VaultV2MorphoMarketV1Adapter,
  VaultV2MorphoMarketV1AdapterV2,
  VaultV2MorphoVaultV1Adapter,
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
import { ChainId, getChainAddress } from "@morpho-org/morpho-ts";
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
  deploylessCallViaBytecodeBytecode,
  encodeAbiParameters,
  encodeDeployData,
  encodeFunctionData,
  erc20Abi,
  padHex,
  parseAbi,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { readContract } from "viem/actions";
import { base } from "viem/chains";
import { describe, expect } from "vitest";
import {
  fetchAccrualVaultV2,
  fetchAccrualVaultV2Adapter,
  fetchAccrualVaultV2MidnightAdapter,
  fetchVaultV2,
  fetchVaultV2Adapter,
  fetchVaultV2MidnightAdapter,
  midnightAdapterAbi,
  vaultV2Abi,
} from "../src/index.js";
import {
  abi as midnightAdapterQueryAbi,
  code as midnightAdapterQueryCode,
} from "../src/queries/vault-v2/GetVaultV2MidnightAdapter.js";
import { vaultV2Test } from "./setup.js";
import { deployMorphoMarketV1Adapter, deployVaultV2 } from "./utils.js";

// VaultV2 with liquidity adapter vaultV1
const vaultV2Address = "0xfDE48B9B8568189f629Bc5209bf5FA826336557a";
const vaultV2AdapterVaultV1Address =
  "0x2C32fF5E1d976015AdbeA8cC73c7Da3A6677C25F";
const allocator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";
const curator = "0xc0267A5Fa9aaaf1694283c013CBFA925BCdb5dE8";
const midnightAdapterTest = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: BASE_MIDNIGHT_FORK_BLOCK_NUMBER,
  redactForkUrl: true,
});

// VaultV2 with liquidity adapter marketV1
const vaultV2ClearstarEurc = "0x4C7b69b4a82e9E5D8ec60E96516f7A0E17CBC55C";

const expectedDataVaultV1Adapter = new VaultV2MorphoVaultV1Adapter({
  morphoVaultV1: "0xbeeF010f9cb27031ad51e3333f9aF9C6B1228183",
  address: vaultV2AdapterVaultV1Address,
  parentVault: vaultV2Address,
  skimRecipient: zeroAddress,
  parentAllocation: 16_624_313n,
});

const marketParams = new MarketParams({
  collateralToken: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  irm: "0x46415998764C29aB2a25CbeA6254146D50D22687",
  lltv: 860000000000000000n,
  loanToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  oracle: "0x663BECd10daE6C4A3Dcd89F1d76c1174199639B9",
});

describe("VaultV2Adapter", () => {
  describe("should fetch vaultV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const value = await fetchVaultV2Adapter(
        vaultV2AdapterVaultV1Address,
        client,
        {
          deployless: true,
        },
      );

      expect(value).toStrictEqual(expectedDataVaultV1Adapter);
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const value = await fetchVaultV2Adapter(
        vaultV2AdapterVaultV1Address,
        client,
        {
          deployless: false,
        },
      );

      expect(value).toStrictEqual(expectedDataVaultV1Adapter);
    });
  });

  describe("should fetch marketV1 adapter", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress } = await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        {
          marketParams,
          deposit: parseUnits("1000", 6),
        },
      );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1Adapter({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketParamsList: [marketParams],
        }),
      );
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress } = await deployMorphoMarketV1Adapter(
        client as AnvilTestClient,
        vaultAddress,
        "1",
        {
          marketParams,
          deposit: parseUnits("1000", 6),
        },
      );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1Adapter({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketParamsList: [marketParams],
        }),
      );
    });
  });

  describe("should fetch marketV1 adapter V2", () => {
    vaultV2Test("with deployless reads", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress, supplyShares } =
        await deployMorphoMarketV1Adapter(
          client as AnvilTestClient,
          vaultAddress,
          "2",
          {
            marketParams,
            deposit: parseUnits("1000", 6),
          },
        );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: "force",
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1AdapterV2({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketIds: [marketParams.id],
          adaptiveCurveIrm: marketParams.irm,
          supplyShares: {
            [marketParams.id]: supplyShares,
          },
        }),
      );
    });

    vaultV2Test("with multicall", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];

      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);
      const { address: adapterAddress, supplyShares } =
        await deployMorphoMarketV1Adapter(
          client as AnvilTestClient,
          vaultAddress,
          "2",
          {
            marketParams,
            deposit: parseUnits("1000", 6),
          },
        );

      const value = await fetchVaultV2Adapter(adapterAddress, client, {
        deployless: false,
      });
      expect(value).toStrictEqual(
        new VaultV2MorphoMarketV1AdapterV2({
          address: adapterAddress,
          parentVault: vaultAddress,
          skimRecipient: zeroAddress,
          marketIds: [marketParams.id],
          adaptiveCurveIrm: marketParams.irm,
          supplyShares: {
            [marketParams.id]: supplyShares,
          },
        }),
      );
    });
  });
});

describe("VaultV2 Midnight adapter", () => {
  vaultV2Test(
    "loads a Blue vault before the Midnight adapter factory is deployed",
    async ({ client }) => {
      const factory = getChainAddress(
        ChainId.BaseMainnet,
        "midnightAdapterFactory",
      );
      const factoryCode = await client.getCode({ address: factory });
      expect(factoryCode === undefined || factoryCode === "0x").toBe(true);

      const vault = await fetchVaultV2(vaultV2Address, client, {
        deployless: false,
      });
      expect(vault.address).toBe(vaultV2Address);
      expect(
        await fetchVaultV2(vaultV2Address, client, {
          deployless: "force",
        }),
      ).toEqual(vault);
    },
  );

  midnightAdapterTest(
    "matches deployless and fallback fetches and dispatches generically",
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
        maturity: 2_000_000_000n,
        rcfThreshold: 0n,
        enterGate: zeroAddress,
        liquidatorGate: zeroAddress,
      });
      const { adapters } = await createVaultV2MidnightAdapterFixture({
        client,
        asset: usdc,
        salts: [padHex(toHex(13n), { size: 32 })],
        markets: [market],
      });
      const address = adapters[0]?.address;
      if (address === undefined) throw new Error("Expected a Midnight adapter");
      const factory = getChainAddress(
        ChainId.BaseMainnet,
        "midnightAdapterFactory",
      );
      const traceDeploylessGas = async () => {
        const data = encodeDeployData({
          abi: parseAbi(["constructor(bytes, bytes)"]),
          bytecode: deploylessCallViaBytecodeBytecode,
          args: [
            midnightAdapterQueryCode,
            encodeFunctionData({
              abi: midnightAdapterQueryAbi,
              functionName: "query",
              args: [address, factory],
            }),
          ],
        });
        return client.estimateGas({
          account: client.account.address,
          data,
        });
      };
      const emptyQueryGas = await traceDeploylessGas();
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
      const vault = await client.readContract({
        address,
        abi: midnightAdapterAbi,
        functionName: "parentVault",
      });
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
        adapter: address,
        args: [
          OfferUtils.toStruct({ offer: item.offer }),
          item.ratifierData,
          units,
          "0x",
        ],
      });
      const oneMarketQueryGas = await traceDeploylessGas();
      const estimated250MarketGas =
        emptyQueryGas + (oneMarketQueryGas - emptyQueryGas) * 250n;
      expect(oneMarketQueryGas).toBeGreaterThan(emptyQueryGas);
      expect(estimated250MarketGas).toBeLessThan(30_000_000n);

      const [deployless, fallback, force] = await Promise.all([
        fetchVaultV2MidnightAdapter(address, client),
        fetchVaultV2MidnightAdapter(address, client, { deployless: false }),
        fetchVaultV2MidnightAdapter(address, client, { deployless: "force" }),
      ]);

      expect(deployless).toBeInstanceOf(VaultV2MidnightAdapter);
      expect(fallback).toStrictEqual(deployless);
      expect(force).toStrictEqual(deployless);
      expect(deployless.parentVault).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "parentVault",
        }),
      );
      expect(deployless.adapterId).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "adapterId",
        }),
      );
      expect(deployless.asset).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "asset",
        }),
      );
      expect(deployless.skimRecipient).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "skimRecipient",
        }),
      );
      expect(deployless.midnight).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "midnight",
        }),
      );
      expect(deployless.durations).toStrictEqual(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "durations",
        }),
      );
      expect(deployless.durationAllocations).toStrictEqual(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "durationAllocations",
          args: [BigInt(deployless.durations.length)],
        }),
      );

      const marketId = MarketUtils.toId(market);
      const [netCredit, rate, maturity, index, forceSellable] =
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "marketData",
          args: [marketId],
        });
      expect(deployless.marketData[marketId]).toStrictEqual({
        netCredit,
        rate,
        maturity: BigInt(maturity),
        index: BigInt(index),
        forceSellable,
      });
      const [credit, pendingFee, lastLossFactor, lastAccrual] =
        await client.readContract({
          address: midnight,
          abi: midnightAbi,
          functionName: "position",
          args: [marketId, address],
        });
      const [, lossFactor] = await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "marketState",
        args: [marketId],
      });
      const accruedSnapshot = await fetchAccrualVaultV2MidnightAdapter(
        address,
        client,
      );
      expect(accruedSnapshot.markets[0]).toStrictEqual({
        id: marketId,
        position: { credit, pendingFee, lastLossFactor, lastAccrual },
        market: { lossFactor },
      });
      expect(accruedSnapshot.marketData[marketId]).toMatchObject({
        rate,
        maturity: BigInt(maturity),
        forceSellable,
      });
      const allocationTimestamp = await client.timestamp();
      const durationsLength = BigInt(deployless.durations.length);
      for (let length = 0n; length <= durationsLength; length++) {
        const expectedAllocations =
          VaultV2MidnightAdapterUtils.durationAllocations({
            marketData: deployless.marketData,
            durations: deployless.durations,
            length: Number(length),
            timestamp: allocationTimestamp,
          });
        const onchainAllocations = await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "durationAllocations",
          args: [length],
        });
        expect(expectedAllocations).toStrictEqual(onchainAllocations);
      }

      const [accrued, accruedFallback, accruedForced] = await Promise.all([
        fetchAccrualVaultV2MidnightAdapter(address, client),
        fetchAccrualVaultV2MidnightAdapter(address, client, {
          deployless: false,
        }),
        fetchAccrualVaultV2MidnightAdapter(address, client, {
          deployless: "force",
        }),
      ]);
      expect(accrued).toBeInstanceOf(AccrualVaultV2MidnightAdapter);
      expect(accruedForced).toStrictEqual(accruedFallback);
      expect(accrued.realAssets((await client.getBlock()).timestamp)).toBe(
        await client.readContract({
          address,
          abi: midnightAdapterAbi,
          functionName: "realAssets",
        }),
      );
      expect(
        accruedFallback.realAssets((await client.getBlock()).timestamp),
      ).toBe(accrued.realAssets((await client.getBlock()).timestamp));
      const assertAccruedAssetsMatch = async () => {
        const block = await client.getBlock();
        const snapshot = await fetchAccrualVaultV2MidnightAdapter(
          address,
          client,
          { blockNumber: block.number },
        );
        expect(snapshot.realAssets(block.timestamp)).toBe(
          await client.readContract({
            address,
            abi: midnightAdapterAbi,
            functionName: "realAssets",
          }),
        );
      };
      await assertAccruedAssetsMatch();
      const timestampBeforeMaturity = await client.timestamp();
      expect(timestampBeforeMaturity).toBeLessThan(market.maturity);
      const timestampAtMidlife =
        timestampBeforeMaturity +
        (market.maturity - timestampBeforeMaturity) / 2n;
      await client.setNextBlockTimestamp({ timestamp: timestampAtMidlife });
      await client.mine({
        blocks: 1,
      });
      await assertAccruedAssetsMatch();
      const timestampAfterMidlife = await client.timestamp();
      expect(timestampAfterMidlife).toBeLessThan(market.maturity);
      const timestampAfterMaturity = market.maturity + 86_400n;
      await client.setNextBlockTimestamp({
        timestamp: timestampAfterMaturity,
      });
      await client.mine({
        blocks: 1,
      });
      expect(await client.timestamp()).toBeGreaterThan(market.maturity);
      await assertAccruedAssetsMatch();
      expect(await fetchVaultV2Adapter(address, client)).toBeInstanceOf(
        VaultV2MidnightAdapter,
      );
      expect(await fetchAccrualVaultV2Adapter(address, client)).toBeInstanceOf(
        AccrualVaultV2MidnightAdapter,
      );
      await client.writeContract({
        address: vault,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [address, "0x"],
      });
      const fallbackLiquidityVault = await fetchVaultV2(vault, client, {
        deployless: false,
      });
      expect(fallbackLiquidityVault.adapters).toContain(address);
      expect(fallbackLiquidityVault.liquidityAllocations?.[0]?.id).toBe(
        VaultV2MidnightAdapter.adapterCapId(address),
      );
      expect(
        await fetchVaultV2Adapter(address, client, { deployless: "force" }),
      ).toBeInstanceOf(VaultV2MidnightAdapter);
      const [accrualAdapter, accrualAdapterFallback] = await Promise.all([
        fetchAccrualVaultV2Adapter(address, client, { deployless: "force" }),
        fetchAccrualVaultV2Adapter(address, client, { deployless: false }),
      ]);
      expect(accrualAdapter).toBeInstanceOf(AccrualVaultV2MidnightAdapter);
      expect(accrualAdapter).toStrictEqual(accrualAdapterFallback);

      const [deploylessVault, fallbackVault] = await Promise.all([
        fetchVaultV2(vault, client, { deployless: "force" }),
        fetchVaultV2(vault, client, { deployless: false }),
      ]);
      expect(deploylessVault).toEqual(fallbackVault);
      expect(deploylessVault.liquidityAllocations?.[0]?.id).toBe(
        VaultV2MidnightAdapter.adapterCapId(address),
      );
    },
  );
});

describe("LiquidityAdapter vaultV1", () => {
  describe("maxDeposit function", () => {
    vaultV2Test("should be limited by absolute cap", async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const [absoluteCap, allocation] = await Promise.all([
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "absoluteCap",
          args: [
            VaultV2MorphoVaultV1Adapter.adapterCapId(
              vaultV2AdapterVaultV1Address,
            ),
          ],
        }),
        readContract(client, {
          address: vaultV2Address,
          abi: vaultV2Abi,
          functionName: "allocation",
          args: [
            VaultV2MorphoVaultV1Adapter.adapterCapId(
              vaultV2AdapterVaultV1Address,
            ),
          ],
        }),
      ]);

      const depositAmount = parseUnits("2000000", 6); // 1M
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: absoluteCap - allocation,
        limiter: CapacityLimitReason.vaultV2_absoluteCap,
      });
    });

    vaultV2Test("should be limited by relative cap", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterVaultV1Address],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "decreaseRelativeCap",
        args: [idData, 1n],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const depositAmount = parseUnits("100000", 6); // 100K
      const result = accrualVaultV2.maxDeposit(depositAmount);

      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.vaultV2_relativeCap,
      });
    });

    vaultV2Test("should be limited by metamorpho", async ({ client }) => {
      await client.deal({
        account: curator,
        amount: parseEther("1"),
      });
      const idData = encodeAbiParameters(
        [{ type: "string" }, { type: "address" }],
        ["this", vaultV2AdapterVaultV1Address],
      );
      const data = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });
      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });

      await client.writeContract({
        account: curator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "increaseAbsoluteCap",
        args: [idData, parseEther("200000")],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const result = accrualVaultV2.maxDeposit(MathLib.MAX_UINT_256);
      expect(result).toStrictEqual({
        value: 1001123682308137952n,
        limiter: CapacityLimitReason.cap,
      });
    });
  });

  describe("maxWithdraw function", () => {
    vaultV2Test(
      "should be limited by liquidity when assets > liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("1000000", 18); // 1M shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: 16733835n,
          limiter: CapacityLimitReason.liquidity,
        });
      },
    );

    vaultV2Test(
      "should be limited by balance when assets <= liquidity",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2Address,
          client,
        );

        const shares = parseUnits("10", 18); // 10 shares
        const result = accrualVaultV2.maxWithdraw(shares);

        expect(result).toStrictEqual({
          value: accrualVaultV2.toAssets(shares),
          limiter: CapacityLimitReason.balance,
        });
      },
    );
  });
});

describe("LiquidityAdapter marketV1", () => {
  describe("maxDeposit function", () => {
    vaultV2Test("should be limited by balance", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultAddress, client);

      const assets = parseUnits("100000", 6); // 100K assets
      const result = accrualVaultV2.maxDeposit(assets);
      expect(result).toStrictEqual({
        value: assets,
        limiter: CapacityLimitReason.balance,
      });
    });
  });

  describe("maxWithdraw function", () => {
    vaultV2Test("should be limited by balance", async ({ client }) => {
      const { usdc } = addressesRegistry[client.chain.id];
      const vaultAddress = await deployVaultV2(client as AnvilTestClient, usdc);

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultAddress, client);

      const shares = parseUnits("100000", 6); // 100K shares
      const result = accrualVaultV2.maxWithdraw(shares);
      expect(result).toStrictEqual({
        value: 0n,
        limiter: CapacityLimitReason.balance,
      });
    });
  });
});

describe("LiquidityAdapter marketV1 V2", () => {
  describe("maxDeposit function", () => {
    vaultV2Test(
      "should be limited by absolute cap on marketV1",
      async ({ client }) => {
        const accrualVaultV2 = await fetchAccrualVaultV2(
          vaultV2ClearstarEurc,
          client,
        );

        const assets = parseUnits("30000000", 6); // 30M assets

        const result = accrualVaultV2.maxDeposit(assets);
        expect(result.value).toBeLessThanOrEqual(parseUnits("20000000", 6)); // Should be inferior or equal to 20M
        expect(result.limiter).toBe(CapacityLimitReason.vaultV2_absoluteCap);
      },
    );
  });
});

describe("LiquidityAdapter zero address", () => {
  vaultV2Test(
    "should deposit full amount when liquidityAdapter is zero address",
    async ({ client }) => {
      // Set liquidity adapter to zero address
      await client.writeContract({
        account: allocator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [zeroAddress, "0x"],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const result = accrualVaultV2.maxDeposit(MathLib.MAX_UINT_256);
      expect(result).toStrictEqual({
        value: MathLib.MAX_UINT_256,
        limiter: CapacityLimitReason.balance,
      });
    },
  );

  vaultV2Test(
    "should be bounded by assetBalance when liquidityAdapter is zero address",
    async ({ client }) => {
      // Set liquidity adapter to zero address
      await client.writeContract({
        account: allocator,
        address: vaultV2Address,
        abi: vaultV2Abi,
        functionName: "setLiquidityAdapterAndData",
        args: [zeroAddress, "0x"],
      });

      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const shares = parseUnits("10000000000", 18);
      const result = accrualVaultV2.maxWithdraw(shares);

      expect(result).toStrictEqual({
        value: accrualVaultV2.assetBalance,
        limiter: CapacityLimitReason.liquidity,
      });
    },
  );
});

describe("LiquidityAdapter undefined", () => {
  vaultV2Test(
    "should throw error for undefined liquidity adapter",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const modified1AccrualVaultV2 = new AccrualVaultV2(
        accrualVaultV2,
        undefined,
        accrualVaultV2.accrualAdapters,
        accrualVaultV2.assetBalance,
        accrualVaultV2.forceDeallocatePenalties,
      );

      const depositAmount = parseUnits("1000", 6);
      expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
        "unsupported liquidity adapter",
      );
    },
  );

  vaultV2Test(
    "should throw error for undefined liquidity allocations",
    async ({ client }) => {
      const accrualVaultV2 = await fetchAccrualVaultV2(vaultV2Address, client);

      const modified1AccrualVaultV2 = new AccrualVaultV2(
        {
          ...accrualVaultV2,
          liquidityAllocations: undefined,
        },
        accrualVaultV2.accrualLiquidityAdapter,
        accrualVaultV2.accrualAdapters,
        accrualVaultV2.assetBalance,
        accrualVaultV2.forceDeallocatePenalties,
      );

      const depositAmount = parseUnits("1000", 6);
      expect(() => modified1AccrualVaultV2.maxDeposit(depositAmount)).toThrow(
        "unsupported liquidity adapter",
      );
    },
  );
});
