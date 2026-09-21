import {
  AccrualVault,
  addressesRegistry,
  type ChainAddresses,
  ChainId,
  ConstantWrappedToken,
  Eip5267Domain,
  ExchangeRateWrappedToken,
  Holding,
  Market,
  MarketParams,
  NATIVE_ADDRESS,
  Position,
  PreLiquidationParams,
  PreLiquidationPosition,
  registerCustomAddresses,
  Token,
  UnknownFactory,
  UnknownOfFactory,
  User,
  Vault,
  VaultConfig,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultUser,
} from "@morpho-org/blue-sdk";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  type Address,
  erc20Abi,
  erc20Abi_bytes32,
  maxUint256,
  stringToHex,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  encodeReadResult,
  mockDeploylessRead,
  mockDeploylessReads,
  mockNativeBalance,
  mockReadFailure,
} from "../__test__/viem.js";
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  blueOracleAbi,
  erc2612Abi,
  erc5267Abi,
  metaMorphoAbi,
  permissionedErc20WrapperAbi,
  preLiquidationAbi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
  wstEthAbi,
} from "../abis.js";
import { abi as holdingQueryAbi } from "../queries/GetHolding.js";
import { abi as marketQueryAbi } from "../queries/GetMarket.js";
import { abi as tokenQueryAbi } from "../queries/GetToken.js";
import { abi as vaultQueryAbi } from "../queries/GetVault.js";
import { abi as vaultUserQueryAbi } from "../queries/GetVaultUser.js";
import { fetchHolding } from "./Holding.js";
import { fetchMarket } from "./Market.js";
import { fetchMarketParams } from "./MarketParams.js";
import {
  fetchAccrualPosition,
  fetchPosition,
  fetchPreLiquidationParams,
  fetchPreLiquidationPosition,
} from "./Position.js";
import { decodeBytes32String, fetchToken } from "./Token.js";
import { fetchUser } from "./User.js";
import { fetchAccrualVault, fetchVault } from "./Vault.js";
import { fetchVaultConfig } from "./VaultConfig.js";
import { fetchVaultMarketAllocation } from "./VaultMarketAllocation.js";
import { fetchVaultMarketConfig } from "./VaultMarketConfig.js";
import { fetchVaultUser } from "./VaultUser.js";

const CHAIN_ID = ChainId.EthMainnet;
const ADDRESSES = addressesRegistry[CHAIN_ID];
const META_MORPHO_WITHOUT_LEGACY_FALLBACK_CHAIN_ID = 9_101_001;
const LOWERCASE_IRM_CHAIN_ID = 9_101_004;

registerCustomAddresses({
  addresses: {
    [META_MORPHO_WITHOUT_LEGACY_FALLBACK_CHAIN_ID]: {
      blue: ADDRESSES.blue,
      adaptiveCurveIrm: ADDRESSES.adaptiveCurveIrm,
      metaMorphoFactory: ADDRESSES.metaMorphoFactory,
    } satisfies ChainAddresses,
  },
});

const USER: Address = "0x1111111111111111111111111111111111111111";
const TOKEN: Address = "0x2222222222222222222222222222222222222222";
const COLLATERAL: Address = "0x3333333333333333333333333333333333333333";
const ORACLE: Address = "0x4444444444444444444444444444444444444444";
const VAULT: Address = "0x5555555555555555555555555555555555555555";
const RECIPIENT: Address = "0x6666666666666666666666666666666666666666";
const PRE_LIQUIDATION: Address = "0x7777777777777777777777777777777777777777";

const MARKET_PARAMS = new MarketParams({
  loanToken: TOKEN,
  collateralToken: COLLATERAL,
  oracle: ORACLE,
  irm: ADDRESSES.adaptiveCurveIrm,
  lltv: 860000000000000000n,
});

const ID = MARKET_PARAMS.id;

const DOMAIN = {
  fields: "0x1f",
  name: "Mock",
  version: "1",
  chainId: BigInt(CHAIN_ID),
  verifyingContract: TOKEN,
  salt: "0x0000000000000000000000000000000000000000000000000000000000000000",
  extensions: [] as readonly bigint[],
} as const;

