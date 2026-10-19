import {
  AccrualVaultV2,
  getChainAddresses,
  Holding,
  Market,
  MarketParams,
  permissionedBackedTokens,
  UnknownOfFactory,
  UnsupportedVaultV2AdapterError,
} from "@morpho-org/blue-sdk";
import { classifyError, expectFailClosed } from "@morpho-org/test/chaos";
import {
  type AbiFunction,
  type AbiParameter,
  BaseError,
  type Client,
  ContractFunctionRevertedError,
  createClient,
  encodeAbiParameters,
  encodeErrorResult,
  encodeFunctionData,
  encodeFunctionResult,
  type Hex,
  HttpRequestError,
  http,
  LimitExceededRpcError,
  toFunctionSelector,
  zeroAddress,
} from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as allAbis from "../abis.js";
import {
  blueAbi,
  blueOracleAbi,
  erc2612Abi,
  metaMorphoFactoryAbi,
  morphoMarketV1AdapterFactoryAbi,
  morphoMarketV1AdapterV2FactoryAbi,
  morphoVaultV1AdapterFactoryAbi,
  permissionedErc20WrapperAbi,
  whitelistControllerAggregatorV2Abi,
  wrappedBackedTokenAbi,
} from "../abis.js";
import { fetchHolding } from "./Holding.js";
import { fetchMarket } from "./Market.js";
import { fetchPreLiquidationPosition } from "./Position.js";
import { fetchToken } from "./Token.js";
import { fetchVault } from "./Vault.js";
import { fetchVaultUser } from "./VaultUser.js";
import { fetchAccrualVaultV2, fetchVaultV2 } from "./vault-v2/VaultV2.js";
import {
  fetchAccrualVaultV2Adapter,
  fetchVaultV2Adapter,
} from "./vault-v2/VaultV2Adapter.js";
import { fetchVaultV2BluePublicAllocatorData } from "./vault-v2/VaultV2BluePublicAllocatorConfig.js";
import { fetchVaultV2MorphoMarketV1Adapter } from "./vault-v2/VaultV2MorphoMarketV1Adapter.js";
import { fetchVaultV2MorphoMarketV1AdapterV2 } from "./vault-v2/VaultV2MorphoMarketV1AdapterV2.js";
import { fetchVaultV2MorphoVaultV1Adapter } from "./vault-v2/VaultV2MorphoVaultV1Adapter.js";

const oracle = "0x0000000000000000000000000000000000000123";
const marketParams = new MarketParams({
  loanToken: "0x0000000000000000000000000000000000000001",
  collateralToken: "0x0000000000000000000000000000000000000002",
  oracle,
  irm: "0x0000000000000000000000000000000000000000",
  lltv: 860000000000000000n,
});
const marketId = marketParams.id;
const blue = getChainAddresses(1).blue!;
const allocatorVault = new AccrualVaultV2(
  {
    address: "0x0000000000000000000000000000000000000001",
    asset: "0x0000000000000000000000000000000000000002",
    _totalAssets: 0n,
    totalSupply: 0n,
    virtualShares: 0n,
    maxRate: 0n,
    lastUpdate: 0n,
    liquidityAdapter: zeroAddress,
    liquidityData: "0x",
    liquidityAllocations: undefined,
    performanceFee: 0n,
    managementFee: 0n,
    performanceFeeRecipient: zeroAddress,
    managementFeeRecipient: zeroAddress,
  },
  undefined,
  [],
  0n,
  {},
);
const unsupportedVaultV2AdapterErrorAbi = [
  {
    type: "error",
    name: "UnsupportedVaultV2Adapter",
    inputs: [{ type: "address", name: "adapter" }],
  },
] as const;

type JsonRpcRequest = {
  id: number | string | null;
  method: string;
  params?: readonly unknown[];
};

type RpcFault =
  | "refused"
  | "http400"
  | "http413"
  | "http429"
  | "http429Revert"
  | "http503Html"
  | "rpcLimit"
  | "rpcGasAllowance"
  | "revert"
  | "rpcRevertNoData";

const abiFunctionBySelector = new Map<Hex, AbiFunction>();
for (const abi of Object.values(allAbis)) {
  if (!Array.isArray(abi)) continue;
  for (const item of abi) {
    if (item.type === "function") {
      const functionAbi = item as AbiFunction;
      abiFunctionBySelector.set(toFunctionSelector(functionAbi), functionAbi);
    }
  }
}

