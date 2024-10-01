import chai, { expect } from "chai";
import {
  AbstractSigner,
  MaxUint256,
  Provider,
  Wallet,
  parseEther,
  parseUnits,
  toBigInt,
} from "ethers";
import {
  ERC20__factory,
  ERC4626__factory,
  MorphoBlue__factory,
} from "ethers-types";
import { Executor, Executor__factory } from "executooor";
import fetchMock from "fetch-mock";
import { ethers, tracer } from "hardhat";
import { deal } from "hardhat-deal";
import nock from "nock";
import simple from "simple-mock";
import sinon from "sinon";
import "evm-maths";

import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { BuildTxInput } from "@paraswap/sdk";

import {
  Address,
  ChainId,
  MarketConfig,
  MarketId,
  addresses,
} from "@morpho-org/blue-sdk";
import { setUp } from "@morpho-org/morpho-test";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";

import {
  fetchAccrualPositionFromConfig,
  fetchMarket,
  fetchToken,
} from "@morpho-org/blue-sdk-ethers";
import chaiAlmost from "chai-almost";
import { check } from "../../examples/whitelisted-erc4626-1inch";
import { SwapMock__factory } from "../../mocks/types";
import { getOneInchSwapApiUrl } from "../../src/1inch";
import { PARASWAP_API_URL } from "../../src/paraswap";
import {
  getPendleRedeemApiUrl,
  getPendleSwapApiUrl,
  pendleMarkets,
} from "../../src/pendle";
import { sendRawBundleMockImpl } from "../mocks";

//allow for 0.1% tolerance for balance checks
chai.use(chaiAlmost(0.1));

const rpcUrl = process.env.MAINNET_RPC_URL;
if (!rpcUrl) throw Error(`no RPC provided`);

const oneInchSwapApiMatcher = new RegExp(getOneInchSwapApiUrl(1) + ".*");
const paraSwapPriceApiMatcher = new RegExp(PARASWAP_API_URL + "/prices" + ".*");
const paraSwapTxApiMatcher = new RegExp(
  PARASWAP_API_URL + "/transactions" + ".*",
);

const pendleSwapApiMatcher = new RegExp(getPendleSwapApiUrl(1) + ".*");
const pendleRedeemApiMatcher = new RegExp(getPendleRedeemApiUrl(1) + ".*");

// Method 'HardhatEthersSigner.signTransaction' is not implemented.
const hardhatSigner = Wallet.fromPhrase(
  "test test test test test test test test test test test junk",
  ethers.provider,
) as AbstractSigner<Provider>;

const delay = 7220;

const testDelta = 100;

let start = 1727163200;