const metaMorphoFactoryIsMetaMorphoAbi = [
  {
    inputs: [{ name: "", type: "address" }],
    name: "isMetaMorpho",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const marketParamsTuple = (params = MARKET_PARAMS) =>
  [
    params.loanToken,
    params.collateralToken,
    params.oracle,
    params.irm,
    params.lltv,
  ] as const;

const marketTuple = [100n, 200n, 30n, 40n, 5n, 6n] as const;
const positionTuple = [11n, 12n, 13n] as const;

function mockMarketReads(
  handle: ReturnType<typeof createMockClient>,
  params = MARKET_PARAMS,
) {
  mockRead(handle, {
    address: ADDRESSES.blue,
    abi: blueAbi,
    functionName: "idToMarketParams",
    result: marketParamsTuple(params),
  });
  mockRead(handle, {
    address: ADDRESSES.blue,
    abi: blueAbi,
    functionName: "market",
    result: marketTuple,
  });
  mockRead(handle, {
    address: params.oracle,
    abi: blueOracleAbi,
    functionName: "price",
    result: 123n,
  });
  mockRead(handle, {
    address: ADDRESSES.adaptiveCurveIrm,
    abi: adaptiveCurveIrmAbi,
    functionName: "rateAtTarget",
    result: 456n,
  });
}

function mockPositionReads(handle: ReturnType<typeof createMockClient>) {
  mockRead(handle, {
    address: ADDRESSES.blue,
    abi: blueAbi,
    functionName: "position",
    result: positionTuple,
  });
}

function mockVaultConfigReads(handle: ReturnType<typeof createMockClient>) {
  mockTokenReads(handle, VAULT, { symbol: "vMOCK", name: "Vault Mock" });
  mockRead(handle, {
    address: VAULT,
    abi: metaMorphoAbi,
    functionName: "asset",
    result: TOKEN,
  });
  mockRead(handle, {
    address: VAULT,
    abi: metaMorphoAbi,
    functionName: "DECIMALS_OFFSET",
    result: 2,
  });
}

function mockVaultMarketConfigReads(
  handle: ReturnType<typeof createMockClient>,
) {
  mockRead(handle, {
    address: VAULT,
    abi: metaMorphoAbi,
    functionName: "config",
    result: [29n, true, 30n],
  });
  mockRead(handle, {
    address: VAULT,
    abi: metaMorphoAbi,
    functionName: "pendingCap",
    result: [31n, 32n],
  });
}

function mockVaultMulticallReads(
  handle: ReturnType<typeof createMockClient>,
  { isMetaMorphoV1_1 = true }: { isMetaMorphoV1_1?: boolean } = {},
) {
  mockVaultConfigReads(handle);
  for (const [functionName, result] of [
    ["curator", RECIPIENT],
    ["owner", USER],
    ["guardian", COLLATERAL],
    ["timelock", 47n],
    ["pendingTimelock", [48n, 49n]],
    ["pendingGuardian", [ORACLE, 50n]],
    ["pendingOwner", TOKEN],
    ["fee", 51n],
    ["feeRecipient", USER],
    ["skimRecipient", RECIPIENT],
    ["totalSupply", 52n],
    ["totalAssets", 53n],
    ["lastTotalAssets", 54n],
    ["lostAssets", 55n],
    ["supplyQueueLength", 0n],
    ["withdrawQueueLength", 0n],
  ] as const) {
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName,
      result,
    });
  }
  mockRead(handle, {
    address: ADDRESSES.metaMorphoFactory,
    abi: metaMorphoFactoryIsMetaMorphoAbi,
    functionName: "isMetaMorpho",
    result: isMetaMorphoV1_1,
  });
}

// biome-ignore lint/complexity/useMaxParams: Test helper keeps call sites compact.
function mockTokenReads(
  handle: ReturnType<typeof createMockClient>,
  address: Address,
  options: { symbol?: string; name?: string; decimals?: number } = {},
) {
  mockRead(handle, {
    address,
    abi: erc20Abi,
    functionName: "decimals",
    result: options.decimals ?? 18,
  });
  mockRead(handle, {
    address,
    abi: erc20Abi,
    functionName: "symbol",
    result: options.symbol ?? "MOCK",
  });
  mockRead(handle, {
    address,
    abi: erc20Abi,
    functionName: "name",
    result: options.name ?? "Mock Token",
  });
  mockRead(handle, {
    address,
    abi: erc5267Abi,
    functionName: "eip712Domain",
    result: [
      DOMAIN.fields,
      DOMAIN.name,
      DOMAIN.version,
      DOMAIN.chainId,
      address,
      DOMAIN.salt,
      DOMAIN.extensions,
    ],
  });
}

describe("decodeBytes32String", () => {
  test("decodes bytes32 hex and leaves plain strings unchanged", () => {
    expect(decodeBytes32String(stringToHex("MORPHO", { size: 32 }))).toBe(
      "MORPHO",
    );
    expect(decodeBytes32String("MORPHO")).toBe("MORPHO");
  });
});

