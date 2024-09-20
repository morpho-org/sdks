import { expect } from "chai";
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
import { ethers } from "hardhat";
import { deal } from "hardhat-deal";
import nock from "nock";
import simple from "simple-mock";
import sinon from "sinon";

import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { setNextBlockTimestamp } from "@nomicfoundation/hardhat-network-helpers/dist/src/helpers/time";
import { BuildTxInput } from "@paraswap/sdk";

import {
  Address,
  ChainId,
  Market,
  MarketConfig,
  MarketId,
  Token,
  addresses,
} from "@morpho-org/blue-sdk";
import "@morpho-org/blue-sdk-ethers/lib/augment";
import { setUp } from "@morpho-org/morpho-test";
import { BLUE_API_BASE_URL } from "@morpho-org/morpho-ts";

import { check } from "../../examples/whitelisted-erc4626-1inch";
import { SwapMock__factory } from "../../mocks/types";
import { getOneInchSwapApiUrl } from "../../src/1inch";
import { PARASWAP_API_URL } from "../../src/paraswap";
import { sendRawBundleMockImpl } from "../mocks";

const oneInchSwapApiMatcher = new RegExp(getOneInchSwapApiUrl(1) + ".*");
const paraSwapPriceApiMatcher = new RegExp(PARASWAP_API_URL + "/prices" + ".*");
const paraSwapTxApiMatcher = new RegExp(
  PARASWAP_API_URL + "/transactions" + ".*",
);

// Method 'HardhatEthersSigner.signTransaction' is not implemented.
const hardhatSigner = Wallet.fromPhrase(
  "test test test test test test test test test test test junk",
  ethers.provider,
) as AbstractSigner<Provider>;

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

  afterEach(() => {
    nock.cleanAll();
    fetchMock.reset();
    clock?.restore();
  });

  setUp(async () => {
    executor = await new Executor__factory(
      Executor__factory.abi,
      Executor__factory.bytecode,
      signer,
    ).deploy(signer.address);

    executorAddress = await executor.getAddress();

    // tracer.nameTags[executorAddress] = "Executor";

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

    fetchMock.post(paraSwapTxApiMatcher, async (_, opts) => {
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

  it(`should liquidate on standard market`, async () => {
    const collateralPriceUsd = 67_000;
    const ethPriceUsd = 3_700;

    const marketId =
      "0xa921ef34e2fc7a27ccc50ae7e4b154e16c9799d3387076c421423ef52ac4df99" as MarketId; // WBTC/USDT (86%)

    const market = await Market.fetch(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      Token.fetch(market.config.collateralToken, signer),
      Token.fetch(market.config.loanToken, signer),
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
    await setNextBlockTimestamp(1716551270);
    await morpho.borrow(
      market.config,
      market.getMaxBorrowAssets(collateral) - 1n,
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

    mockOneInch(89771782n, "60475733900");
    mockParaSwap(89771782n, "60475733901");

    await setTimestamp(1716558490);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    expect(
      await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      ),
    ).to.eq(2441_192035n);
  });

  it(`should liquidate on standard market with bad debt`, async () => {
    const collateralPriceUsd = 4_000;
    const ethPriceUsd = 3_800;

    const marketId =
      "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" as MarketId; // wstETH/WETH (96.5%)

    const market = await Market.fetch(marketId, signer);
    const [collateralToken, loanToken] = await Promise.all([
      Token.fetch(market.config.collateralToken, signer),
      Token.fetch(market.config.loanToken, signer),
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
    await setNextBlockTimestamp(1716551390);
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

    mockOneInch(10000000000000000000000n, "11669266773005108147657");
    mockParaSwap(10000000000000000000000n, "11669266773005108147656");

    await setTimestamp(1719575310);

    await check(executorAddress, hardhatSigner, signer, [marketId]);

    expect(
      await ERC20__factory.connect(market.config.loanToken, signer).balanceOf(
        executorAddress,
      ),
    ).to.eq(117_156497345065672001n);
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

    // tracer.nameTags[config.collateralToken] = "Re7WETH";
    // tracer.nameTags[config.loanToken] = "USDT";

    await morpho.createMarket(config);

    const [collateralToken, loanToken] = await Promise.all([
      Token.fetch(config.collateralToken, signer),
      Token.fetch(config.loanToken, signer),
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
