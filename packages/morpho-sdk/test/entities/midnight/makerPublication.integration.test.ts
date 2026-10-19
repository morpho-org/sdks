import {
  type IOffer,
  Market,
  MarketParams,
  MarketUtils,
  midnightAbi,
  Offer,
  OfferUtils,
  RateRatifierV1,
  Tree,
} from "@morpho-org/midnight-sdk";
import { ChainId, getChainAddress, Time } from "@morpho-org/morpho-ts";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  concatHex,
  erc20Abi,
  type Hex,
  maxUint128,
  maxUint256,
  padHex,
  parseEther,
  parseUnits,
  toHex,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";
import { describe, expect, vi } from "vitest";
import { morphoViemExtension } from "../../../src/client/morphoViemExtension.js";
import {
  getMidnightBlueBuyCallbackAddress,
  getMidnightBlueBuyCallbackData,
  isRequirementSignature,
  midnightCancelAndMake,
} from "../../../src/index.js";
import {
  MidnightMarketLiquidationCursorNotEnabledError,
  MidnightMarketLltvNotEnabledError,
  MidnightMarketMaturityTooFarError,
  MidnightMarketOracleWithoutCodeError,
  MidnightOfferCallbackNotSupportedError,
  MidnightOfferContinuousFeeCapBelowMarketFeeError,
  MidnightOfferExpiredError,
  MidnightOfferExpiryAfterMaturityError,
  MidnightOfferGroupConsumedError,
  MidnightOfferNoCreditError,
  MidnightOfferNoDebtError,
  MidnightOfferRateBoundUnreachableError,
  MidnightOfferTickSpacingError,
  MidnightOfferZeroPriceSellError,
} from "../../../src/types/midnightPublicationError.js";

const test = createViemTest(base, {
  forkUrl: getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 52_252_000n,
  stepsTracing: false,
});