describe("fetchToken", () => {
  test("returns the native token without RPC reads", async () => {
    const { client } = createMockClient(mainnet);

    const token = await fetchToken(NATIVE_ADDRESS, client);

    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBe(NATIVE_ADDRESS);
    expect(token.symbol).toBe("ETH");
  });

  test("uses deployless token metadata and EIP-5267 data", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, tokenQueryAbi, "query", {
      decimals: 18n,
      hasSymbol: true,
      symbol: "MOCK",
      hasName: true,
      name: "Mock Token",
      stEthPerWstEth: 0n,
      eip5267Domain: DOMAIN,
      hasEip5267Domain: true,
    });

    const token = await fetchToken(TOKEN, handle.client, {});

    expect(token).toBeInstanceOf(Token);
    expect(token.symbol).toBe("MOCK");
    expect(token.name).toBe("Mock Token");
    expect(token.eip5267Domain).toBeInstanceOf(Eip5267Domain);
  });

  test("returns an exchange-rate wrapper for wstETH deployless metadata", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, tokenQueryAbi, "query", {
      decimals: 18n,
      hasSymbol: false,
      symbol: "",
      hasName: false,
      name: "",
      stEthPerWstEth: 1_000000000000000000n,
      eip5267Domain: DOMAIN,
      hasEip5267Domain: false,
    });

    const token = await fetchToken(ADDRESSES.wstEth, handle.client, {});

    expect(token).toBeInstanceOf(ExchangeRateWrappedToken);
    expect((token as ExchangeRateWrappedToken).underlying).toBe(
      ADDRESSES.stEth,
    );
  });

  test("falls back to bytes32 metadata and wraps known wrapped tokens", async () => {
    const handle = createMockClient(mainnet);
    const address = ADDRESSES.wbIB01;
    mockRead(handle, {
      address,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockReadFailure(handle, {
      address,
      abi: erc20Abi,
      functionName: "symbol",
    });
    mockRead(handle, {
      address,
      abi: erc20Abi_bytes32,
      functionName: "symbol",
      result: stringToHex("wBIB01", { size: 32 }),
    });
    mockReadFailure(handle, {
      address,
      abi: erc20Abi,
      functionName: "name",
    });
    mockRead(handle, {
      address,
      abi: erc20Abi_bytes32,
      functionName: "name",
      result: stringToHex("Wrapped BIB01", { size: 32 }),
    });
    mockReadFailure(handle, {
      address,
      abi: erc5267Abi,
      functionName: "eip712Domain",
    });

    const token = await fetchToken(address, handle.client, {
      deployless: false,
    });

    expect(token).toBeInstanceOf(ConstantWrappedToken);
    expect(token.symbol).toBe("wBIB01");
    expect(token.name).toBe("Wrapped BIB01");
  });

  test("uses multicall wstETH exchange-rate metadata", async () => {
    const handle = createMockClient(mainnet);
    mockTokenReads(handle, ADDRESSES.wstEth, {
      symbol: "wstETH",
      name: "Wrapped liquid staked Ether 2.0",
    });
    mockRead(handle, {
      address: ADDRESSES.wstEth,
      abi: wstEthAbi,
      functionName: "stEthPerToken",
      result: 1_000000000000000000n,
    });

    const token = await fetchToken(ADDRESSES.wstEth, handle.client, {
      deployless: false,
    });

    expect(token).toBeInstanceOf(ExchangeRateWrappedToken);
    expect((token as ExchangeRateWrappedToken).underlying).toBe(
      ADDRESSES.stEth,
    );
  });

  test("behavior: matches wstETH and unwrap tokens case-insensitively", async () => {
    const handle = createMockClient(mainnet);
    const wstEth = ADDRESSES.wstEth.toLowerCase() as Address;
    mockTokenReads(handle, wstEth, {
      symbol: "wstETH",
      name: "Wrapped liquid staked Ether 2.0",
    });
    mockRead(handle, {
      address: ADDRESSES.wstEth,
      abi: wstEthAbi,
      functionName: "stEthPerToken",
      result: 1_000000000000000000n,
    });
    const wbIB01 = ADDRESSES.wbIB01.toLowerCase() as Address;
    mockTokenReads(handle, wbIB01, {
      symbol: "wBIB01",
      name: "Wrapped BIB01",
    });

    const [wstEthToken, wbIB01Token] = await Promise.all([
      fetchToken(wstEth, handle.client, {
        deployless: false,
      }),
      fetchToken(wbIB01, handle.client, {
        deployless: false,
      }),
    ]);

    expect(wstEthToken).toBeInstanceOf(ExchangeRateWrappedToken);
    expect(wstEthToken.address).toBe(wstEth);
    expect(wbIB01Token).toBeInstanceOf(ConstantWrappedToken);
    expect((wbIB01Token as ConstantWrappedToken).underlying).toBe(
      ADDRESSES.bIB01,
    );
  });

  test("returns undefined metadata when every optional ERC20 read fails", async () => {
    const handle = createMockClient(mainnet);
    for (const abi of [erc20Abi, erc20Abi_bytes32]) {
      mockReadFailure(handle, { address: TOKEN, abi, functionName: "symbol" });
      mockReadFailure(handle, { address: TOKEN, abi, functionName: "name" });
    }
    mockReadFailure(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "decimals",
    });
    mockReadFailure(handle, {
      address: TOKEN,
      abi: erc5267Abi,
      functionName: "eip712Domain",
    });

    const token = await fetchToken(TOKEN, handle.client, {
      deployless: false,
    });

    expect(token.decimals).toBe(0);
    expect(token.symbol).toBeUndefined();
    expect(token.name).toBeUndefined();
  });

  test("returns a deployless constant wrapper for known wrapped tokens", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, tokenQueryAbi, "query", {
      decimals: 6n,
      hasSymbol: true,
      symbol: "wBIB01",
      hasName: true,
      name: "Wrapped BIB01",
      stEthPerWstEth: 0n,
      eip5267Domain: DOMAIN,
      hasEip5267Domain: false,
    });

    const token = await fetchToken(ADDRESSES.wbIB01, handle.client, {});

    expect(token).toBeInstanceOf(ConstantWrappedToken);
  });

  test("falls through when the chain has no wstETH unwrap token", async () => {
    const { client } = createMockClient({
      ...mainnet,
      id: ChainId.ZeroGMainnet,
    });

    const token = await fetchToken(undefined as unknown as Address, client, {
      deployless: false,
    });

    expect(token).toBeInstanceOf(Token);
    expect(token.address).toBeUndefined();
  });

  test("falls back from a failing deployless read to multicall", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockTokenReads(handle, TOKEN, { symbol: "FALL", name: "Fallback Token" });

    const token = await fetchToken(TOKEN, handle.client, {});

    expect(token.symbol).toBe("FALL");
    expect(token.name).toBe("Fallback Token");
  });

  test("throws the deployless failure when deployless is forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchToken(TOKEN, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });
});