const zeroValue = (parameter: AbiParameter): unknown => {
  const array = /^(.*)\[(\d*)\]$/.exec(parameter.type);
  if (array) {
    const item = { ...parameter, type: array[1] } as AbiParameter;
    return array[2] === ""
      ? []
      : Array.from({ length: Number(array[2]) }, () => zeroValue(item));
  }
  if (parameter.type === "tuple") {
    const components = "components" in parameter ? parameter.components : [];
    return (components ?? []).map(zeroValue);
  }
  if (parameter.type === "address")
    return "0x0000000000000000000000000000000000000000";
  if (parameter.type.startsWith("uint") || parameter.type.startsWith("int"))
    return 0n;
  if (parameter.type === "bool") return false;
  if (parameter.type === "string") return "";
  const bytes = /^bytes(\d+)$/.exec(parameter.type);
  if (bytes) return `0x${"00".repeat(Number(bytes[1]))}`;
  return "0x";
};

const encodeZeroResult = (selector: Hex | undefined): Hex => {
  const abi =
    selector === undefined ? undefined : abiFunctionBySelector.get(selector);
  if (!abi || abi.outputs.length === 0) return "0x";
  return encodeAbiParameters(abi.outputs, abi.outputs.map(zeroValue) as never);
};

const createRpc = ({
  fault,
  faultSelector,
  faultAddress,
  resultOverrides,
  zeroResults = false,
  retryCount = 0,
  useDefaultRetry = false,
}: {
  fault?: RpcFault;
  faultSelector?: Hex;
  faultAddress?: string;
  resultOverrides?: ReadonlyMap<string, Hex>;
  zeroResults?: boolean;
  retryCount?: number | undefined;
  useDefaultRetry?: boolean;
} = {}) => {
  const calls: JsonRpcRequest[] = [];
  const results = new Map<string, Hex>([
    [
      `${blue.toLowerCase()}|${
        encodeFunctionData({
          abi: blueAbi,
          functionName: "idToMarketParams",
          args: [marketId],
        }).slice(0, 10) as Hex
      }`,
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "idToMarketParams",
        result: [
          marketParams.loanToken,
          marketParams.collateralToken,
          marketParams.oracle,
          marketParams.irm,
          marketParams.lltv,
        ],
      }),
    ],
    [
      `${blue.toLowerCase()}|${
        encodeFunctionData({
          abi: blueAbi,
          functionName: "market",
          args: [marketId],
        }).slice(0, 10) as Hex
      }`,
      encodeFunctionResult({
        abi: blueAbi,
        functionName: "market",
        result: [0n, 0n, 0n, 0n, 0n, 0n],
      }),
    ],
    [
      `${oracle.toLowerCase()}|${
        encodeFunctionData({
          abi: blueOracleAbi,
          functionName: "price",
        }).slice(0, 10) as Hex
      }`,
      encodeFunctionResult({
        abi: blueOracleAbi,
        functionName: "price",
        result: 1n,
      }),
    ],
  ]);
  for (const [key, value] of resultOverrides ?? []) results.set(key, value);

  const fetchMock = vi.fn(
    async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as
        | JsonRpcRequest
        | JsonRpcRequest[];
      if (
        fault === "refused" &&
        (Array.isArray(request) ? request : [request]).some(
          ({ method }) => method === "eth_call",
        )
      ) {
        calls.push(...(Array.isArray(request) ? request : [request]));
        throw new TypeError("fetch failed");
      }
      if (
        fault === "http429Revert" &&
        (Array.isArray(request) ? request : [request]).some(
          ({ method }) => method === "eth_call",
        )
      ) {
        calls.push(...(Array.isArray(request) ? request : [request]));
        throw new HttpRequestError({
          status: 429,
          url: "http://rpc.test",
          cause: new ContractFunctionRevertedError({
            abi: unsupportedVaultV2AdapterErrorAbi,
            data: encodeErrorResult({
              abi: unsupportedVaultV2AdapterErrorAbi,
              errorName: "UnsupportedVaultV2Adapter",
              args: ["0x0000000000000000000000000000000000000003"],
            }),
            functionName: "query",
          }),
        });
      }
      const respond = (rpc: JsonRpcRequest) => {
        calls.push(rpc);
        if (rpc.method === "eth_chainId")
          return { jsonrpc: "2.0", id: rpc.id, result: "0x1" };
        if (rpc.method !== "eth_call")
          return { jsonrpc: "2.0", id: rpc.id, result: "0x" };

        const call = rpc.params?.[0] as { data?: Hex; to?: string } | undefined;
        const selector = call?.data?.slice(0, 10) as Hex | undefined;
        const isDeploylessHttpFault =
          fault === "http400" || fault === "http413";
        if (
          !fault ||
          (isDeploylessHttpFault && call?.to !== undefined) ||
          (faultSelector &&
            (selector !== faultSelector ||
              call?.to?.toLowerCase() !== faultAddress?.toLowerCase()))
        )
          return {
            jsonrpc: "2.0",
            id: rpc.id,
            result:
              results.get(`${call?.to?.toLowerCase()}|${selector ?? "0x"}`) ??
              (zeroResults ? encodeZeroResult(selector) : "0x"),
          };
        if (fault === "revert")
          return {
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: 3, message: "execution reverted", data: "0x" },
          };
        if (fault === "rpcRevertNoData")
          return {
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32000, message: "execution reverted" },
          };
        if (fault === "rpcGasAllowance")
          return {
            jsonrpc: "2.0",
            id: rpc.id,
            error: {
              code: -32000,
              message: "gas required exceeds allowance",
            },
          };
        if (fault === "rpcLimit")
          return {
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32005, message: "rate limit exceeded" },
          };
        return null;
      };

      const response = (rpc: JsonRpcRequest) => respond(rpc);
      const body = Array.isArray(request)
        ? request.map(response)
        : response(request);
      if (body === null || (Array.isArray(body) && body.includes(null))) {
        if (fault === "http503Html")
          return new Response(
            "<html><body>503 Service Unavailable</body></html>",
            {
              status: 503,
              headers: { "content-type": "text/html" },
            },
          );
        if (fault === "http429")
          return new Response("rate limited", {
            status: 429,
            headers: { "Retry-After": "1" },
          });
        if (fault === "http400" || fault === "http413")
          return new Response("deployless call rejected", {
            status: fault === "http400" ? 400 : 413,
          });
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    fetchMock,
    client: createClient({
      chain: {
        id: 1,
        name: "Ethereum",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: ["http://rpc.test"] } },
      },
      transport: http("http://rpc.test", {
        fetchFn: fetchMock,
        ...(useDefaultRetry ? {} : { retryCount }),
        retryDelay: 1,
      }),
    }),
  };
};