describe("erc4626-1inch", () => {
  let signer: SignerWithAddress;
  let borrower: SignerWithAddress;

  let executor: Executor;
  let executorAddress: Address;
  let swapMockAddress: Address;

  let clock: sinon.SinonFakeTimers;

  before(async () => {
    const signers = await ethers.getSigners();
    signer = signers[0]!;
    borrower = signers[1]!;

    simple.mock(
      FlashbotsBundleProvider.prototype,
      "sendRawBundle",
      sendRawBundleMockImpl,
    );
  });

  after(() => {
    simple.restore();
  });

  afterEach(async () => {
    nock.cleanAll();
    fetchMock.reset();
    clock?.restore();
    start += testDelta;
  });

  setUp(async () => {
    executor = await new Executor__factory(
      Executor__factory.abi,
      Executor__factory.bytecode,
      signer,
    ).deploy(signer.address);

    executorAddress = await executor.getAddress();

    tracer.nameTags[executorAddress] = "Executor";

    const SwapMock = await ethers.getContractFactory("SwapMock", signer);
    const swapMock = await SwapMock.deploy();
    swapMockAddress = await swapMock.getAddress();
  });

  const setTimestamp = async (timestamp: number) => {
    clock = sinon.useFakeTimers({
      now: timestamp * 1000,
      toFake: ["Date"], // Avoid faking setTimeout, used to delay retries.
    });

    await setNextBlockTimestamp(timestamp - 12);
    await mine(1);
    await setNextBlockTimestamp(timestamp);
  };

  const mockOneInch = (srcAmount: bigint, dstAmount: string) => {
    // Nock cannot mock requests from the builtin fetch API.
    fetchMock
      .get(
        oneInchSwapApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const dstToken = url.searchParams.get("dst")!;

          await deal(
            dstToken,
            swapMockAddress,
            (await ERC20__factory.connect(dstToken, signer).balanceOf(
              swapMockAddress,
            )) + toBigInt(dstAmount),
          );

          return {
            dstAmount,
            tx: {
              from: executorAddress,
              to: swapMockAddress,
              data: SwapMock__factory.createInterface().encodeFunctionData(
                "swap",
                [
                  {
                    token: url.searchParams.get("src")!,
                    amount: url.searchParams.get("amount")!,
                  },
                  {
                    token: dstToken,
                    amount: dstAmount, // TODO: simulate positive & negative slippage
                  },
                ],
              ),
              value: "0",
              gas: 0,
              gasPrice: "0",
            },
          };
        },
        {
          query: {
            amount: srcAmount.toString(),
          },
        },
      )
      .get(oneInchSwapApiMatcher, 404, { overwriteRoutes: false });
  };

  const mockParaSwap = (srcAmount: bigint, dstAmount: string) => {
    // Nock cannot mock requests from the builtin fetch API.
    fetchMock
      .get(
        paraSwapPriceApiMatcher,
        async (uri) => {
          const url = new URL(uri);
          const srcToken = url.searchParams.get("srcToken")!;
          const destToken = url.searchParams.get("destToken")!;

          await deal(
            destToken,
            swapMockAddress,
            (await ERC20__factory.connect(destToken, signer).balanceOf(
              swapMockAddress,
            )) + toBigInt(dstAmount),
          );

          return {
            priceRoute: {
              blockNumber: 12345678,
              network: 1,
              srcToken,
              srcDecimals: 18,
              srcAmount: srcAmount,
              destToken,
              destDecimals: 18,
              destAmount: dstAmount,
              bestRoute: [
                {
                  percent: 100,
                  swaps: [
                    {
                      srcToken,
                      srcDecimals: 18,
                      destToken,
                      destDecimals: 18,
                      swapExchanges: [
                        {
                          exchange: "MockExchange",
                          srcAmount: srcAmount,
                          destAmount: dstAmount,
                          percent: 100,
                        },
                      ],
                    },
                  ],
                },
              ],
              gasCostUSD: "5",
              gasCost: "100000",
              side: "SELL",
              tokenTransferProxy: "0x216B4B4Ba9F3e719726886d34a177484278Bfcae",
              contractAddress: "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57",
            },
          };
        },
        {
          query: {
            amount: srcAmount.toString(),
          },
        },
      )
      .get(paraSwapPriceApiMatcher, 404, { overwriteRoutes: false });

    fetchMock.post(paraSwapTxApiMatcher, async (_uri, opts) => {
      const body = JSON.parse(opts?.body as string) as BuildTxInput;
      await deal(
        body.destToken,
        swapMockAddress,
        (await ERC20__factory.connect(body.destToken, signer).balanceOf(
          swapMockAddress,
        )) + toBigInt(dstAmount),
      );
      return {
        from: executorAddress,
        to: swapMockAddress,
        value: "0",
        data: SwapMock__factory.createInterface().encodeFunctionData("swap", [
          {
            token: body.srcToken,
            amount: srcAmount,
          },
          {
            token: body.destToken,
            amount: dstAmount, // TODO: simulate positive & negative slippage
          },
        ]),
        gasPrice: "0",
        chainId: 1,
        gas: "0",
      };
    });
  };

  const mockPendleOperations = (
    srcAmount: bigint,
    dstAmount: string,
    ptToken: string,
  ) => {
    // Mock for Pendle Swap API
    fetchMock
      .get(
        pendleSwapApiMatcher,
        async (url) => {
          const parsedUrl = new URL(url);
          const marketSegment = url.split("/markets/")[1];
          if (!marketSegment)
            throw new Error("Market segment is undefined in the URL.");
          const market = marketSegment.split("/swap")[0];
          const receiver = parsedUrl.searchParams.get("receiver");
          const tokenIn = parsedUrl.searchParams.get("tokenIn") as Address;
          const tokenOut = parsedUrl.searchParams.get("tokenOut") as Address;
          const amountIn = toBigInt(parsedUrl.searchParams.get("amountIn")!);

          await deal(
            tokenOut!,
            swapMockAddress,
            (await ERC20__factory.connect(tokenOut!, signer).balanceOf(
              swapMockAddress,
            )) + srcAmount,
          );

          return {
            method: "swapExactPtForToken",
            contractCallParamsName: [
              "receiver",
              "market",
              "exactPtIn",
              "output",
              "limit",
            ],
            contractCallParams: [
              receiver,
              market,
              amountIn,
              {
                tokenOut: tokenOut,
                minTokenOut: srcAmount,
                tokenRedeemSy: tokenOut,
                pendleSwap: "0x0000000000000000000000000000000000000000",
                swapData: {
                  swapType: "0",
                  extRouter: "0x0000000000000000000000000000000000000000",
                  extCalldata: "",
                  needScale: false,
                },
              },
              {
                limitRouter: "0x0000000000000000000000000000000000000000",
                epsSkipMarket: "0",
                normalFills: [],
                flashFills: [],
                optData: "0x",
              },
            ],
            tx: {
              data: SwapMock__factory.createInterface().encodeFunctionData(
                "swap",
                [
                  {
                    token: tokenIn,
                    amount: amountIn,
                  },
                  {
                    token: tokenOut,
                    amount: srcAmount, // TODO: simulate positive & negative slippage
                  },
                ],
              ),
              to: swapMockAddress,
              from: receiver,
            },
            data: {
              amountOut: srcAmount.toString(),
              priceImpact: -0.00008354225381729686,
            },
          };
        },
        {
          query: {
            amountIn: srcAmount.toString(),
          },
        },
      )
      .get(pendleSwapApiMatcher, 404, { overwriteRoutes: false });
    // Mock for Pendle Redeem API
    fetchMock
      .get(
        pendleRedeemApiMatcher,
        async (url) => {
          const parsedUrl = new URL(url);
          const receiver = parsedUrl.searchParams.get("receiver");
          const yt = parsedUrl.searchParams.get("yt") as Address;
          const amountIn = toBigInt(parsedUrl.searchParams.get("amountIn")!);
          const tokenOut = parsedUrl.searchParams.get("tokenOut") as Address;

          await deal(
            tokenOut!,
            swapMockAddress,
            (await ERC20__factory.connect(tokenOut!, signer).balanceOf(
              swapMockAddress,
            )) + BigInt(dstAmount),
          );

          return {
            method: "redeemPyToToken",
            contractCallParamsName: ["receiver", "YT", "netPyIn", "output"],
            contractCallParams: [
              receiver,
              yt,
              amountIn,
              {
                tokenOut: tokenOut,
                minTokenOut: dstAmount,
                tokenRedeemSy: tokenOut,
                pendleSwap: "0x0000000000000000000000000000000000000000",
                swapData: {
                  swapType: "0",
                  extRouter: "0x0000000000000000000000000000000000000000",
                  extCalldata: "",
                  needScale: false,
                },
              },
            ],
            tx: {
              data: SwapMock__factory.createInterface().encodeFunctionData(
                "swap",
                [
                  {
                    token: ptToken,
                    amount: toBigInt(amountIn!),
                  },
                  {
                    token: tokenOut,
                    amount: toBigInt(dstAmount), // TODO: simulate positive & negative slippage
                  },
                ],
              ),
              to: swapMockAddress,
              from: receiver,
            },
            data: {
              amountOut: dstAmount,
              priceImpact: 0,
            },
          };
        },
        {
          query: {
            amountIn: srcAmount.toString(),
          },
        },
      )
      .get(pendleRedeemApiMatcher, 404, { overwriteRoutes: false });
  };

  it(`should liquidate on standard market`, async () => {
    const collateralPriceUsd = 63_300;
    const ethPriceUsd = 2_600;

    const marketId =
      "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99" as MarketId; // WBTC/USDT (86%)

    let market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("1", collateralToken.decimals);
    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);
    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );

    await morpho.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    market = await fetchMarket(marketId, signer);

    await morpho.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 10n,
      0n,
      borrower.address,
      borrower.address,
    );

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [{ uniqueKey: marketId }] } } })
      .post("/graphql")
      .reply(200, {
        data: {
          assetByAddress: {
            priceUsd: ethPriceUsd,
            spotPriceEth: 1,
          },
          marketPositions: {
            items: [
              {
                user: {
                  address: borrower.address,
                },
                market: {
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                    spotPriceEth: collateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
                    decimals: loanToken.decimals,
                    priceUsd: null,
                    spotPriceEth: 1 / ethPriceUsd,
                  },
                },
              },
            ],
          },
        },
      });

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);

    mockOneInch(accruedPosition.seizableCollateral / 2n, "60475733900");
    mockParaSwap(accruedPosition.seizableCollateral / 2n, "60475733901");

    await setTimestamp(start + delay);
    await mine(1);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(33_316_586_406n / decimals);
  });

  it(`should liquidate on standard market with bad debt`, async () => {
    const collateralPriceUsd = 3_129;
    const ethPriceUsd = 2_653;

    const marketId =
      "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" as MarketId; // wstETH/WETH (96.5%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    const collateral = parseUnits("10000", collateralToken.decimals);
    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);
    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );

    await morpho.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    const borrowed = market.getMaxBorrowAssets(collateral) - 1n;
    await deal(
      loanToken.address,
      borrower.address,
      borrowed - market.liquidity,
    );
    await ERC20__factory.connect(loanToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );
    await morpho.supply(
      market.config,
      borrowed - market.liquidity, // 100% utilization after borrow.
      0n,
      borrower.address,
      "0x",
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morpho.borrow(
      market.config,
      borrowed,
      0n,
      borrower.address,
      borrower.address,
    );

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [{ uniqueKey: marketId }] } } })
      .post("/graphql")
      .reply(200, {
        data: {
          assetByAddress: {
            priceUsd: ethPriceUsd,
            spotPriceEth: 1,
          },
          marketPositions: {
            items: [
              {
                user: {
                  address: borrower.address,
                },
                market: {
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
                    decimals: loanToken.decimals,
                    priceUsd: null,
                    spotPriceEth: 1 / ethPriceUsd,
                  },
                },
              },
            ],
          },
        },
      });

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);

    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147659",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147658",
    );

    await setTimestamp(start + delay);
    await mine(1);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(5976971822403273072470n / decimals);
  });

  it(`should liquidate on a PT standard market before maturity`, async () => {
    const collateralPriceUsd = 1;
    const ethPriceUsd = 2_644;

    const marketId =
      "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("10000", collateralToken.decimals);

    const morphoBorrower = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [{ uniqueKey: marketId }] } } })
      .post("/graphql")
      .reply(200, {
        data: {
          assetByAddress: {
            priceUsd: ethPriceUsd,
            spotPriceEth: 1,
          },
          marketPositions: {
            items: [
              {
                user: {
                  address: borrower.address,
                },
                market: {
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
                    decimals: loanToken.decimals,
                    priceUsd: null,
                    spotPriceEth: 1 / ethPriceUsd,
                  },
                },
              },
            ],
          },
        },
      });

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const accruedPosition = accrualPosition.accrueInterest(start + delay);
    setTimestamp(start + delay);
    mockPendleOperations(
      accruedPosition.seizableCollateral / 2n,
      "60475733901",
      market.config.collateralToken,
    );
    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147656",
    );
    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(7369167071383784310757n / decimals);
  });

  it(`should liquidate on a PT standard market after maturity`, async () => {
    const collateralPriceUsd = 1;
    const ethPriceUsd = 2_644;

    const marketId =
      "0x8f46cd82c4c44a090c3d72bd7a84baf4e69ee50331d5deae514f86fe062b0748" as MarketId; // PT-sUSDE-24OCT2024 / DAI (86%)

    const market = await fetchMarket(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(market.config.collateralToken, signer),
      fetchToken(market.config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = parseUnits("10000", collateralToken.decimals);

    const morphoBorrower = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      borrower,
    );

    await deal(collateralToken.address, borrower.address, collateral);

    await ERC20__factory.connect(collateralToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );

    await setNextBlockTimestamp(start);
    await mine(1);

    await morphoBorrower.supplyCollateral(
      market.config,
      collateral,
      borrower.address,
      "0x",
    );

    await morphoBorrower.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
      0n,
      borrower.address,
      borrower.address,
    );

    const newCollateralPriceUsd = collateralPriceUsd * 0.5; // 50% price drop

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, {
        data: { markets: { items: [{ uniqueKey: marketId }] } },
      })
      .post("/graphql")
      .reply(200, {
        data: {
          assetByAddress: {
            priceUsd: ethPriceUsd,
            spotPriceEth: 1,
          },
          marketPositions: {
            items: [
              {
                user: {
                  address: borrower.address,
                },
                market: {
                  oracleAddress: market.config.oracle,
                  irmAddress: market.config.irm,
                  lltv: market.config.lltv,
                  collateralAsset: {
                    address: market.config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: newCollateralPriceUsd,
                    spotPriceEth: newCollateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: market.config.loanToken,
                    decimals: loanToken.decimals,
                    priceUsd: null,
                    spotPriceEth: 1 / ethPriceUsd,
                  },
                },
              },
            ],
          },
        },
      });

    const accrualPosition = await fetchAccrualPositionFromConfig(
      borrower.address as Address,
      market.config,
      signer,
    );
    const pendleMarketData =
      pendleMarkets[ChainId.EthMainnet][market.config.collateralToken];
    const postMaturity = pendleMarketData!.maturity.getTime() / 1000 + 1;
    const accruedPosition = accrualPosition.accrueInterest(postMaturity);
    setTimestamp(postMaturity);
    mockPendleOperations(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
      market.config.collateralToken,
    );
    mockOneInch(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147657",
    );
    mockParaSwap(
      accruedPosition.seizableCollateral / 2n,
      "11669266773005108147656",
    );
    console.log("swap mock", swapMockAddress);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    const decimals = BigInt.pow10(loanToken.decimals);

    const decimalBalance =
      (await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      )) / decimals;
    expect(decimalBalance).to.almost.eq(7325591893360572899357n / decimals);
  });

  it.skip(`should liquidate on rehypothecated market with limited swap liquidity`, async () => {
    const collateralPriceUsd = 4_000;
    const ethPriceUsd = 3_800;

    const morpho = MorphoBlue__factory.connect(
      addresses[ChainId.EthMainnet].morpho,
      borrower,
    );

    const config = new MarketConfig({
      collateralToken: "0x78Fc2c2eD1A4cDb5402365934aE5648aDAd094d0",
      loanToken: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      oracle: "0xe9eE579684716c7Bb837224F4c7BeEfA4f1F3d7f",
      irm: addresses[ChainId.EthMainnet].adaptiveCurveIrm,
      lltv: parseEther("0.86"),
    });

    tracer.nameTags[config.collateralToken] = "Re7WETH";
    tracer.nameTags[config.loanToken] = "USDT";

    await morpho.createMarket(config);

    const [collateralToken, loanToken] = await Promise.all([
      fetchToken(config.collateralToken, signer),
      fetchToken(config.loanToken, signer),
    ]);

    // The position must be deterministic for the Swap API mock's srcAmount to be deterministic.
    const collateral = 487286057724779572742n;
    const borrowed = 1551394115919n;
    const collateralVault = ERC4626__factory.connect(
      collateralToken.address,
      borrower,
    );

    const asset = await collateralVault.asset();
    await deal(
      asset,
      borrower.address,
      parseUnits("500", collateralToken.decimals),
    );
    await ERC20__factory.connect(asset, borrower).approve(
      collateralToken.address,
      MaxUint256,
    );
    await collateralVault.mint(collateral, borrower.address);
    await collateralVault.approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );
    await morpho.supplyCollateral(config, collateral, borrower.address, "0x");

    await deal(loanToken.address, borrower.address, borrowed);
    await ERC20__factory.connect(loanToken.address, borrower).approve(
      addresses[ChainId.EthMainnet].morpho,
      MaxUint256,
    );
    await morpho.supply(config, borrowed, 0n, borrower.address, "0x");
    await morpho.borrow(
      config,
      borrowed,
      0n,
      borrower.address,
      borrower.address,
    );

    nock(BLUE_API_BASE_URL)
      .post("/graphql")
      .reply(200, { data: { markets: { items: [{ uniqueKey: config.id }] } } })
      .post("/graphql")
      .reply(200, {
        data: {
          assetByAddress: {
            priceUsd: ethPriceUsd,
            spotPriceEth: 1,
          },
          marketPositions: {
            items: [
              {
                user: {
                  address: borrower.address,
                },
                market: {
                  oracleAddress: config.oracle,
                  irmAddress: config.irm,
                  lltv: config.lltv,
                  collateralAsset: {
                    address: config.collateralToken,
                    decimals: collateralToken.decimals,
                    priceUsd: collateralPriceUsd,
                    spotPriceEth: collateralPriceUsd / ethPriceUsd,
                  },
                  loanAsset: {
                    address: config.loanToken,
                    decimals: loanToken.decimals,
                    priceUsd: null,
                    spotPriceEth: 1 / ethPriceUsd,
                  },
                },
              },
            ],
          },
        },
      });

    mockOneInch(14027284293252328894n, "52318714940");

    await setTimestamp(1716558490);

    await check(executorAddress, hardhatSigner, signer, [config.id]);

    expect(
      await ERC20__factory.connect(config.loanToken, signer).balanceOf(
        executorAddress,
      ),
    ).to.eq(18509_333703n);
  });
});