describe("fetchMarket", () => {
  test("uses the deployless market query", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, marketQueryAbi, "query", {
      marketParams: marketParamsTuple(),
      market: marketTuple,
      hasPrice: true,
      price: 123n,
      rateAtTarget: 456n,
    });

    const market = await fetchMarket(ID, handle.client);

    expect(market).toBeInstanceOf(Market);
    expect(market.params.id).toBe(ID);
    expect(market.price).toBe(123n);
    expect(market.rateAtTarget).toBe(456n);
  });

  test("omits optional deployless price and rate when unavailable", async () => {
    const handle = createMockClient(mainnet);
    const idle = MarketParams.idle(TOKEN);
    mockDeploylessRead(handle, marketQueryAbi, "query", {
      marketParams: marketParamsTuple(idle),
      market: marketTuple,
      hasPrice: false,
      price: 0n,
      rateAtTarget: 0n,
    });

    const market = await fetchMarket(idle.id, handle.client, {});

    expect(market.price).toBeUndefined();
    expect(market.rateAtTarget).toBeUndefined();
  });

  test("behavior: detects the adaptive IRM case-insensitively", async () => {
    const lowercaseIrm = ADDRESSES.adaptiveCurveIrm.toLowerCase() as Address;
    registerCustomAddresses({
      addresses: {
        [LOWERCASE_IRM_CHAIN_ID]: {
          blue: ADDRESSES.blue,
          adaptiveCurveIrm: lowercaseIrm,
        } satisfies ChainAddresses,
      },
    });

    const deploylessHandle = createMockClient(mainnet);
    mockDeploylessRead(deploylessHandle, marketQueryAbi, "query", {
      marketParams: marketParamsTuple(),
      market: marketTuple,
      hasPrice: true,
      price: 123n,
      rateAtTarget: 456n,
    });
    const deploylessMarket = await fetchMarket(ID, deploylessHandle.client, {
      chainId: LOWERCASE_IRM_CHAIN_ID,
    });
    expect(deploylessMarket.rateAtTarget).toBe(456n);

    const multicallHandle = createMockClient(mainnet);
    mockMarketReads(multicallHandle);
    const multicallMarket = await fetchMarket(ID, multicallHandle.client, {
      chainId: LOWERCASE_IRM_CHAIN_ID,
      deployless: false,
    });
    expect(multicallMarket.rateAtTarget).toBe(456n);
  });

  test("uses multicall when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockMarketReads(handle);

    const market = await fetchMarket(ID, handle.client, {
      deployless: false,
    });

    expect(market.price).toBe(123n);
    expect(market.rateAtTarget).toBe(456n);
  });

  test("continues when the oracle price read reverts", async () => {
    const handle = createMockClient(mainnet);
    mockMarketReads(handle);
    mockReadFailure(handle, {
      address: ORACLE,
      abi: blueOracleAbi,
      functionName: "price",
    });

    const market = await fetchMarket(ID, handle.client, {
      deployless: false,
    });

    expect(market.price).toBeUndefined();
    expect(market.rateAtTarget).toBe(456n);
  });

  test("falls back from a failing deployless market query to multicall", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockMarketReads(handle);

    const market = await fetchMarket(ID, handle.client, {});

    expect(market.price).toBe(123n);
    expect(market.rateAtTarget).toBe(456n);
  });

  test("throws the deployless market failure when forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchMarket(ID, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("skips oracle and IRM reads for idle multicall markets", async () => {
    const handle = createMockClient(mainnet);
    const idle = MarketParams.idle(TOKEN);
    mockRead(handle, {
      address: ADDRESSES.blue,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: marketParamsTuple(idle),
    });
    mockRead(handle, {
      address: ADDRESSES.blue,
      abi: blueAbi,
      functionName: "market",
      result: marketTuple,
    });

    const market = await fetchMarket(idle.id, handle.client, {
      deployless: false,
    });

    expect(market.price).toBeUndefined();
    expect(market.rateAtTarget).toBeUndefined();
  });
});