afterEach(() => vi.unstubAllGlobals());

describe("chaos: S7 partial reads", () => {
  it.each(["http429", "rpcLimit"] as const)(
    "propagates oracle price transport errors (%s)",
    async (fault) => {
      const oraclePrice = encodeFunctionData({
        abi: blueOracleAbi,
        functionName: "price",
      });
      const rpc = createRpc({
        fault,
        faultSelector: rpcSelector(oraclePrice),
        faultAddress: oracle,
      });

      const error = await expectFailClosed(
        fetchMarket(marketId, rpc.client, { deployless: false }),
        "infra",
      );

      expect(error).toBeInstanceOf(BaseError);
      expect(
        (error as BaseError).walk((cause) =>
          fault === "rpcLimit"
            ? cause instanceof LimitExceededRpcError
            : cause instanceof HttpRequestError,
        ),
      ).not.toBeNull();
      expect(classifyError(error)).not.toBe("revert");
    },
  );

  it("continues to treat an oracle revert as optional", async () => {
    const oraclePrice = encodeFunctionData({
      abi: blueOracleAbi,
      functionName: "price",
    });
    const rpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(oraclePrice),
      faultAddress: oracle,
    });

    await expect(
      fetchMarket(marketId, rpc.client, { deployless: false }),
    ).resolves.toMatchObject({ price: undefined });
  });

  it("treats a geth execution reverted error without data as optional", async () => {
    const oraclePrice = encodeFunctionData({
      abi: blueOracleAbi,
      functionName: "price",
    });
    const rpc = createRpc({
      fault: "rpcRevertNoData",
      faultSelector: rpcSelector(oraclePrice),
      faultAddress: oracle,
    });

    await expect(
      fetchMarket(marketId, rpc.client, { deployless: false }),
    ).resolves.toMatchObject({ price: undefined });
  });

  it("does not treat a gas allowance error as an optional oracle revert", async () => {
    const oraclePrice = encodeFunctionData({
      abi: blueOracleAbi,
      functionName: "price",
    });
    const rpc = createRpc({
      fault: "rpcGasAllowance",
      faultSelector: rpcSelector(oraclePrice),
      faultAddress: oracle,
    });

    await expect(
      fetchMarket(marketId, rpc.client, { deployless: false }),
    ).rejects.toBeInstanceOf(BaseError);
  });

  it("propagates a lostAssets transport failure but keeps its revert optional", async () => {
    const address = "0x0000000000000000000000000000000000000010";
    const factory = getChainAddresses(1).metaMorphoFactory!;
    const lostAssetsRead = encodeFunctionData({
      abi: allAbis.metaMorphoAbi,
      functionName: "lostAssets",
    });
    const membershipRead = encodeFunctionData({
      abi: metaMorphoFactoryAbi,
      functionName: "isMetaMorpho",
      args: [address],
    });
    const resultOverrides = new Map<string, Hex>([
      [
        `${factory.toLowerCase()}|${rpcSelector(membershipRead)}`,
        encodeFunctionResult({
          abi: metaMorphoFactoryAbi,
          functionName: "isMetaMorpho",
          result: true,
        }),
      ],
    ]);
    const transportRpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(lostAssetsRead),
      faultAddress: address,
      resultOverrides,
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchVault(address, transportRpc.client, { deployless: false }),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(lostAssetsRead),
      faultAddress: address,
      resultOverrides,
      zeroResults: true,
    });
    await expect(
      fetchVault(address, revertRpc.client, { deployless: false }),
    ).resolves.toMatchObject({ lostAssets: undefined });
  });

  it("propagates a 503 HTML body from the optional Vault lostAssets read", async () => {
    const address = "0x0000000000000000000000000000000000000010";
    const factory = getChainAddresses(1).metaMorphoFactory!;
    const lostAssetsRead = encodeFunctionData({
      abi: allAbis.metaMorphoAbi,
      functionName: "lostAssets",
    });
    const membershipRead = encodeFunctionData({
      abi: metaMorphoFactoryAbi,
      functionName: "isMetaMorpho",
      args: [address],
    });
    const resultOverrides = new Map<string, Hex>([
      [
        `${factory.toLowerCase()}|${rpcSelector(membershipRead)}`,
        encodeFunctionResult({
          abi: metaMorphoFactoryAbi,
          functionName: "isMetaMorpho",
          result: true,
        }),
      ],
    ]);
    const rpc = createRpc({
      fault: "http503Html",
      faultSelector: rpcSelector(lostAssetsRead),
      faultAddress: address,
      resultOverrides,
      zeroResults: true,
      retryCount: 0,
    });
    const error = await expectFailClosed(
      fetchVault(address, rpc.client, { deployless: false }),
      "infra",
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 503 });
  });

  it("propagates isMetaMorpho transport failures but keeps factory reverts optional", async () => {
    const address = "0x0000000000000000000000000000000000000010";
    const factory = getChainAddresses(1).metaMorphoFactory!;
    const membershipRead = encodeFunctionData({
      abi: metaMorphoFactoryAbi,
      functionName: "isMetaMorpho",
      args: [address],
    });
    const rpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(membershipRead),
      faultAddress: factory,
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchVault(address, rpc.client, { deployless: false }),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(membershipRead),
      faultAddress: factory,
      zeroResults: true,
    });
    await expect(
      fetchVault(address, revertRpc.client, { deployless: false }),
    ).rejects.toBeInstanceOf(UnknownOfFactory);
  });

  it("propagates pre-liquidation oracle transport failures but keeps reverts optional", async () => {
    const user = "0x0000000000000000000000000000000000000004";
    const preLiquidation = "0x0000000000000000000000000000000000000005";
    const priceRead = encodeFunctionData({
      abi: blueOracleAbi,
      functionName: "price",
    });
    const transportRpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(priceRead),
      faultAddress: "0x0000000000000000000000000000000000000000",
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchPreLiquidationPosition(
        user,
        marketId,
        preLiquidation,
        transportRpc.client,
      ),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(priceRead),
      faultAddress: "0x0000000000000000000000000000000000000000",
      zeroResults: true,
    });
    await expect(
      fetchPreLiquidationPosition(
        user,
        marketId,
        preLiquidation,
        revertRpc.client,
      ),
    ).resolves.toBeDefined();
  });

  it("propagates ERC-2612 nonce transport failures but keeps reverts optional", async () => {
    const user = "0x0000000000000000000000000000000000000004";
    const token = "0x0000000000000000000000000000000000000006";
    const nonceRead = encodeFunctionData({
      abi: erc2612Abi,
      functionName: "nonces",
      args: [user],
    });
    const transportRpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(nonceRead),
      faultAddress: token,
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchHolding(user, token, transportRpc.client, { deployless: false }),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(nonceRead),
      faultAddress: token,
      zeroResults: true,
    });
    await expect(
      fetchHolding(user, token, revertRpc.client, { deployless: false }),
    ).resolves.toBeInstanceOf(Holding);
  });

  it("propagates permission-check transport failures but keeps reverts optional", async () => {
    const user = "0x0000000000000000000000000000000000000004";
    const token = "0x0000000000000000000000000000000000000006";
    const permissionRead = encodeFunctionData({
      abi: permissionedErc20WrapperAbi,
      functionName: "hasPermission",
      args: [user],
    });
    const transportRpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(permissionRead),
      faultAddress: token,
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchHolding(user, token, transportRpc.client, { deployless: false }),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(permissionRead),
      faultAddress: token,
      zeroResults: true,
    });
    await expect(
      fetchHolding(user, token, revertRpc.client, { deployless: false }),
    ).resolves.toBeInstanceOf(Holding);
  });

  it("propagates whitelist transport failures but keeps reverts optional", async () => {
    const user = "0x0000000000000000000000000000000000000004";
    const token = Array.from(permissionedBackedTokens[1]!)[0]!;
    const aggregator = "0x0000000000000000000000000000000000000011";
    const aggregatorRead = encodeFunctionData({
      abi: wrappedBackedTokenAbi,
      functionName: "whitelistControllerAggregator",
    });
    const whitelistRead = encodeFunctionData({
      abi: whitelistControllerAggregatorV2Abi,
      functionName: "isWhitelisted",
      args: [user],
    });
    const resultOverrides = new Map<string, Hex>([
      [
        `${token.toLowerCase()}|${rpcSelector(aggregatorRead)}`,
        encodeFunctionResult({
          abi: wrappedBackedTokenAbi,
          functionName: "whitelistControllerAggregator",
          result: aggregator,
        }),
      ],
    ]);
    const transportRpc = createRpc({
      fault: "http429",
      faultSelector: rpcSelector(whitelistRead),
      faultAddress: aggregator,
      resultOverrides,
      zeroResults: true,
    });
    const error = await expectFailClosed(
      fetchHolding(user, token, transportRpc.client, { deployless: false }),
      "infra",
    );

    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });

    const revertRpc = createRpc({
      fault: "revert",
      faultSelector: rpcSelector(whitelistRead),
      faultAddress: aggregator,
      resultOverrides,
      zeroResults: true,
    });
    await expect(
      fetchHolding(user, token, revertRpc.client, { deployless: false }),
    ).resolves.toBeInstanceOf(Holding);
  });

  it("preserves transport failures and revert fallbacks across all adapter factories", async () => {
    const address = "0x0000000000000000000000000000000000000003";
    const addresses = getChainAddresses(1);
    const factoryReads = [
      {
        factory: addresses.morphoVaultV1AdapterFactory!,
        data: encodeFunctionData({
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        }),
      },
      {
        factory: addresses.morphoMarketV1AdapterFactory!,
        data: encodeFunctionData({
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        }),
      },
      {
        factory: addresses.morphoMarketV1AdapterV2Factory!,
        data: encodeFunctionData({
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        }),
      },
    ] as const;
    const dispatchers = [
      (client: Client) => fetchVaultV2Adapter(address, client),
      (client: Client) => fetchAccrualVaultV2Adapter(address, client),
    ];

    for (const { factory, data } of factoryReads) {
      for (const fetch of dispatchers) {
        const rpc = createRpc({
          fault: "http429",
          faultSelector: rpcSelector(data),
          faultAddress: factory,
        });
        const error = await expectFailClosed(fetch(rpc.client), "infra");

        expect(
          (error as BaseError).walk(
            (cause) => cause instanceof HttpRequestError,
          ),
        ).toMatchObject({ status: 429 });
        expect(error).not.toBeInstanceOf(UnsupportedVaultV2AdapterError);

        const revertRpc = createRpc({
          fault: "revert",
          faultSelector: rpcSelector(data),
          faultAddress: factory,
        });
        await expect(fetch(revertRpc.client)).rejects.toBeInstanceOf(
          UnsupportedVaultV2AdapterError,
        );
      }
    }
  });

  it("keeps all adapter-specific membership reverts optional", async () => {
    const address = "0x0000000000000000000000000000000000000003";
    const addresses = getChainAddresses(1);
    const adapterReads = [
      {
        factory: addresses.morphoVaultV1AdapterFactory!,
        data: encodeFunctionData({
          abi: morphoVaultV1AdapterFactoryAbi,
          functionName: "isMorphoVaultV1Adapter",
          args: [address],
        }),
        fetch: (client: Client) =>
          fetchVaultV2MorphoVaultV1Adapter(address, client, {
            deployless: false,
          }),
      },
      {
        factory: addresses.morphoMarketV1AdapterFactory!,
        data: encodeFunctionData({
          abi: morphoMarketV1AdapterFactoryAbi,
          functionName: "isMorphoMarketV1Adapter",
          args: [address],
        }),
        fetch: (client: Client) =>
          fetchVaultV2MorphoMarketV1Adapter(address, client, {
            deployless: false,
          }),
      },
      {
        factory: addresses.morphoMarketV1AdapterV2Factory!,
        data: encodeFunctionData({
          abi: morphoMarketV1AdapterV2FactoryAbi,
          functionName: "isMorphoMarketV1AdapterV2",
          args: [address],
        }),
        fetch: (client: Client) =>
          fetchVaultV2MorphoMarketV1AdapterV2(address, client, {
            deployless: false,
          }),
      },
    ] as const;

    for (const { factory, data, fetch } of adapterReads) {
      const transportRpc = createRpc({
        fault: "http429",
        faultSelector: rpcSelector(data),
        faultAddress: factory,
        zeroResults: true,
      });
      const error = await expectFailClosed(fetch(transportRpc.client), "infra");
      expect(
        (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
      ).toMatchObject({ status: 429 });

      const revertRpc = createRpc({
        fault: "revert",
        faultSelector: rpcSelector(data),
        faultAddress: factory,
        zeroResults: true,
      });
      await expect(fetch(revertRpc.client)).rejects.toBeInstanceOf(
        UnknownOfFactory,
      );
    }
  });
});