const midnight = getChainAddress(ChainId.BaseMainnet, "midnight");
const midnightBundlesV2 = getChainAddress(
  ChainId.BaseMainnet,
  "midnightBundlesV2",
);
const loanToken = getChainAddress(ChainId.BaseMainnet, "usdc");
const collateralToken = getChainAddress(ChainId.BaseMainnet, "wNative");
const oracle = "0x0000000000000000000000000000000000080000" as Address;
const blueMarket = {
  loanToken,
  collateralToken,
  oracle,
  irm: getChainAddress(ChainId.BaseMainnet, "adaptiveCurveIrm"),
  lltv: 860_000_000_000_000_000n,
};
const validationFetch = vi.fn(
  async () =>
    new Response(JSON.stringify({ data: { issues: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
);

const marketFor = (
  timestamp: bigint,
  overrides: {
    readonly maturity?: bigint;
    readonly lltv?: bigint;
    readonly liquidationCursor?: bigint;
    readonly oracle?: Address;
  } = {},
) =>
  new MarketParams({
    chainId: base.id,
    midnight,
    loanToken,
    collateralParams: [
      {
        token: collateralToken,
        lltv: overrides.lltv ?? 770_000_000_000_000_000n,
        liquidationCursor:
          overrides.liquidationCursor ?? 300_000_000_000_000_000n,
        oracle: overrides.oracle ?? oracle,
      },
    ],
    maturity: overrides.maturity ?? timestamp + 365n * 86_400n,
    rcfThreshold: 0n,
    enterGate: zeroAddress,
    liquidatorGate: zeroAddress,
  });

const priceTreeFor = (params: {
  readonly market: MarketParams;
  readonly maker: Address;
  readonly overrides?: Partial<IOffer>;
}) =>
  Tree.create({
    type: "priceV1",
    entries: [
      {
        offer: new Offer({
          market: params.market,
          buy: true,
          maker: params.maker,
          start: 0n,
          expiry: params.market.maturity,
          tick: 5_000n,
          group: `0x${"ae".repeat(32)}` as Hex,
          callback: zeroAddress,
          callbackData: "0x",
          receiverIfMakerIsSeller: zeroAddress,
          ratifier: getChainAddress(ChainId.BaseMainnet, "priceRatifierV1"),
          reduceOnly: false,
          maxUnits: 0n,
          maxAssets: 1_000_000n,
          continuousFeeCap: 0n,
          ...params.overrides,
        }),
      },
    ],
  });

describe("Midnight maker publication validation on a Base fork", () => {
  test("rejects expired offers before the mempool API across maker flows", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = new MarketParams({
      chainId: base.id,
      midnight,
      loanToken,
      collateralParams: [
        {
          token: collateralToken,
          lltv: 770_000_000_000_000_000n,
          liquidationCursor: 300_000_000_000_000_000n,
          oracle,
        },
      ],
      maturity: block.timestamp + 365n * 86_400n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const maker = client.account.address;
    const group = `0x${"ab".repeat(32)}` as Hex;
    const baseOffer: IOffer = {
      market,
      buy: true,
      maker,
      start: 0n,
      expiry: block.timestamp - 1n,
      tick: 5_000n,
      group,
      callback: zeroAddress,
      callbackData: "0x",
      receiverIfMakerIsSeller: zeroAddress,
      ratifier: getChainAddress(ChainId.BaseMainnet, "priceRatifierV1"),
      reduceOnly: false,
      maxUnits: 0n,
      maxAssets: 1_000_000n,
      continuousFeeCap: 0n,
    };
    const treeFor = (offer: IOffer) =>
      Tree.create({
        type: "priceV1",
        entries: [{ offer: Offer.create(offer) }],
      });
    const apiFetch = vi.fn(() => validationFetch());
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: {
        apiUrl: "https://api.example/base/",
        fetch: apiFetch,
      },
    };
    const midnightEntity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    await expect(
      midnightEntity.makeLend({
        ...common,
        offers: treeFor(baseOffer),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);

    await expect(
      midnightEntity.makeBorrow({
        ...common,
        offers: treeFor({
          ...baseOffer,
          buy: false,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);

    await expect(
      midnightEntity.makeWithdraw({
        ...common,
        offers: treeFor({
          ...baseOffer,
          buy: false,
          reduceOnly: true,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);

    await expect(
      midnightEntity.makeRepay({
        ...common,
        offers: treeFor({ ...baseOffer, reduceOnly: true }),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);

    await expect(
      midnightEntity.supplyCollateralMakeBorrow({
        ...common,
        offers: treeFor({
          ...baseOffer,
          buy: false,
          receiverIfMakerIsSeller: maker,
        }),
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 1n }],
        },
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiredError);

    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("rejects unsupported callbacks before the mempool API for ordinary maker flows", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = new MarketParams({
      chainId: base.id,
      midnight,
      loanToken,
      collateralParams: [
        {
          token: collateralToken,
          lltv: 770_000_000_000_000_000n,
          liquidationCursor: 300_000_000_000_000_000n,
          oracle,
        },
      ],
      maturity: block.timestamp + 365n * 86_400n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const maker = client.account.address;
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: {
        apiUrl: "https://api.example/base/",
        fetch: vi.fn(validationFetch),
      },
    };
    const treeFor = (overrides: Partial<IOffer>) =>
      Tree.create({
        type: "priceV1",
        entries: [
          {
            offer: Offer.create({
              market,
              buy: true,
              maker,
              start: 0n,
              expiry: block.timestamp + 1_000n,
              tick: 5_000n,
              group: `0x${"ac".repeat(32)}` as Hex,
              callback: maker,
              callbackData: "0x",
              receiverIfMakerIsSeller: zeroAddress,
              ratifier: getChainAddress(ChainId.BaseMainnet, "priceRatifierV1"),
              reduceOnly: false,
              maxUnits: 0n,
              maxAssets: 1_000_000n,
              continuousFeeCap: 0n,
              ...overrides,
            }),
          },
        ],
      });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const apiFetch = common.validation.fetch;

    await expect(
      entity.makeLend({
        ...common,
        offers: treeFor({}),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferCallbackNotSupportedError);
    await expect(
      entity.makeBorrow({
        ...common,
        offers: treeFor({
          buy: false,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferCallbackNotSupportedError);
    await expect(
      entity.makeWithdraw({
        ...common,
        offers: treeFor({
          buy: false,
          reduceOnly: true,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferCallbackNotSupportedError);
    await expect(
      entity.makeRepay({
        ...common,
        offers: treeFor({ reduceOnly: true }),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferCallbackNotSupportedError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("rejects expiry after maturity and reduce-only offers without a position", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = new MarketParams({
      chainId: base.id,
      midnight,
      loanToken,
      collateralParams: [
        {
          token: collateralToken,
          lltv: 770_000_000_000_000_000n,
          liquidationCursor: 300_000_000_000_000_000n,
          oracle,
        },
      ],
      maturity: block.timestamp + 365n * 86_400n,
      rcfThreshold: 0n,
      enterGate: zeroAddress,
      liquidatorGate: zeroAddress,
    });
    const maker = client.account.address;
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: {
        apiUrl: "https://api.example/base/",
        fetch: vi.fn(validationFetch),
      },
    };
    const treeFor = (overrides: Partial<IOffer>) =>
      Tree.create({
        type: "priceV1",
        entries: [
          {
            offer: Offer.create({
              market,
              buy: true,
              maker,
              start: 0n,
              expiry: market.maturity,
              tick: 5_000n,
              group: `0x${"ad".repeat(32)}` as Hex,
              callback: zeroAddress,
              callbackData: "0x",
              receiverIfMakerIsSeller: zeroAddress,
              ratifier: getChainAddress(ChainId.BaseMainnet, "priceRatifierV1"),
              reduceOnly: false,
              maxUnits: 0n,
              maxAssets: 1_000_000n,
              continuousFeeCap: 0n,
              ...overrides,
            }),
          },
        ],
      });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    await expect(
      entity.makeBorrow({
        ...common,
        offers: treeFor({
          buy: false,
          expiry: market.maturity + 1n,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiryAfterMaturityError);
    await expect(
      entity.makeRepay({
        ...common,
        offers: treeFor({ expiry: market.maturity + 1n, reduceOnly: true }),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferExpiryAfterMaturityError);
    await expect(
      entity.makeRepay({
        ...common,
        offers: treeFor({ reduceOnly: true }),
        loanToken,
        loanAssets: 1_000_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferNoDebtError);
    await expect(
      entity.makeWithdraw({
        ...common,
        offers: treeFor({
          buy: false,
          reduceOnly: true,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferNoCreditError);
  });

  test("rejects off-spacing ticks and zero-price sells before the mempool API", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = marketFor(block.timestamp);
    const maker = client.account.address;
    const apiFetch = vi.fn(() => validationFetch());
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: { apiUrl: "https://api.example/base/", fetch: apiFetch },
    };

    await expect(
      entity.makeWithdraw({
        ...common,
        offers: priceTreeFor({
          market,
          maker,
          overrides: {
            buy: false,
            reduceOnly: true,
            receiverIfMakerIsSeller: maker,
            tick: 0n,
            maxUnits: 100n,
            maxAssets: 0n,
          },
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferZeroPriceSellError);
    await expect(
      entity.makeWithdraw({
        ...common,
        offers: priceTreeFor({
          market,
          maker,
          overrides: {
            buy: false,
            reduceOnly: true,
            receiverIfMakerIsSeller: maker,
            tick: 5_001n,
            maxUnits: 100n,
            maxAssets: 0n,
          },
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferTickSpacingError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("rejects unreachable Rate V1 sell bounds in makeWithdraw and makeBorrow", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const market = marketFor(block.timestamp);
    const maker = client.account.address;
    const baseOffer: IOffer = {
      market,
      buy: false,
      maker,
      start: 0n,
      expiry: market.maturity,
      tick: 5_000n,
      group: `0x${"af".repeat(32)}` as Hex,
      callback: zeroAddress,
      callbackData: "0x",
      receiverIfMakerIsSeller: maker,
      ratifier: getChainAddress(ChainId.BaseMainnet, "rateRatifierV1"),
      reduceOnly: false,
      maxUnits: 100n,
      maxAssets: 0n,
      continuousFeeCap: 0n,
    };
    const withdrawOffer = new Offer({ ...baseOffer, reduceOnly: true });
    const borrowOffer = new Offer(baseOffer);
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: {
        apiUrl: "https://api.example/base/",
        fetch: vi.fn(validationFetch),
      },
    };
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);

    await expect(
      entity.makeWithdraw({
        ...common,
        offers: Tree.create({
          type: "rateV1",
          entries: [{ offer: withdrawOffer, rate: 0n }],
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferRateBoundUnreachableError);
    await expect(
      entity.makeBorrow({
        ...common,
        offers: Tree.create({
          type: "rateV1",
          entries: [{ offer: borrowOffer, rate: 1_000n }],
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferRateBoundUnreachableError);
  });

  test("rejects invalid uncreated-market settings in makeBorrow and collateral flows", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const maker = client.account.address;
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const apiFetch = vi.fn(() => validationFetch());
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: { apiUrl: "https://api.example/base/", fetch: apiFetch },
    };
    const tryCollateralFlow = (market: MarketParams) =>
      entity.supplyCollateralMakeBorrow({
        ...common,
        offers: priceTreeFor({
          market,
          maker,
          overrides: {
            buy: false,
            expiry: block.timestamp + 600n,
            receiverIfMakerIsSeller: maker,
          },
        }),
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 1n }],
        },
      });
    const disabledLltv = marketFor(block.timestamp, { lltv: 1n });
    const disabledCursor = marketFor(block.timestamp, {
      liquidationCursor: 1n,
    });
    const longMaturity = marketFor(block.timestamp, {
      maturity: block.timestamp + 100n * 365n * 86_400n + 601n,
      oracle: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    });
    const missingOracle = marketFor(block.timestamp, { oracle: zeroAddress });

    await expect(tryCollateralFlow(disabledLltv)).rejects.toBeInstanceOf(
      MidnightMarketLltvNotEnabledError,
    );
    await expect(tryCollateralFlow(disabledCursor)).rejects.toBeInstanceOf(
      MidnightMarketLiquidationCursorNotEnabledError,
    );
    await expect(tryCollateralFlow(longMaturity)).rejects.toBeInstanceOf(
      MidnightMarketMaturityTooFarError,
    );
    await expect(tryCollateralFlow(missingOracle)).rejects.toBeInstanceOf(
      MidnightMarketOracleWithoutCodeError,
    );

    await expect(
      entity.makeBorrow({
        ...common,
        offers: priceTreeFor({
          market: disabledLltv,
          maker,
          overrides: { buy: false, receiverIfMakerIsSeller: maker },
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightMarketLltvNotEnabledError);
    await expect(
      entity.makeBorrow({
        ...common,
        offers: priceTreeFor({
          market: longMaturity,
          maker,
          overrides: {
            buy: false,
            expiry: block.timestamp + 600n,
            receiverIfMakerIsSeller: maker,
          },
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightMarketMaturityTooFarError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("rejects cancelled groups across all applicable maker flows", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const maker = client.account.address;
    const market = marketFor(block.timestamp);
    const group = `0x${"cf".repeat(32)}` as Hex;
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const apiFetch = vi.fn(() => validationFetch());
    const common = {
      accountAddress: maker,
      deadline: Time.timestamp() + 600n,
      validation: { apiUrl: "https://api.example/base/", fetch: apiFetch },
    };
    const treeFor = (overrides: Partial<IOffer> = {}) =>
      priceTreeFor({
        market,
        maker,
        overrides: { group, ...overrides },
      });

    await client.writeContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "setIsAuthorized",
      args: [midnightBundlesV2, true, maker],
    });
    await client.sendTransaction(
      midnightCancelAndMake({
        chainId: base.id,
        cancellations: [{ group, maxConsumed: 0n }],
        deadline: maxUint256,
      }),
    );
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, group],
      }),
    ).resolves.toBe(maxUint128);
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });

    await expect(
      entity.makeLend({
        ...common,
        offers: treeFor(),
        loanToken,
        loanAssets: 1_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);
    expect(apiFetch).not.toHaveBeenCalled();
    await expect(
      entity.makeBorrow({
        ...common,
        offers: treeFor({ buy: false, receiverIfMakerIsSeller: maker }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);
    await expect(
      entity.makeWithdraw({
        ...common,
        offers: treeFor({
          buy: false,
          reduceOnly: true,
          receiverIfMakerIsSeller: maker,
        }),
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);
    await expect(
      entity.makeRepay({
        ...common,
        offers: treeFor({ reduceOnly: true }),
        loanToken,
        loanAssets: 1_000n,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);
    await expect(
      entity.supplyCollateralMakeBorrow({
        ...common,
        offers: treeFor({ buy: false, receiverIfMakerIsSeller: maker }),
        collateral: {
          market,
          supplies: [{ collateralIndex: 0n, assets: 1n }],
        },
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);

    const callbackSalt = `0x${"00".repeat(31)}c1` as Hex;
    const callback = getMidnightBlueBuyCallbackAddress({
      chainId: base.id,
      owner: maker,
      salt: callbackSalt,
    });
    await expect(
      entity.supplyBlueMakeLend({
        ...common,
        offers: treeFor({
          callback,
          callbackData: getMidnightBlueBuyCallbackData(blueMarket),
        }),
        blueMarket,
        assetsToPark: 1_000n,
        callbackSalt,
      }),
    ).rejects.toBeInstanceOf(MidnightOfferGroupConsumedError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("rejects makeRepay when the market fee exceeds its offer cap", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const maker = client.account.address;
    const targetMaturity = block.timestamp + 365n * 86_400n;
    const maturityAtFifteenUtc =
      (targetMaturity / 86_400n) * 86_400n + 15n * 3_600n;
    const maturity =
      maturityAtFifteenUtc > targetMaturity
        ? maturityAtFifteenUtc
        : maturityAtFifteenUtc + 86_400n;
    const market = marketFor(block.timestamp, { maturity });
    const marketId = MarketUtils.toId(market);
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const apiFetch = vi.fn(() => validationFetch());
    const send = async (
      transaction: Parameters<typeof client.sendTransaction>[0],
    ) => {
      const hash = await client.sendTransaction(transaction);
      await client.waitForTransactionReceipt({ hash });
    };
    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    const borrowGroup = `0x${"e1".repeat(32)}` as Hex;
    const borrowTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: priceTreeFor({
            market,
            maker,
            overrides: {
              buy: false,
              group: borrowGroup,
              maxUnits: parseUnits("1", 6),
              maxAssets: 0n,
              receiverIfMakerIsSeller: maker,
              ratifier: getChainAddress(ChainId.BaseMainnet, "rateRatifierV1"),
            },
          }).offers[0]!,
          rate: 1_000_000_000n,
        },
      ],
    });
    const borrowOutput = await entity.makeBorrow({
      accountAddress: maker,
      offers: borrowTree,
      deadline: Time.timestamp() + 600n,
      validation: {
        apiUrl: "https://api.example/base/",
        fetch: apiFetch,
      },
    });
    for (const requirement of await borrowOutput.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await send({ ...requirement, account: maker });
    }
    await send({ ...borrowOutput.buildTx(), account: maker });

    const collateralAssets = parseEther("2");
    await client.deal({
      erc20: collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: maker,
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, maker],
    });

    const taker = "0x0000000000000000000000000000000000007a4e" as Address;
    await client.setBalance({ address: taker, value: parseEther("10") });
    await client.impersonateAccount({ address: taker });
    await client.deal({
      erc20: loanToken,
      account: taker,
      amount: parseUnits("10", 6),
    });
    for (const spender of [midnightBundlesV2, midnight]) {
      await client.writeContract({
        account: taker,
        address: loanToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, parseUnits("10", 6)],
      });
    }
    const [borrowItem] = RateRatifierV1.ratify({
      tree: borrowTree.toDescriptor() as never,
    });
    const borrowUnits = parseUnits("0.5", 6);
    const take = entity.takeLend({
      marketData: new Market({
        params: market,
        totalUnits: 0n,
        lossFactor: 0n,
        withdrawable: 0n,
        continuousFeeCredit: 0n,
        settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
        continuousFee: 0,
        tickSpacing: 1,
      }),
      accountAddress: taker,
      target: {
        type: "units",
        units: borrowUnits,
        maxBuyerAssets: borrowUnits * 10n + 1n,
      },
      takeableOffers: [
        {
          ...borrowItem!,
          offer: OfferUtils.toStruct({ offer: borrowItem!.offer }),
          units: borrowUnits,
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    for (const requirement of await take.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await send({ ...requirement, account: taker });
    }
    await send({ ...take.buildTx(), account: taker, gas: 8_000_000n });
    apiFetch.mockClear();

    let feeSetter = await client.readContract({
      address: midnight,
      abi: midnightAbi,
      functionName: "feeSetter",
    });
    if (feeSetter === zeroAddress) {
      const configurator = await client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "configurator",
      });
      await client.setBalance({
        address: configurator,
        value: parseEther("1"),
      });
      await client.impersonateAccount({ address: configurator });
      await client.writeContract({
        account: configurator,
        address: midnight,
        abi: midnightAbi,
        functionName: "setFeeSetter",
        args: [maker],
      });
      feeSetter = maker;
    }
    await client.impersonateAccount({ address: feeSetter });
    await client.setBalance({ address: feeSetter, value: parseEther("1") });
    await client.writeContract({
      account: feeSetter,
      address: midnight,
      abi: midnightAbi,
      functionName: "setMarketContinuousFee",
      args: [marketId, 1n],
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "continuousFee",
        args: [marketId],
      }),
    ).resolves.toBe(1);

    await expect(
      entity.makeRepay({
        accountAddress: maker,
        offers: priceTreeFor({
          market,
          maker,
          overrides: { reduceOnly: true },
        }),
        loanToken,
        loanAssets: 1_000n,
        deadline: Time.timestamp() + 600n,
        validation: { apiUrl: "https://api.example/base/", fetch: apiFetch },
      }),
    ).rejects.toBeInstanceOf(MidnightOfferContinuousFeeCapBelowMarketFeeError);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  test("valid makeLend and makeBorrow offers still publish and fill", async ({
    client,
  }) => {
    const block = await client.getBlock();
    const maker = client.account.address;
    const targetMaturity = block.timestamp + 365n * 86_400n;
    const maturityAtFifteenUtc =
      (targetMaturity / 86_400n) * 86_400n + 15n * 3_600n;
    const maturity =
      maturityAtFifteenUtc > targetMaturity
        ? maturityAtFifteenUtc
        : maturityAtFifteenUtc + 86_400n;
    const market = marketFor(block.timestamp, { maturity });
    const entity = client
      .extend(morphoViemExtension())
      .morpho.midnight(base.id);
    const validation = {
      apiUrl: "https://api.example/base/",
      fetch: validationFetch,
    };
    const send = async (
      transaction: Parameters<typeof client.sendTransaction>[0],
    ) => {
      const hash = await client.sendTransaction(transaction);
      await client.waitForTransactionReceipt({ hash });
    };

    await client.setCode({
      address: oracle,
      bytecode: concatHex([
        "0x7f",
        padHex(toHex(10n ** 36n), { size: 32 }),
        "0x60005260206000f3",
      ]),
    });
    await client.deal({
      erc20: loanToken,
      account: maker,
      amount: parseUnits("2", 6),
    });

    const lendGroup = `0x${"d1".repeat(32)}` as Hex;
    const lendTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: priceTreeFor({
            market,
            maker,
            overrides: {
              group: lendGroup,
              maxAssets: parseUnits("1", 6),
              ratifier: getChainAddress(ChainId.BaseMainnet, "rateRatifierV1"),
            },
          }).offers[0]!,
          rate: 0n,
        },
      ],
    });
    const lendOutput = await entity.makeLend({
      accountAddress: maker,
      offers: lendTree,
      loanToken,
      loanAssets: parseUnits("1", 6),
      deadline: Time.timestamp() + 600n,
      validation,
    });
    for (const requirement of await lendOutput.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await send({ ...requirement, account: maker });
    }
    await send({ ...lendOutput.buildTx(), account: maker });

    const taker = "0x0000000000000000000000000000000000007a4e" as Address;
    const collateralAssets = parseEther("2");
    await client.setBalance({ address: taker, value: parseEther("1") });
    await client.impersonateAccount({ address: taker });
    await client.deal({
      erc20: collateralToken,
      account: taker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: taker,
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, taker],
    });
    const [lendItem] = RateRatifierV1.ratify({
      tree: lendTree.toDescriptor() as never,
    });
    await client.writeContract({
      account: taker,
      address: midnight,
      abi: midnightAbi,
      gas: 8_000_000n,
      functionName: "take",
      args: [
        OfferUtils.toStruct({ offer: lendTree.offers[0]! }),
        lendItem!.ratifierData,
        parseUnits("0.5", 6),
        taker,
        taker,
        zeroAddress,
        "0x",
      ],
    });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, lendGroup],
      }),
    ).resolves.toBeGreaterThan(0n);

    const borrowGroup = `0x${"d2".repeat(32)}` as Hex;
    const borrowTree = Tree.create({
      type: "rateV1",
      entries: [
        {
          offer: priceTreeFor({
            market,
            maker,
            overrides: {
              buy: false,
              group: borrowGroup,
              maxUnits: parseUnits("1", 6),
              maxAssets: 0n,
              receiverIfMakerIsSeller: maker,
              ratifier: getChainAddress(ChainId.BaseMainnet, "rateRatifierV1"),
            },
          }).offers[0]!,
          rate: 1_000_000_000n,
        },
      ],
    });
    const borrowOutput = await entity.makeBorrow({
      accountAddress: maker,
      offers: borrowTree,
      deadline: Time.timestamp() + 600n,
      validation,
    });
    for (const requirement of await borrowOutput.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await send({ ...requirement, account: maker });
    }
    await send({ ...borrowOutput.buildTx(), account: maker });

    await client.deal({
      erc20: collateralToken,
      account: maker,
      amount: collateralAssets,
    });
    await client.writeContract({
      account: maker,
      address: collateralToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, collateralAssets],
    });
    await client.writeContract({
      account: maker,
      address: midnight,
      abi: midnightAbi,
      functionName: "supplyCollateral",
      args: [MarketUtils.toStruct(market), 0n, collateralAssets, maker],
    });
    await client.writeContract({
      account: taker,
      address: loanToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [midnight, parseUnits("10", 6)],
    });
    await client.deal({
      erc20: loanToken,
      account: taker,
      amount: parseUnits("10", 6),
    });
    for (const spender of [midnightBundlesV2, midnight]) {
      await client.writeContract({
        account: taker,
        address: loanToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, parseUnits("10", 6)],
      });
    }
    const [borrowItem] = RateRatifierV1.ratify({
      tree: borrowTree.toDescriptor() as never,
    });
    const borrowUnits = parseUnits("0.5", 6);
    const take = entity.takeLend({
      marketData: new Market({
        params: market,
        totalUnits: 0n,
        lossFactor: 0n,
        withdrawable: 0n,
        continuousFeeCredit: 0n,
        settlementFeeCbps: [0, 0, 0, 0, 0, 0, 0],
        continuousFee: 0,
        tickSpacing: 1,
      }),
      accountAddress: taker,
      target: {
        type: "units",
        units: borrowUnits,
        maxBuyerAssets: borrowUnits * 10n + 1n,
      },
      takeableOffers: [
        {
          ...borrowItem!,
          offer: OfferUtils.toStruct({ offer: borrowItem!.offer }),
          units: borrowUnits,
        },
      ],
      maxContinuousFee: maxUint256,
      deadline: Time.timestamp() + 600n,
    });
    for (const requirement of await take.getRequirements()) {
      if (isRequirementSignature(requirement)) {
        expect.unreachable("expected onchain publication requirements");
      }
      await send({ ...requirement, account: taker });
    }
    await send({ ...take.buildTx(), account: taker, gas: 8_000_000n });
    await expect(
      client.readContract({
        address: midnight,
        abi: midnightAbi,
        functionName: "consumed",
        args: [maker, borrowGroup],
      }),
    ).resolves.toBeGreaterThan(0n);
  });
});