describe("fetchPosition", () => {
  test("fetches a position", async () => {
    const handle = createMockClient(mainnet);
    mockPositionReads(handle);

    const position = await fetchPosition(USER, ID, handle.client);

    expect(position).toBeInstanceOf(Position);
    expect(position.user).toBe(USER);
    expect(position.supplyShares).toBe(11n);
    expect(position.borrowShares).toBe(12n);
    expect(position.collateral).toBe(13n);
  });

  test("fetches a pre-liquidation position with oracle price", async () => {
    const handle = createMockClient(mainnet);
    mockPositionReads(handle);
    mockMarketReads(handle);
    mockRead(handle, {
      address: PRE_LIQUIDATION,
      abi: preLiquidationAbi,
      functionName: "preLiquidationParams",
      result: [
        800000000000000000n,
        900000000000000000n,
        950000000000000000n,
        1010000000000000000n,
        1020000000000000000n,
        ORACLE,
      ],
    });

    const preLiquidationPosition = await fetchPreLiquidationPosition(
      USER,
      ID,
      PRE_LIQUIDATION,
      handle.client,
      { deployless: false },
    );

    expect(preLiquidationPosition).toBeInstanceOf(PreLiquidationPosition);
    expect(preLiquidationPosition.preLiquidationParams).toBeInstanceOf(
      PreLiquidationParams,
    );
    expect(preLiquidationPosition.preLiquidationOraclePrice).toBe(123n);
  });

  test("fetchAccrualPosition composes position and market", async () => {
    const handle = createMockClient(mainnet);
    mockPositionReads(handle);
    mockMarketReads(handle);

    const position = await fetchAccrualPosition(USER, ID, handle.client, {
      deployless: false,
    });

    expect(position.market.id).toBe(ID);
    expect(position.supplyShares).toBe(11n);
  });

  test("fetchPreLiquidationParams returns typed pre-liquidation params", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: PRE_LIQUIDATION,
      abi: preLiquidationAbi,
      functionName: "preLiquidationParams",
      result: [
        800000000000000000n,
        900000000000000000n,
        950000000000000000n,
        1010000000000000000n,
        1020000000000000000n,
        ORACLE,
      ],
    });

    const params = await fetchPreLiquidationParams(
      PRE_LIQUIDATION,
      handle.client,
    );

    expect(params).toBeInstanceOf(PreLiquidationParams);
    expect(params.preLiquidationOracle).toBe(ORACLE);
  });

  test("returns undefined pre-liquidation oracle price when the read fails", async () => {
    const handle = createMockClient(mainnet);
    mockPositionReads(handle);
    mockMarketReads(handle);
    mockRead(handle, {
      address: PRE_LIQUIDATION,
      abi: preLiquidationAbi,
      functionName: "preLiquidationParams",
      result: [
        800000000000000000n,
        900000000000000000n,
        950000000000000000n,
        1010000000000000000n,
        1020000000000000000n,
        ORACLE,
      ],
    });
    mockReadFailure(handle, {
      address: ORACLE,
      abi: blueOracleAbi,
      functionName: "price",
    });

    const preLiquidationPosition = await fetchPreLiquidationPosition(
      USER,
      ID,
      PRE_LIQUIDATION,
      handle.client,
      { deployless: false },
    );

    expect(preLiquidationPosition.preLiquidationOraclePrice).toBeUndefined();
  });
});