describe("chaos: S1 RPC unavailable", () => {
  it.each([
    [
      "token",
      (client: Client) =>
        fetchToken("0x0000000000000000000000000000000000000001", client),
    ],
    ["market", (client: Client) => fetchMarket(marketId, client)],
    [
      "vault",
      (client: Client) =>
        fetchVault("0x0000000000000000000000000000000000000001", client),
    ],
    [
      "holding",
      (client: Client) =>
        fetchHolding(
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
          client,
        ),
    ],
  ] as const)(
    "fails closed when the %s RPC is unavailable",
    async (_, fetch) => {
      const rpc = createRpc({ fault: "refused" });
      const error = await expectFailClosed(fetch(rpc.client), "infra");

      expect(error).toBeInstanceOf(BaseError);
      expect(
        (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
      ).not.toBeNull();
      expect(classifyError(error)).not.toBe("revert");
      expect(
        rpc.calls.filter(({ method }) => method === "eth_call"),
      ).toHaveLength(1);
    },
  );
});

describe("chaos: deployless transport failures", () => {
  it("propagates a 503 HTML body from a deployless Market read without fallback", async () => {
    const rpc = createRpc({ fault: "http503Html", retryCount: 0 });
    const error = await expectFailClosed(
      fetchMarket(marketId, rpc.client),
      "infra",
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 503 });
    expect(
      rpc.calls.filter(({ method }) => method === "eth_call"),
    ).toHaveLength(1);
  });

  it.each([
    ["market", (client: Client) => fetchMarket(marketId, client)],
    [
      "vault",
      (client: Client) =>
        fetchVault("0x0000000000000000000000000000000000000001", client),
    ],
    [
      "token",
      (client: Client) =>
        fetchToken("0x0000000000000000000000000000000000000001", client),
    ],
    [
      "holding",
      (client: Client) =>
        fetchHolding(
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
          client,
        ),
    ],
    [
      "vault user",
      (client: Client) =>
        fetchVaultUser(
          "0x0000000000000000000000000000000000000001",
          "0x0000000000000000000000000000000000000002",
          client,
        ),
    ],
    [
      "vault v2",
      (client: Client) =>
        fetchVaultV2("0x0000000000000000000000000000000000000001", client),
    ],
    [
      "accrual vault v2",
      (client: Client) =>
        fetchAccrualVaultV2(
          "0x0000000000000000000000000000000000000001",
          client,
        ),
    ],
    [
      "Vault V2 BluePublicAllocator data",
      (client: Client) =>
        fetchVaultV2BluePublicAllocatorData(allocatorVault, client),
    ],
    [
      "Morpho Vault V1 adapter",
      (client: Client) =>
        fetchVaultV2MorphoVaultV1Adapter(
          "0x0000000000000000000000000000000000000001",
          client,
        ),
    ],
    [
      "Morpho Market V1 adapter",
      (client: Client) =>
        fetchVaultV2MorphoMarketV1Adapter(
          "0x0000000000000000000000000000000000000001",
          client,
        ),
    ],
    [
      "Morpho Market V1 adapter V2",
      (client: Client) =>
        fetchVaultV2MorphoMarketV1AdapterV2(
          "0x0000000000000000000000000000000000000001",
          client,
        ),
    ],
  ] as const)(
    "propagates %s deployless transport errors without fallback reads",
    async (_, fetch) => {
      const rpc = createRpc({ fault: "http429" });
      const error = await expectFailClosed(fetch(rpc.client), "infra");

      expect(error).toBeInstanceOf(BaseError);
      expect(
        (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
      ).toMatchObject({ status: 429 });
      expect(
        rpc.calls.filter(({ method }) => method === "eth_call"),
      ).toHaveLength(1);
    },
  );

  it("propagates HTTP 429 before unsupported-adapter mapping in accrual query", async () => {
    const rpc = createRpc({ fault: "http429Revert" });
    const error = await fetchAccrualVaultV2(
      "0x0000000000000000000000000000000000000001",
      rpc.client,
    ).then(
      () => undefined,
      (rejection: unknown) => rejection,
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });
    expect(classifyError(error)).toBe("infra");
    expect(
      rpc.calls.filter(({ method }) => method === "eth_call"),
    ).toHaveLength(1);
  });
});