describe("fetchHolding", () => {
  test("returns native holding balances and unlimited ERC20 allowances", async () => {
    const handle = createMockClient(mainnet);
    mockNativeBalance(handle, 99n);

    const holding = await fetchHolding(USER, NATIVE_ADDRESS, handle.client);

    expect(holding).toBeInstanceOf(Holding);
    expect(holding.balance).toBe(99n);
    expect(holding.erc20Allowances.blue).toBe(maxUint256);
  });

  test("uses zero native balance on chains with unreliable native balances", async () => {
    const { client } = createMockClient({
      ...mainnet,
      id: ChainId.TempoMainnet,
    });

    const holding = await fetchHolding(USER, NATIVE_ADDRESS, client);

    expect(holding.balance).toBe(0n);
  });

  test("uses the deployless ERC20 holding query", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, holdingQueryAbi, "query", {
      balance: 10n,
      erc20Allowances: {
        blue: 11n,
        permit2: 12n,
      },
      isErc2612: true,
      erc2612Nonce: 17n,
      canTransfer: 2,
    });

    const holding = await fetchHolding(USER, TOKEN, handle.client);

    expect(holding.balance).toBe(10n);
    expect(holding.erc20Allowances.blue).toBe(11n);
    expect(holding.erc2612Nonce).toBe(17n);
    expect(holding.canTransfer).toBe(true);
  });

  test("omits the deployless ERC2612 nonce when the token is not permit-capable", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, holdingQueryAbi, "query", {
      balance: 10n,
      erc20Allowances: {
        blue: 11n,
        permit2: 12n,
      },
      isErc2612: false,
      erc2612Nonce: 17n,
      canTransfer: 1,
    });

    const holding = await fetchHolding(USER, TOKEN, handle.client);

    expect(holding.erc2612Nonce).toBeUndefined();
    expect(holding.canTransfer).toBe(false);
  });

  test("uses multicall and backed-token whitelist reads", async () => {
    const handle = createMockClient(mainnet);
    const token = ADDRESSES.wbIB01;
    const whitelist = RECIPIENT;

    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 20n,
    });
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: 21n,
    });
    mockRead(handle, {
      address: token,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 25n,
    });
    mockRead(handle, {
      address: token,
      abi: wrappedBackedTokenAbi,
      functionName: "whitelistControllerAggregator",
      result: whitelist,
    });
    mockRead(handle, {
      address: token,
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
      result: true,
    });
    mockRead(handle, {
      address: whitelist,
      abi: whitelistControllerAggregatorV2Abi,
      functionName: "isWhitelisted",
      result: false,
    });

    const holding = await fetchHolding(USER, token, handle.client, {
      deployless: false,
    });

    expect(holding.balance).toBe(20n);
    expect(holding.erc20Allowances.blue).toBe(21n);
    expect(holding.erc2612Nonce).toBe(25n);
    expect(holding.canTransfer).toBe(false);
  });

  test("behavior: matches permissioned backed tokens case-insensitively", async () => {
    const handle = createMockClient(mainnet);
    const token = ADDRESSES.wbIB01.toLowerCase() as Address;
    const whitelist = RECIPIENT;

    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 20n,
    });
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: 21n,
    });
    mockReadFailure(handle, {
      address: token,
      abi: erc2612Abi,
      functionName: "nonces",
    });
    mockRead(handle, {
      address: token,
      abi: wrappedBackedTokenAbi,
      functionName: "whitelistControllerAggregator",
      result: whitelist,
    });
    mockRead(handle, {
      address: token,
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
      result: true,
    });
    mockRead(handle, {
      address: whitelist,
      abi: whitelistControllerAggregatorV2Abi,
      functionName: "isWhitelisted",
      result: false,
    });

    const holding = await fetchHolding(USER, token, handle.client, {
      deployless: false,
    });

    expect(holding.token).toBe(token);
    expect(holding.canTransfer).toBe(false);
  });

  test("uses zero permit2 allowance when the chain has no Permit2 address", async () => {
    const handle = createMockClient({
      ...mainnet,
      id: ChainId.ZeroGMainnet,
    });
    const zeroGAddresses = addressesRegistry[ChainId.ZeroGMainnet];

    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 20n,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      result: 21n,
    });
    mockReadFailure(handle, {
      address: TOKEN,
      abi: erc2612Abi,
      functionName: "nonces",
    });
    mockRead(handle, {
      address: TOKEN,
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
      result: true,
    });

    const holding = await fetchHolding(USER, TOKEN, handle.client, {
      deployless: false,
    });

    expect(holding.erc20Allowances.blue).toBe(21n);
    expect(holding.erc20Allowances.permit2).toBe(0n);
    expect("permit2" in zeroGAddresses).toBe(false);
  });

  test("sets backed-token transfer permission to undefined when the whitelist read fails", async () => {
    const handle = createMockClient(mainnet);
    const token = ADDRESSES.wbIB01;
    const whitelist = RECIPIENT;

    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 20n,
    });
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: 21n,
    });
    mockReadFailure(handle, {
      address: token,
      abi: erc2612Abi,
      functionName: "nonces",
    });
    mockRead(handle, {
      address: token,
      abi: wrappedBackedTokenAbi,
      functionName: "whitelistControllerAggregator",
      result: whitelist,
    });
    mockRead(handle, {
      address: token,
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
      result: true,
    });
    mockReadFailure(handle, {
      address: whitelist,
      abi: whitelistControllerAggregatorV2Abi,
      functionName: "isWhitelisted",
    });

    const holding = await fetchHolding(USER, token, handle.client, {
      deployless: false,
    });

    expect(holding.canTransfer).toBeUndefined();
  });

  test("falls back from deployless holding reads and tolerates optional read failures", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "balanceOf",
      result: 20n,
    });
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      result: 21n,
    });
    mockReadFailure(handle, {
      address: TOKEN,
      abi: erc2612Abi,
      functionName: "nonces",
    });
    mockReadFailure(handle, {
      address: TOKEN,
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
    });

    const holding = await fetchHolding(USER, TOKEN, handle.client);

    expect(holding.erc2612Nonce).toBeUndefined();
    expect(holding.canTransfer).toBe(true);
  });

  test("throws the deployless holding failure when forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchHolding(USER, TOKEN, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });
});

describe("fetchMarketParams", () => {
  test("returns known market params without reading RPC", async () => {
    const { client } = createMockClient(mainnet);

    const params = await fetchMarketParams(ID, client);

    expect(params.id).toBe(ID);
  });

  test("fetches unknown market params from Morpho", async () => {
    const handle = createMockClient(mainnet);
    const id = `0x${"12".repeat(32)}` as typeof ID;
    mockRead(handle, {
      address: ADDRESSES.blue,
      abi: blueAbi,
      functionName: "idToMarketParams",
      result: marketParamsTuple(),
    });

    const params = await fetchMarketParams(id, handle.client);

    expect(params.id).toBe(ID);
  });
});

describe("fetchUser", () => {
  test("fetches the Morpho nonce", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.blue,
      abi: blueAbi,
      functionName: "nonce",
      result: 26n,
    });

    const user = await fetchUser(USER, handle.client, {});

    expect(user).toBeInstanceOf(User);
    expect(user.morphoNonce).toBe(26n);
  });

  test("defaults chainId from the client", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: ADDRESSES.blue,
      abi: blueAbi,
      functionName: "nonce",
      result: 0n,
    });

    const user = await fetchUser(USER, handle.client);

    expect(user.morphoNonce).toBe(0n);
  });
});