describe("chaos: deployless fallback", () => {
  it.each([
    ["HTTP 400", "http400"],
    ["HTTP 413", "http413"],
  ] as const)(
    "falls back to direct reads after a deployless %s",
    async (_, fault) => {
      const rpc = createRpc({ fault });
      const market = await fetchMarket(marketId, rpc.client);

      expect(market).toBeInstanceOf(Market);
      expect(
        rpc.calls.filter(({ method }) => method === "eth_call").length,
      ).toBeGreaterThan(1);
    },
  );
});

describe("chaos: S2 rate limiting", () => {
  it("propagates an RPC envelope rate limit", async () => {
    const rpc = createRpc({ fault: "rpcLimit" });
    const error = await expectFailClosed(
      fetchMarket(marketId, rpc.client),
      "infra",
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk(
        (cause) => cause instanceof LimitExceededRpcError,
      ),
    ).not.toBeNull();
    expect(classifyError(error)).not.toBe("revert");
    expect(
      rpc.calls.filter(({ method }) => method === "eth_call"),
    ).toHaveLength(1);
  });

  it("rejects HTTP 429 after viem's default retries", async () => {
    const rpc = createRpc({ fault: "http429", useDefaultRetry: true });
    const error = await expectFailClosed(
      fetchMarket(marketId, rpc.client),
      "infra",
    );

    expect(error).toBeInstanceOf(BaseError);
    expect(
      (error as BaseError).walk((cause) => cause instanceof HttpRequestError),
    ).toMatchObject({ status: 429 });
    expect(
      rpc.calls.filter(({ method }) => method === "eth_call"),
    ).toHaveLength(4);
  });
});

function rpcSelector(data: Hex): Hex {
  return data.slice(0, 10) as Hex;
}