describe("vault fetchers", () => {
  test("fetchVaultConfig composes token metadata with vault asset data", async () => {
    const handle = createMockClient(mainnet);
    mockVaultConfigReads(handle);

    const config = await fetchVaultConfig(VAULT, handle.client, {
      deployless: false,
    });

    expect(config).toBeInstanceOf(VaultConfig);
    expect(config.asset).toBe(TOKEN);
    expect(config.decimalsOffset).toBe(2n);
  });

  test("fetchVaultMarketConfig composes vault cap data", async () => {
    const handle = createMockClient(mainnet);
    mockVaultMarketConfigReads(handle);

    const config = await fetchVaultMarketConfig(VAULT, ID, handle.client);

    expect(config).toBeInstanceOf(VaultMarketConfig);
    expect(config.cap).toBe(29n);
    expect(config.pendingCap).toEqual({ value: 31n, validAt: 32n });
  });

  test("fetchVaultUser uses the deployless vault-user query", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultUserQueryAbi, "query", {
      isAllocator: true,
      allowance: 35n,
    });

    const vaultUser = await fetchVaultUser(VAULT, USER, handle.client);

    expect(vaultUser).toBeInstanceOf(VaultUser);
    expect(vaultUser.isAllocator).toBe(true);
    expect(vaultUser.allowance).toBe(35n);
  });

  test("fetchVaultUser falls back to asset allowance and allocator status", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultConfigReads(handle);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      result: 36n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      result: false,
    });

    const vaultUser = await fetchVaultUser(VAULT, USER, handle.client, {});

    expect(vaultUser.allowance).toBe(36n);
    expect(vaultUser.isAllocator).toBe(false);
  });

  test("fetchVaultUser uses multicall directly when deployless is disabled", async () => {
    const handle = createMockClient(mainnet);
    mockVaultConfigReads(handle);
    mockRead(handle, {
      address: TOKEN,
      abi: erc20Abi,
      functionName: "allowance",
      result: 36n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      result: true,
    });

    const vaultUser = await fetchVaultUser(VAULT, USER, handle.client, {
      deployless: false,
    });

    expect(vaultUser.allowance).toBe(36n);
    expect(vaultUser.isAllocator).toBe(true);
  });

  test("fetchVaultUser throws the deployless failure when forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVaultUser(VAULT, USER, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("fetchVault uses the deployless vault query", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessRead(handle, vaultQueryAbi, "query", {
      config: {
        asset: TOKEN,
        symbol: "vMOCK",
        name: "Vault Mock",
        decimals: 18n,
        decimalsOffset: 2n,
        eip5267Domain: DOMAIN,
      },
      owner: USER,
      curator: RECIPIENT,
      guardian: COLLATERAL,
      timelock: 37n,
      pendingTimelock: { value: 38n, validAt: 39n },
      pendingGuardian: { value: ORACLE, validAt: 40n },
      pendingOwner: TOKEN,
      fee: 41n,
      feeRecipient: USER,
      skimRecipient: RECIPIENT,
      totalSupply: 42n,
      totalAssets: 43n,
      lastTotalAssets: 44n,
      hasLostAssets: true,
      lostAssets: 55n,
      supplyQueue: [ID],
      withdrawQueue: [ID],
    });

    const vault = await fetchVault(VAULT, handle.client);

    expect(vault).toBeInstanceOf(Vault);
    expect(vault.address).toBe(VAULT);
    expect(vault.withdrawQueue).toEqual([ID]);
    expect(vault.lostAssets).toBe(55n);
  });

  test("fetchVault throws UnknownFactory when the chain has no MetaMorpho factory", async () => {
    const { client } = createMockClient({
      ...mainnet,
      id: ChainId.TempoMainnet,
    });

    await expect(fetchVault(VAULT, client)).rejects.toThrow(UnknownFactory);
  });

  test("fetchVault throws the deployless failure when forced", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);

    await expect(
      fetchVault(VAULT, handle.client, {
        deployless: "force",
      }),
    ).rejects.toThrow();
  });

  test("fetchVault skips the legacy factory fallback when the v1.1 factory recognizes the vault", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultMulticallReads(handle);

    const vault = await fetchVault(VAULT, handle.client, {
      deployless: false,
    });

    expect(vault.totalAssets).toBe(53n);
  });

  test("fetchVault does not use the legacy factory fallback on unsupported chains", async () => {
    const handle = createMockClient({
      ...mainnet,
      id: META_MORPHO_WITHOUT_LEGACY_FALLBACK_CHAIN_ID,
    });
    mockDeploylessReads(handle, ["0x"]);
    mockVaultMulticallReads(handle, { isMetaMorphoV1_1: false });

    await expect(
      fetchVault(VAULT, handle.client, {
        deployless: false,
      }),
    ).rejects.toThrow(UnknownOfFactory);
  });

  test("fetchVault uses multicall and the MetaMorpho v1.0 factory fallback", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultConfigReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "curator",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "owner",
      result: USER,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "guardian",
      result: COLLATERAL,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "timelock",
      result: 47n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingTimelock",
      result: [48n, 49n],
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingGuardian",
      result: [ORACLE, 50n],
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingOwner",
      result: TOKEN,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "fee",
      result: 51n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "feeRecipient",
      result: USER,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "totalSupply",
      result: 52n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "totalAssets",
      result: 53n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "lastTotalAssets",
      result: 54n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "lostAssets",
      result: 55n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "supplyQueueLength",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      result: true,
    });
    mockReadFailure(handle, {
      address: ADDRESSES.metaMorphoFactory,
      abi: metaMorphoFactoryIsMetaMorphoAbi,
      functionName: "isMetaMorpho",
    });
    mockRead(handle, {
      address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      abi: metaMorphoFactoryIsMetaMorphoAbi,
      functionName: "isMetaMorpho",
      result: true,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "supplyQueue",
      result: ID,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "withdrawQueue",
      result: ID,
    });

    const vault = await fetchVault(VAULT, handle.client, {
      deployless: false,
    });

    expect(vault.totalAssets).toBe(53n);
    expect(vault.lostAssets).toBe(55n);
    expect(vault.supplyQueue).toEqual([ID]);
  });

  test("fetchVault throws UnknownOfFactory when neither factory recognizes the vault", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, ["0x"]);
    mockVaultConfigReads(handle);
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "curator",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "owner",
      result: USER,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "guardian",
      result: COLLATERAL,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "timelock",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingTimelock",
      result: [1n, 2n],
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingGuardian",
      result: [ORACLE, 3n],
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "pendingOwner",
      result: TOKEN,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "fee",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "feeRecipient",
      result: USER,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "skimRecipient",
      result: RECIPIENT,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "totalSupply",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "totalAssets",
      result: 1n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "lastTotalAssets",
      result: 1n,
    });
    mockReadFailure(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "lostAssets",
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "supplyQueueLength",
      result: 0n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "withdrawQueueLength",
      result: 0n,
    });
    mockRead(handle, {
      address: VAULT,
      abi: metaMorphoAbi,
      functionName: "isAllocator",
      result: false,
    });
    mockRead(handle, {
      address: ADDRESSES.metaMorphoFactory,
      abi: metaMorphoFactoryIsMetaMorphoAbi,
      functionName: "isMetaMorpho",
      result: false,
    });
    mockRead(handle, {
      address: "0xA9c3D3a366466Fa809d1Ae982Fb2c46E5fC41101",
      abi: metaMorphoFactoryIsMetaMorphoAbi,
      functionName: "isMetaMorpho",
      result: false,
    });

    await expect(fetchVault(VAULT, handle.client, {})).rejects.toThrow(
      UnknownOfFactory,
    );
  });

  test("fetchVaultMarketAllocation composes market config and accrual position", async () => {
    const handle = createMockClient(mainnet);
    mockVaultMarketConfigReads(handle);
    mockPositionReads(handle);
    mockMarketReads(handle);

    const allocation = await fetchVaultMarketAllocation(
      VAULT,
      ID,
      handle.client,
      { deployless: false },
    );

    expect(allocation).toBeInstanceOf(VaultMarketAllocation);
    expect(allocation.config.cap).toBe(29n);
    expect(allocation.position.market.price).toBe(123n);
  });

  test("fetchAccrualVault preserves direct latest state without pinning reads", async () => {
    const handle = createMockClient(mainnet);
    mockDeploylessReads(handle, [
      encodeReadResult(vaultQueryAbi, "query", {
        config: {
          asset: TOKEN,
          symbol: "vMOCK",
          name: "Vault Mock",
          decimals: 18n,
          decimalsOffset: 2n,
          eip5267Domain: DOMAIN,
        },
        owner: USER,
        curator: RECIPIENT,
        guardian: COLLATERAL,
        timelock: 37n,
        pendingTimelock: { value: 38n, validAt: 39n },
        pendingGuardian: { value: ORACLE, validAt: 40n },
        pendingOwner: TOKEN,
        fee: 41n,
        feeRecipient: USER,
        skimRecipient: RECIPIENT,
        totalSupply: 42n,
        totalAssets: 55n,
        lastTotalAssets: 55n,
        hasLostAssets: true,
        lostAssets: 55n,
        supplyQueue: [ID],
        withdrawQueue: [ID],
      }),
      encodeReadResult(marketQueryAbi, "query", {
        marketParams: marketParamsTuple(),
        market: marketTuple,
        hasPrice: true,
        price: 123n,
        rateAtTarget: 456n,
      }),
    ]);
    mockVaultMarketConfigReads(handle);
    mockPositionReads(handle);

    const parameters = { blockTag: "latest" } as const;
    const vault = await fetchAccrualVault(VAULT, handle.client, parameters);

    expect(vault).toBeInstanceOf(AccrualVault);
    expect(vault.totalAssets).toBe(0n);
    expect(vault.lostAssets).toBe(55n);
    expect(vault.totalSupply).toBe(42n);
    expect(vault.allocations.get(ID)?.marketId).toBe(ID);
    expect(
      handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call")
        .every((call) => call.params?.[1] === "latest"),
    ).toBe(true);
    expect(
      handle.request.mock.calls.some(
        ([call]) => call.method === "eth_getBlockByNumber",
      ),
    ).toBe(false);
    expect(parameters).toStrictEqual({ blockTag: "latest" });
  });
});
