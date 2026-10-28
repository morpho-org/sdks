import assert from "node:assert/strict";
import * as morphoSdk from "@morpho-org/morpho-sdk";
import {
  AddressMismatchError,
  type AuthorizationRequirementSignature,
  type BundlesTokenRequirementSignature,
  ChainIdMismatchError,
  type Erc2612RequirementSignature,
  MixedBundlesFundingError,
  NegativeInputError,
  NonPositiveInputError,
  VaultAssetMismatchError,
  type VaultV2BlueReallocation,
} from "@morpho-org/morpho-sdk";
import { classifyError, expectFailClosed } from "@morpho-org/test/chaos";
import { createMockClient } from "@morpho-org/test/mock";
import * as viem from "viem";
import { mainnet } from "viem/chains";
import { beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import {
  BlueBundlesV1DeadlineExceedsWindowError,
  InvalidTransactionHashError,
  MissingWalletProviderError,
  UnconfirmedBroadcastError,
} from "./errors.js";
import type {
  AuthorizationOrSignatureRequirement,
  BundlesApprovalOrSignatureRequirement,
  MorphoBorrowOptions,
  MorphoCollateralSupplyOptions,
  MorphoExclusiveSupplyOptions,
  PreparedMorphoSupply,
  RequirementApproval,
  RequirementOptions,
  RequirementSignatureRequest,
} from "./morpho-protocol-evm.js";

const SEED =
  "cook voyage document eight skate token alien guide drink uncle term abuse";
const ADDRESS = "0x405005C7c4422390F4B334F64Cf20E0b767131d0";
const MOCK_TRANSACTION_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MOCK_USER_OPERATION_HASH =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const TOKEN = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const COLLATERAL = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const VAULT = "0x23f5E9c35820f4baB695Ac1F19c203cC3f8e1e11";
const MARKET_ID =
  "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2";
const MARKET_PARAMS = {
  loanToken: TOKEN,
  collateralToken: COLLATERAL,
  oracle: "0x76b2242ea5BE1FCBBF4206EA09601EA5aB22Af4d",
  irm: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
  lltv: 860000000000000000n,
} as const;
const NOW_MS = 1_800_000_000_000;
const BLUE_BUNDLES_V1_DEADLINE = 1_800_007_200n;
const SIGNATURE_DEADLINE = 1_800_003_600n;
vi.spyOn(Date, "now").mockReturnValue(NOW_MS);

const SUPPLY_TX = {
  to: "0x0000000000000000000000000000000000000001",
  value: 0n,
  data: "0x01",
};
const WITHDRAW_TX = {
  to: "0x0000000000000000000000000000000000000002",
  value: 0n,
  data: "0x02",
};
const BORROW_TX = {
  to: "0x0000000000000000000000000000000000000003",
  value: 0n,
  data: "0x03",
};
const REPAY_TX = {
  to: "0x0000000000000000000000000000000000000004",
  value: 0n,
  data: "0x04",
};
const SUPPLY_COLLATERAL_TX = {
  to: "0x0000000000000000000000000000000000000005",
  value: 0n,
  data: "0x05",
};
const WITHDRAW_COLLATERAL_TX = {
  to: "0x0000000000000000000000000000000000000006",
  value: 0n,
  data: "0x06",
};
const POPULATED_TRANSACTION = {
  chainId: 1,
  gasLimit: 1n,
  nonce: 0,
  maxFeePerGas: 12_345n,
  maxPriorityFeePerGas: 1n,
};

const vaultData = {
  address: VAULT,
  asset: TOKEN,
  toAssets: vi.fn((shares: bigint) => shares),
  toShares: vi.fn((assets: bigint) => assets),
};

const positionData = {
  supplyShares: 11n,
  borrowShares: 22n,
  borrowAssets: 33n,
  collateral: 44n,
};

const supplyAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "erc20Approval" } }]),
  buildTx: vi.fn().mockReturnValue(SUPPLY_TX),
};
const withdrawAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "erc20Approval" } }]),
  buildTx: vi.fn().mockReturnValue(WITHDRAW_TX),
};
const borrowAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "blueAuthorization" } }]),
  buildTx: vi.fn().mockReturnValue(BORROW_TX),
};
const repayAction = {
  getRequirements: vi.fn((_options?: RequirementOptions) =>
    Promise.resolve([
      {
        action: {
          type: "erc20Approval",
          args: { amount: viem.maxUint256 },
        },
      },
    ]),
  ),
  buildTx: vi.fn().mockReturnValue(REPAY_TX),
};
const supplyCollateralAction = {
  getRequirements: vi.fn((_options?: RequirementOptions) =>
    Promise.resolve([
      {
        action: {
          type: "erc20Approval",
          args: { amount: viem.maxUint256 },
        },
      },
    ]),
  ),
  buildTx: vi.fn().mockReturnValue(SUPPLY_COLLATERAL_TX),
};
const withdrawCollateralAction = {
  getRequirements: vi
    .fn()
    .mockResolvedValue([{ action: { type: "blueAuthorization" } }]),
  buildTx: vi.fn().mockReturnValue(WITHDRAW_COLLATERAL_TX),
};

const vaultV2Entity = {
  getData: vi.fn().mockResolvedValue(vaultData),
  deposit: vi.fn().mockReturnValue(supplyAction),
  withdraw: vi.fn().mockReturnValue(withdrawAction),
};

const marketEntity = {
  getPositionData: vi.fn().mockResolvedValue(positionData),
  supplyCollateral: vi.fn().mockReturnValue(supplyCollateralAction),
  borrow: vi.fn().mockReturnValue(borrowAction),
  repay: vi.fn().mockReturnValue(repayAction),
  withdrawCollateral: vi.fn().mockReturnValue(withdrawCollateralAction),
};

const vaultV2Mock = vi.fn().mockReturnValue(vaultV2Entity);
const blueMock = vi.fn().mockReturnValue(marketEntity);
const morphoNamespaceMock = {
  vaultV2: vaultV2Mock,
  blue: blueMock,
};
// The SDK is now consumed via `client.extend(morphoViemExtension(...)).morpho`,
// so the extended viem client exposes the morpho namespace directly.
const morphoExtendMock = vi
  .fn()
  .mockReturnValue({ morpho: morphoNamespaceMock });
const morphoViemExtensionMock = vi.fn<(...args: unknown[]) => unknown>(
  () => "morpho-extension",
);
const fetchMarketMock = vi.fn();
const mockGetChainId = vi.fn().mockResolvedValue(1);
const readContractMock = vi.fn().mockResolvedValue(123n);
const prepareTransactionRequestMock = vi.fn().mockResolvedValue({
  gas: 1n,
  nonce: 0,
  maxFeePerGas: 12_345n,
  maxPriorityFeePerGas: 1n,
});
const sendRawTransactionMock = vi.fn().mockResolvedValue(MOCK_TRANSACTION_HASH);
const extendMock = vi.fn().mockReturnValue({
  account: { address: ADDRESS },
  chain: { id: 1 },
  getChainId: mockGetChainId,
  readContract: readContractMock,
  prepareTransactionRequest: prepareTransactionRequestMock,
  sendRawTransaction: sendRawTransactionMock,
  extend: morphoExtendMock,
});
const createClientMock = vi.fn<(parameters: unknown) => unknown>(() => ({
  extend: extendMock,
}));

vi.doMock("@morpho-org/morpho-sdk", () => ({
  ...morphoSdk,
  morphoViemExtension: morphoViemExtensionMock,
}));

vi.doMock("@morpho-org/blue-sdk-viem", () => ({
  fetchMarket: fetchMarketMock,
}));

vi.doMock("viem", () => ({
  ...viem,
  createClient: createClientMock,
}));

const { MarketParams } = await import("@morpho-org/blue-sdk");
const { WalletAccountEvm, WalletAccountReadOnlyEvm } = await import(
  "@tetherto/wdk-wallet-evm"
);
const { WalletAccountEvmErc4337 } = await import(
  "@tetherto/wdk-wallet-evm-erc-4337"
);
const {
  default: MorphoProtocolEvm,
  MixedBlueCollateralFundingError,
  UnresolvedVaultWithdrawRequirementsError,
} = await import("./morpho-protocol-evm.js");

describe.sequential("MorphoProtocolEvm", () => {
  let account: InstanceType<typeof WalletAccountEvm>;
  let protocol: InstanceType<typeof MorphoProtocolEvm>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMarketMock.mockResolvedValue({
      params: new MarketParams(MARKET_PARAMS),
    });
    mockGetChainId.mockResolvedValue(1);
    readContractMock.mockResolvedValue(123n);
    prepareTransactionRequestMock.mockReset().mockResolvedValue({
      gas: 1n,
      nonce: 0,
      maxFeePerGas: 12_345n,
      maxPriorityFeePerGas: 1n,
    });
    sendRawTransactionMock.mockReset().mockResolvedValue(MOCK_TRANSACTION_HASH);

    account = new WalletAccountEvm(SEED, "0'/0/0", {
      provider: "https://dummy-rpc-url.com",
    });
    account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
    account.quoteSendTransaction = vi.fn().mockResolvedValue({ fee: 12_345n });
    vi.spyOn(account, "signTransaction");
    protocol = new MorphoProtocolEvm(account, {
      chainId: 1,
      earnVaultAddress: VAULT,
      borrowMarketParams: MARKET_PARAMS,
    });
  });

  describe("prepareSupply", () => {
    describe("prepareSupply funding validation", () => {
      test.each([
        { value: 0, errorClass: NonPositiveInputError },
        { value: 0n, errorClass: NonPositiveInputError },
        { value: -1, errorClass: NegativeInputError },
        { value: -1n, errorClass: NegativeInputError },
      ])(
        "error: $errorClass.name for funding $value",
        async ({ value, errorClass }) => {
          for (const field of ["amount", "nativeAmount"] as const) {
            const funding =
              field === "amount" ? { amount: value } : { nativeAmount: value };
            const result = protocol.prepareSupply({ token: TOKEN, ...funding });

            await expect(result).rejects.toBeInstanceOf(errorClass);
            await expect(result).rejects.toMatchObject({
              field,
              value: BigInt(value),
            });
          }

          expect(vaultV2Entity.getData).not.toHaveBeenCalled();
          expect(vaultV2Entity.deposit).not.toHaveBeenCalled();
        },
      );
    });

    test.each(["prepareSupply", "supply", "quoteSupply"] as const)(
      "error: MixedBundlesFundingError from %s for vault mixed funding",
      async (method) => {
        const mixedFunding = {
          token: TOKEN,
          amount: 50_000n,
          nativeAmount: 50_000n,
        } as unknown as MorphoExclusiveSupplyOptions;

        await expect(protocol[method](mixedFunding)).rejects.toBeInstanceOf(
          MixedBundlesFundingError,
        );
        expect(vaultV2Entity.getData).not.toHaveBeenCalled();
        expect(vaultV2Entity.deposit).not.toHaveBeenCalled();
      },
    );

    test.each(["amount", "nativeAmount"] as const)(
      "error: VaultAssetMismatchError from prepareSupply with %s",
      async (field) => {
        const funding =
          field === "amount"
            ? { amount: 100_000n }
            : { nativeAmount: 100_000n };

        await expect(
          protocol.prepareSupply({ token: COLLATERAL, ...funding }),
        ).rejects.toBeInstanceOf(VaultAssetMismatchError);

        expect(vaultV2Entity.deposit).not.toHaveBeenCalled();
      },
    );

    test("types: vault funding is ERC-20 or native, never both", () => {
      expectTypeOf<
        Parameters<typeof protocol.supply>[0]
      >().toEqualTypeOf<MorphoExclusiveSupplyOptions>();
      expectTypeOf<
        Parameters<typeof protocol.quoteSupply>[0]
      >().toEqualTypeOf<MorphoExclusiveSupplyOptions>();
      expectTypeOf<"requirementSignature">().not.toMatchTypeOf<
        keyof MorphoExclusiveSupplyOptions
      >();
      expectTypeOf<{
        token: string;
        amount: bigint;
      }>().toMatchTypeOf<MorphoExclusiveSupplyOptions>();
      expectTypeOf<{
        token: string;
        nativeAmount: bigint;
      }>().toMatchTypeOf<MorphoExclusiveSupplyOptions>();
      expectTypeOf<{
        token: string;
        amount: bigint;
        nativeAmount: bigint;
      }>().not.toMatchTypeOf<MorphoExclusiveSupplyOptions>();
    });

    test("should build a vault deposit with morpho-sdk and send it", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      const result = await protocol.supply({ token: TOKEN, amount: 100_000n });

      expect(morphoViemExtensionMock).toHaveBeenCalledWith({
        supportSignature: false,
        supportDeployless: undefined,
        metadata: undefined,
      });
      // The viem client is extended with the morpho namespace via morphoViemExtension's output.
      expect(morphoExtendMock).toHaveBeenCalledWith("morpho-extension");
      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        vaultData,
        slippageTolerance: undefined,
      });
      expect(supplyAction.buildTx).toHaveBeenCalledWith(undefined);
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...SUPPLY_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test.each([
      {
        hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        expected: "valid",
      },
      { hash: "0x1234", expected: "invalid" },
      { hash: "not-hex", expected: "invalid" },
      { hash: `0x${"a".repeat(63)}`, expected: "invalid" },
      { hash: { toString: null }, expected: "invalid" },
    ] as const)(
      "uses real viem transport actions for legacy EOA submission ($expected)",
      async ({ hash, expected }) => {
        const handle = createMockClient(mainnet);
        handle.request.mockImplementation(async ({ method }) => {
          if (method === "eth_chainId") return "0x1";
          if (method === "eth_fillTransaction") {
            return {
              tx: {
                chainId: "0x1",
                from: ADDRESS,
                to: SUPPLY_TX.to,
                input: SUPPLY_TX.data,
                value: "0x0",
                gas: "0x5208",
                gasPrice: "0x3",
                nonce: "0x0",
                type: "0x0",
              },
            };
          }
          if (method === "eth_sendRawTransaction") return hash;
          throw new Error(`Unhandled RPC ${method}`);
        });
        const transportAccount = new WalletAccountEvm(SEED, "0'/0/0", {
          provider: {
            request: ({ method, params }) =>
              handle.request({
                method,
                params: Array.isArray(params) ? params : undefined,
              }),
          },
        });
        transportAccount.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        transportAccount.quoteSendTransaction = vi
          .fn()
          .mockResolvedValue({ fee: 12_345n });
        const signTransaction = vi.spyOn(transportAccount, "signTransaction");
        const transportProtocol = new MorphoProtocolEvm(transportAccount, {
          chainId: 1,
          earnVaultAddress: VAULT,
          borrowMarketParams: MARKET_PARAMS,
        });

        await createClientMock.withImplementation(
          (parameters) =>
            viem.createClient(
              parameters as Parameters<typeof viem.createClient>[0],
            ),
          () =>
            morphoViemExtensionMock.withImplementation(
              () => () => ({ morpho: morphoNamespaceMock }),
              async () => {
                const submission = transportProtocol.supply({
                  token: TOKEN,
                  amount: 100_000n,
                });
                if (expected === "valid") {
                  await expect(submission).resolves.toEqual({
                    hash,
                    fee: 12_345n,
                  });
                } else {
                  const error = await submission.catch(
                    (caught: unknown) => caught,
                  );
                  assert(error instanceof InvalidTransactionHashError);
                  expect(classifyError(error)).toBe("integrity");
                  assert(error.eoa !== undefined);
                  expect(error.eoa.localHash).toBe(
                    viem.keccak256(error.eoa.serializedTransaction),
                  );
                  expect(error.eoa.serializedTransaction).toBe(
                    await signTransaction.mock.results[0]?.value,
                  );
                  expect(error.message).toContain(
                    `look up "${error.eoa.localHash}" before retrying the operation.`,
                  );
                }
              },
            ),
        );

        expect(signTransaction).toHaveBeenCalledWith({
          ...SUPPLY_TX,
          chainId: 1,
          gasLimit: 21_000n,
          gasPrice: 3n,
          nonce: 0,
        });
        expect(handle.request.mock.calls.map(([call]) => call.method)).toEqual(
          expect.arrayContaining([
            "eth_chainId",
            "eth_fillTransaction",
            "eth_sendRawTransaction",
          ]),
        );
      },
    );

    describe("ethers provider error normalization", () => {
      const submitWithProviderError = async (
        providerError: unknown,
        options: {
          providerType?: "send" | "request";
          transactionLookup?: (
            serializedTransaction: `0x${string}` | undefined,
          ) => Promise<unknown>;
          failoverProviderErrors?: readonly Error[];
          simulateFailoverRetry?: boolean;
          retries?: number;
        } = {},
      ) => {
        const {
          providerType = "send",
          transactionLookup = async () => null,
          failoverProviderErrors,
          simulateFailoverRetry = false,
          retries,
        } = options;
        let serializedTransaction: `0x${string}` | undefined;
        let requestedTransactionHash: unknown;
        const failoverCalls: string[] = [];
        const handle = createMockClient(mainnet);
        handle.request.mockImplementation(async ({ method, params }) => {
          if (method === "eth_chainId") return "0x1";
          if (method === "eth_fillTransaction") {
            return {
              tx: {
                chainId: "0x1",
                from: ADDRESS,
                to: SUPPLY_TX.to,
                input: SUPPLY_TX.data,
                value: "0x0",
                gas: "0x5208",
                gasPrice: "0x3",
                nonce: "0x0",
                type: "0x0",
              },
            };
          }
          if (method === "eth_getTransactionByHash") {
            requestedTransactionHash = Array.isArray(params)
              ? params[0]
              : undefined;
            return transactionLookup(serializedTransaction);
          }
          throw new Error(`Unhandled RPC ${method}`);
        });
        const forwardRequest = async (
          {
            method,
            params,
          }: {
            method: string;
            params: readonly unknown[] | object;
          },
          error: unknown,
        ) => {
          if (method === "eth_sendRawTransaction") {
            const candidate = Array.isArray(params) ? params[0] : undefined;
            if (typeof candidate === "string") {
              serializedTransaction = candidate as `0x${string}`;
            }
            throw error;
          }
          return handle.request({
            method,
            params: Array.isArray(params) ? params : undefined,
          });
        };
        const singleProvider = {
          request: ({
            method,
            params,
          }: {
            method: string;
            params?: readonly unknown[] | object;
          }) => forwardRequest({ method, params: params ?? [] }, providerError),
        };
        const provider =
          failoverProviderErrors !== undefined
            ? failoverProviderErrors.map((error, index) => ({
                request: ({
                  method,
                  params,
                }: {
                  method: string;
                  params?: readonly unknown[] | object;
                }) => {
                  if (
                    method === "eth_sendRawTransaction" ||
                    method === "eth_getTransactionByHash"
                  ) {
                    failoverCalls.push(`${index === 0 ? "A" : "B"}:${method}`);
                  }
                  return forwardRequest(
                    { method, params: params ?? [] },
                    error,
                  );
                },
              }))
            : simulateFailoverRetry
              ? [singleProvider]
              : singleProvider;
        const transportAccount = new WalletAccountEvm(SEED, "0'/0/0", {
          provider,
          ...(retries === undefined ? {} : { retries }),
        });
        transportAccount.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        transportAccount.quoteSendTransaction = vi
          .fn()
          .mockResolvedValue({ fee: 12_345n });
        if (failoverProviderErrors === undefined) {
          Reflect.set(transportAccount, "_provider", {
            ...(providerType === "send"
              ? {
                  send: (method: string, params: readonly unknown[] | object) =>
                    forwardRequest({ method, params }, providerError),
                }
              : {
                  request: async ({
                    method,
                    params,
                  }: {
                    method: string;
                    params?: readonly unknown[] | object;
                  }) =>
                    forwardRequest(
                      { method, params: params ?? [] },
                      providerError,
                    ),
                }),
          });
        }
        const transportProtocol = new MorphoProtocolEvm(transportAccount, {
          chainId: 1,
          earnVaultAddress: VAULT,
          borrowMarketParams: MARKET_PARAMS,
        });
        let submissionError: unknown;
        let submissionResult:
          | Awaited<ReturnType<typeof transportProtocol.supply>>
          | undefined;
        await createClientMock.withImplementation(
          (parameters) =>
            viem.createClient(
              parameters as Parameters<typeof viem.createClient>[0],
            ),
          () =>
            morphoViemExtensionMock.withImplementation(
              () => () => ({ morpho: morphoNamespaceMock }),
              async () => {
                try {
                  submissionResult = await transportProtocol.supply({
                    token: TOKEN,
                    amount: 100_000n,
                  });
                } catch (caught) {
                  submissionError = caught;
                }
              },
            ),
        );
        return {
          error: submissionError,
          failoverCalls,
          requestedTransactionHash,
          result: submissionResult,
          serializedTransaction,
        };
      };

      test("preserves unrelated errors without classifying them as infrastructure", async () => {
        const providerError = new Error("boom");
        const lookup = vi.fn().mockResolvedValue(null);
        const { error } = await submitWithProviderError(providerError, {
          transactionLookup: lookup,
        });

        assert(error instanceof viem.UnknownRpcError);
        expect(error).not.toBeInstanceOf(viem.HttpRequestError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(lookup).not.toHaveBeenCalled();
        expect(classifyError(error)).not.toBe("infra");
      });

      test("does not reconcile primitive provider errors", async () => {
        const lookup = vi.fn().mockResolvedValue(null);
        const { error } = await submitWithProviderError("boom", {
          transactionLookup: lookup,
        });

        assert(error instanceof viem.UnknownRpcError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(lookup).not.toHaveBeenCalled();
      });

      test("maps an ethers JSON-RPC payload to its concrete viem error", async () => {
        const providerError = Object.assign(
          new Error("could not coalesce error"),
          {
            code: "UNKNOWN_ERROR",
            error: { code: -32000, message: "nonce too low" },
          },
        );
        const lookup = vi.fn().mockResolvedValue(null);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            transactionLookup: lookup,
          });

        assert(error instanceof viem.InvalidInputRpcError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
      });

      test("preserves data from a nested JSON-RPC error", async () => {
        const providerError = Object.assign(
          new Error("could not coalesce error"),
          {
            error: {
              code: 3,
              message: "execution reverted",
              data: "0x08c379a0",
            },
          },
        );
        const { error } = await submitWithProviderError(providerError);

        assert(error instanceof viem.BaseError);
        const rpcError = error.walk(
          (cause) => cause instanceof viem.RpcRequestError,
        );
        assert(rpcError instanceof viem.RpcRequestError);
        expect(rpcError.code).toBe(3);
        expect(rpcError.data).toBe("0x08c379a0");
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
      });

      test("returns the local hash when a JSON-RPC rejection reconciles to a transaction", async () => {
        const providerError = Object.assign(new Error("already known"), {
          code: -32000,
        });
        const lookup = vi.fn(
          async (signedTransaction: `0x${string}` | undefined) => {
            assert(signedTransaction !== undefined);
            return {
              blockHash: `0x${"b".repeat(64)}`,
              blockNumber: "0x1",
              from: ADDRESS,
              gas: "0x5208",
              gasPrice: "0x3",
              hash: viem.keccak256(signedTransaction),
              input: SUPPLY_TX.data,
              nonce: "0x0",
              to: SUPPLY_TX.to,
              transactionIndex: "0x0",
              type: "0x0",
              value: "0x0",
            };
          },
        );
        const {
          error,
          requestedTransactionHash,
          result,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          transactionLookup: lookup,
        });

        expect(error).toBeUndefined();
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        assert(result !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(result.hash).toBe(viem.keccak256(serializedTransaction));
      });

      test("request provider reconciles a plain JSON-RPC object like RpcRequestError", async () => {
        const lookup = vi.fn(
          async (signedTransaction: `0x${string}` | undefined) => {
            assert(signedTransaction !== undefined);
            return {
              blockHash: `0x${"b".repeat(64)}`,
              blockNumber: "0x1",
              from: ADDRESS,
              gas: "0x5208",
              gasPrice: "0x3",
              hash: viem.keccak256(signedTransaction),
              input: SUPPLY_TX.data,
              nonce: "0x0",
              to: SUPPLY_TX.to,
              transactionIndex: "0x0",
              type: "0x0",
              value: "0x0",
            };
          },
        );
        const plainObject = await submitWithProviderError(
          { code: -32000, message: "already known" },
          {
            providerType: "request",
            transactionLookup: lookup,
          },
        );
        const rpcRequestError = new viem.RpcRequestError({
          body: {
            method: "eth_sendRawTransaction",
            params: [],
          },
          error: { code: -32000, message: "already known" },
          url: "wdk-account-provider",
        });
        const viemError = await submitWithProviderError(rpcRequestError, {
          providerType: "request",
          transactionLookup: lookup,
        });

        expect(lookup).toHaveBeenCalledTimes(2);
        expect(plainObject.error).toBeUndefined();
        expect(viemError.error).toBeUndefined();
        expect(plainObject.result?.hash).toBe(viemError.result?.hash);
        expect(plainObject.requestedTransactionHash).toBe(
          viemError.requestedTransactionHash,
        );
      });

      test("request provider reconciles a plain JSON-RPC object and rethrows it when not found", async () => {
        const providerError = { code: -32000, message: "already known" };
        const lookup = vi.fn().mockResolvedValue(null);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            providerType: "request",
            transactionLookup: lookup,
          });

        assert(error instanceof viem.BaseError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(
          error.walk((cause) => cause instanceof viem.RpcRequestError),
        ).toBeInstanceOf(viem.RpcRequestError);
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
      });

      test.each([
        {
          name: "network code",
          providerError: { code: "ECONNRESET" },
          causeClass: viem.HttpRequestError,
        },
        {
          name: "ethers timeout code",
          providerError: { code: "TIMEOUT" },
          causeClass: viem.TimeoutError,
        },
        {
          name: "gateway status",
          providerError: { response: { statusCode: 504 } },
          causeClass: viem.HttpRequestError,
        },
      ])(
        "wraps a plain-object $name rejection and preserves its cause",
        async ({ providerError, causeClass }) => {
          const lookup = vi.fn().mockResolvedValue(null);
          const { error } = await submitWithProviderError(providerError, {
            providerType: "request",
            transactionLookup: lookup,
          });

          assert(error instanceof UnconfirmedBroadcastError);
          assert(error.cause instanceof viem.BaseError);
          expect(
            error.cause.walk((cause) => cause instanceof causeClass),
          ).toBeInstanceOf(causeClass);
          expect(error.cause.walk((cause) => cause === providerError)).toBe(
            providerError,
          );
          expect(lookup).not.toHaveBeenCalled();
        },
      );

      test("marks an already-known response uncertain when reconciliation fails", async () => {
        const providerError = Object.assign(new Error("already known"), {
          code: -32000,
        });
        const lookupError = new viem.HttpRequestError({
          body: { method: "eth_getTransactionByHash", params: [] },
          details: "lookup failed",
          url: "wdk-account-provider",
        });
        const lookup = vi.fn().mockRejectedValue(lookupError);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            transactionLookup: lookup,
          });

        assert(error instanceof UnconfirmedBroadcastError);
        expect(classifyError(error)).toBe("infra");
        expect(lookup).toHaveBeenCalled();
        assert(serializedTransaction !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        assert(error.cause instanceof AggregateError);
        const sendError = error.cause.errors[0];
        assert(sendError instanceof viem.InvalidInputRpcError);
        expect(sendError.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(error.cause.errors[1]).toBe(lookupError);
        expect(error.hash).toBe(viem.keccak256(serializedTransaction));
        expect(error.serializedTransaction).toBe(serializedTransaction);
      });

      test("marks a real WDK failover JSON-RPC rejection uncertain when lookup is not found", async () => {
        const firstError = Object.assign(new Error("socket hang up"), {
          code: "ECONNRESET",
        });
        const providerError = Object.assign(new Error("rate limited"), {
          code: -32005,
        });
        const lookup = vi.fn().mockResolvedValue(null);
        const {
          error,
          failoverCalls,
          requestedTransactionHash,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          failoverProviderErrors: [firstError, providerError],
          retries: 1,
          transactionLookup: lookup,
        });

        assert(error instanceof UnconfirmedBroadcastError);
        assert(serializedTransaction !== undefined);
        expect(lookup).toHaveBeenCalledOnce();
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(error.hash).toBe(viem.keccak256(serializedTransaction));
        expect(error.serializedTransaction).toBe(serializedTransaction);
        expect(failoverCalls).toEqual([
          "A:eth_sendRawTransaction",
          "B:eth_sendRawTransaction",
          "B:eth_getTransactionByHash",
        ]);
      });

      test("uses WDK's default retries to mark a failover send uncertain", async () => {
        const firstError = Object.assign(new Error("socket hang up"), {
          code: "ECONNRESET",
        });
        const providerError = Object.assign(new Error("rate limited"), {
          code: -32005,
        });
        const lookup = vi.fn().mockResolvedValue(null);
        const {
          error,
          failoverCalls,
          requestedTransactionHash,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          failoverProviderErrors: [firstError, providerError],
          transactionLookup: lookup,
        });

        assert(error instanceof UnconfirmedBroadcastError);
        assert(serializedTransaction !== undefined);
        expect(lookup).toHaveBeenCalledOnce();
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(error.hash).toBe(viem.keccak256(serializedTransaction));
        expect(failoverCalls.slice(0, 2)).toEqual([
          "A:eth_sendRawTransaction",
          "B:eth_sendRawTransaction",
        ]);
        expect(failoverCalls).toContain("B:eth_getTransactionByHash");
      });

      test("marks an unknown BrowserProvider failover error uncertain when lookup is not found", async () => {
        const firstError = Object.assign(new Error("socket hang up"), {
          code: "ECONNRESET",
        });
        const providerError = Object.assign(
          new Error("server response 503 Service Unavailable"),
          { statusCode: 503 },
        );
        const lookup = vi.fn().mockResolvedValue(null);
        const {
          error,
          failoverCalls,
          requestedTransactionHash,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          failoverProviderErrors: [firstError, providerError],
          retries: 1,
          transactionLookup: lookup,
        });

        assert(error instanceof UnconfirmedBroadcastError);
        expect(classifyError(error)).toBe("infra");
        assert(error.cause instanceof viem.UnknownRpcError);
        assert(serializedTransaction !== undefined);
        expect(lookup).toHaveBeenCalledOnce();
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(error.hash).toBe(viem.keccak256(serializedTransaction));
        expect(error.serializedTransaction).toBe(serializedTransaction);
        expect(failoverCalls).toEqual([
          "A:eth_sendRawTransaction",
          "B:eth_sendRawTransaction",
          "B:eth_getTransactionByHash",
        ]);
      });

      test("returns the local hash when a failover plain error reconciles to a transaction", async () => {
        const firstError = Object.assign(new Error("socket hang up"), {
          code: "ECONNRESET",
        });
        const providerError = new Error("boom");
        const lookup = vi.fn(
          async (signedTransaction: `0x${string}` | undefined) => {
            assert(signedTransaction !== undefined);
            return {
              blockHash: `0x${"b".repeat(64)}`,
              blockNumber: "0x1",
              from: ADDRESS,
              gas: "0x5208",
              gasPrice: "0x3",
              hash: viem.keccak256(signedTransaction),
              input: SUPPLY_TX.data,
              nonce: "0x0",
              to: SUPPLY_TX.to,
              transactionIndex: "0x0",
              type: "0x0",
              value: "0x0",
            };
          },
        );
        const {
          error,
          failoverCalls,
          requestedTransactionHash,
          result,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          failoverProviderErrors: [firstError, providerError],
          retries: 1,
          transactionLookup: lookup,
        });

        expect(error).toBeUndefined();
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        assert(result !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(result.hash).toBe(viem.keccak256(serializedTransaction));
        expect(failoverCalls).toEqual([
          "A:eth_sendRawTransaction",
          "B:eth_sendRawTransaction",
          "B:eth_getTransactionByHash",
        ]);
      });

      test("marks a simulated WDK failover HTTP 503 uncertain when lookup is not found", async () => {
        const providerError = Object.assign(new Error("service unavailable"), {
          statusCode: 503,
        });
        const lookup = vi.fn().mockResolvedValue(null);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            simulateFailoverRetry: true,
            retries: 1,
            transactionLookup: lookup,
          });

        assert(error instanceof UnconfirmedBroadcastError);
        assert(error.cause instanceof viem.HttpRequestError);
        expect(error.cause.status).toBe(503);
        assert(serializedTransaction !== undefined);
        expect(lookup).toHaveBeenCalledOnce();
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(error.hash).toBe(viem.keccak256(serializedTransaction));
        expect(error.serializedTransaction).toBe(serializedTransaction);
      });

      test("returns the local hash when a single-provider HTTP 503 reconciles to a transaction", async () => {
        const providerError = Object.assign(new Error("service unavailable"), {
          statusCode: 503,
        });
        const lookup = vi.fn(
          async (signedTransaction: `0x${string}` | undefined) => {
            assert(signedTransaction !== undefined);
            return {
              blockHash: `0x${"b".repeat(64)}`,
              blockNumber: "0x1",
              from: ADDRESS,
              gas: "0x5208",
              gasPrice: "0x3",
              hash: viem.keccak256(signedTransaction),
              input: SUPPLY_TX.data,
              nonce: "0x0",
              to: SUPPLY_TX.to,
              transactionIndex: "0x0",
              type: "0x0",
              value: "0x0",
            };
          },
        );
        const {
          error,
          requestedTransactionHash,
          result,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          transactionLookup: lookup,
        });

        expect(error).toBeUndefined();
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        assert(result !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(result.hash).toBe(viem.keccak256(serializedTransaction));
      });

      test("keeps a retries-zero WDK failover RPC rejection definite when lookup is not found", async () => {
        const providerError = Object.assign(new Error("already known"), {
          code: -32000,
        });
        const lookup = vi.fn().mockResolvedValue(null);
        const {
          error,
          failoverCalls,
          requestedTransactionHash,
          serializedTransaction,
        } = await submitWithProviderError(providerError, {
          failoverProviderErrors: [providerError],
          retries: 0,
          transactionLookup: lookup,
        });

        assert(error instanceof viem.InvalidInputRpcError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        assert(serializedTransaction !== undefined);
        expect(lookup).toHaveBeenCalledOnce();
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
        expect(failoverCalls).toEqual([
          "A:eth_sendRawTransaction",
          "A:eth_getTransactionByHash",
        ]);
      });

      test("maps an ethers info.error JSON-RPC payload to its concrete viem error", async () => {
        const providerError = Object.assign(
          new Error("could not coalesce error"),
          {
            info: { error: { code: -32000, message: "nonce too low" } },
          },
        );
        const lookup = vi.fn().mockResolvedValue(null);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            transactionLookup: lookup,
          });

        assert(error instanceof viem.InvalidInputRpcError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
      });

      test("maps a top-level JSON-RPC error code to its concrete viem error", async () => {
        const providerError = Object.assign(new Error("nonce too low"), {
          code: -32000,
        });
        const lookup = vi.fn().mockResolvedValue(null);
        const { error, requestedTransactionHash, serializedTransaction } =
          await submitWithProviderError(providerError, {
            transactionLookup: lookup,
          });

        assert(error instanceof viem.InvalidInputRpcError);
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(lookup).toHaveBeenCalledOnce();
        assert(serializedTransaction !== undefined);
        expect(requestedTransactionHash).toBe(
          viem.keccak256(serializedTransaction),
        );
      });

      test("preserves data from a top-level JSON-RPC error", async () => {
        const providerError = Object.assign(new Error("execution reverted"), {
          code: 3,
          data: "0x08c379a0",
        });
        const { error } = await submitWithProviderError(providerError);

        assert(error instanceof viem.BaseError);
        const rpcError = error.walk(
          (cause) => cause instanceof viem.RpcRequestError,
        );
        assert(rpcError instanceof viem.RpcRequestError);
        expect(rpcError.code).toBe(3);
        expect(rpcError.data).toBe("0x08c379a0");
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
      });

      test.each([
        {
          name: "ECONNRESET",
          providerError: Object.assign(new Error("socket hang up"), {
            code: "ECONNRESET",
          }),
          causeClass: viem.HttpRequestError,
        },
        {
          name: "TIMEOUT",
          providerError: Object.assign(new Error("request timed out"), {
            code: "TIMEOUT",
          }),
          causeClass: viem.TimeoutError,
        },
        {
          name: "DOMException TimeoutError",
          providerError: new DOMException("timed out", "TimeoutError"),
          causeClass: viem.TimeoutError,
        },
        {
          name: "DOMException AbortError",
          providerError: new DOMException("aborted", "AbortError"),
          causeClass: viem.TimeoutError,
        },
        {
          name: "nested UND_ERR_SOCKET",
          providerError: Object.assign(new TypeError("fetch failed"), {
            cause: { code: "UND_ERR_SOCKET" },
          }),
          causeClass: viem.HttpRequestError,
        },
        {
          name: "NETWORK_ERROR",
          providerError: Object.assign(new Error("network error"), {
            code: "NETWORK_ERROR",
          }),
          causeClass: viem.HttpRequestError,
        },
      ] as const)(
        "preserves uncertain broadcasts for $name",
        async ({ providerError, causeClass }) => {
          const { error } = await submitWithProviderError(providerError);

          assert(error instanceof UnconfirmedBroadcastError);
          assert(error.cause instanceof viem.BaseError);
          expect(error.cause).toBeInstanceOf(causeClass);
          expect(error.cause.walk((cause) => cause === providerError)).toBe(
            providerError,
          );
          expect(error.hash).toBe(viem.keccak256(error.serializedTransaction));
          expect(
            viem.isHex(error.serializedTransaction, {
              strict: true,
            }),
          ).toBe(true);
        },
      );

      test("normalizes ECONNRESET when DOMException is unavailable", async () => {
        const originalDOMException = globalThis.DOMException;
        try {
          Reflect.deleteProperty(globalThis, "DOMException");
          const { error } = await submitWithProviderError(
            Object.assign(new Error("socket hang up"), {
              code: "ECONNRESET",
            }),
          );
          assert(error instanceof UnconfirmedBroadcastError);
          expect(classifyError(error)).toBe("infra");
        } finally {
          globalThis.DOMException = originalDOMException;
        }
      });

      test("does not classify a NetworkError DOMException as an uncertain broadcast", async () => {
        const providerError = new DOMException("x", "NetworkError");
        const { error } = await submitWithProviderError(providerError);

        assert(error instanceof viem.BaseError);
        expect(error.walk((cause) => cause === providerError)).toBe(
          providerError,
        );
        expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
        expect(classifyError(error)).not.toBe("infra");
      });

      test.each([
        {
          name: "HTTP 504 status",
          providerError: Object.assign(new Error("gateway timeout"), {
            status: 504,
          }),
          status: 504,
        },
        {
          name: "HTTP 504 response statusCode",
          providerError: Object.assign(new Error("gateway timeout"), {
            response: { statusCode: 504 },
          }),
          status: 504,
        },
        {
          name: "HTTP 502 response status",
          providerError: Object.assign(new Error("bad gateway"), {
            response: { status: 502 },
          }),
          status: 502,
        },
        {
          name: "HTTP 524 status",
          providerError: Object.assign(new Error("a timeout occurred"), {
            statusCode: 524,
          }),
          status: 524,
        },
      ] as const)(
        "marks $name as an uncertain broadcast",
        async ({ providerError, status }) => {
          const { error } = await submitWithProviderError(providerError);

          assert(error instanceof UnconfirmedBroadcastError);
          assert(error.cause instanceof viem.HttpRequestError);
          expect(error.cause.status).toBe(status);
          expect(error.hash).toBe(viem.keccak256(error.serializedTransaction));
        },
      );

      test("normalizes network errors from an EIP-1193 request-only provider", async () => {
        const { error } = await submitWithProviderError(
          Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
          { providerType: "request" },
        );

        assert(error instanceof UnconfirmedBroadcastError);
        expect(error.cause).toBeInstanceOf(viem.HttpRequestError);
        expect(error.hash).toBe(viem.keccak256(error.serializedTransaction));
      });

      test.each([
        {
          name: "status",
          providerError: Object.assign(new Error("service unavailable"), {
            status: 503,
          }),
          status: 503,
        },
        {
          name: "statusCode",
          providerError: Object.assign(new Error("service unavailable"), {
            statusCode: 503,
          }),
          status: 503,
        },
        {
          name: "response statusCode",
          providerError: Object.assign(new Error("service unavailable"), {
            response: { statusCode: 503 },
          }),
          status: 503,
        },
        {
          name: "status 429",
          providerError: Object.assign(new Error("too many requests"), {
            status: 429,
          }),
          status: 429,
        },
      ] as const)(
        "preserves HTTP $name without marking it uncertain",
        async ({ providerError, status }) => {
          const lookup = vi.fn().mockResolvedValue(null);
          const { error, requestedTransactionHash, serializedTransaction } =
            await submitWithProviderError(providerError, {
              transactionLookup: lookup,
            });

          assert(error instanceof viem.HttpRequestError);
          expect(error.status).toBe(status);
          expect(error).not.toBeInstanceOf(UnconfirmedBroadcastError);
          expect(lookup).toHaveBeenCalledOnce();
          assert(serializedTransaction !== undefined);
          expect(requestedTransactionHash).toBe(
            viem.keccak256(serializedTransaction),
          );
        },
      );
    });

    describe("chaos: S5 wrong chain", () => {
      test("error: ChainIdMismatchError when the provider switches to Base between quote and broadcast", async () => {
        const handle = createMockClient(mainnet);
        let servedChain = "0x1";
        handle.request.mockImplementation(async ({ method }) => {
          if (method === "eth_chainId") return servedChain;
          throw new Error(`Unhandled RPC ${method}`);
        });
        const transportAccount = new WalletAccountEvm(SEED, "0'/0/0", {
          provider: {
            request: ({ method, params }) =>
              handle.request({
                method,
                params: Array.isArray(params) ? params : undefined,
              }),
          },
        });
        transportAccount.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        transportAccount.quoteSendTransaction = vi
          .fn()
          .mockResolvedValue({ fee: 12_345n });
        const signTransaction = vi.spyOn(transportAccount, "signTransaction");
        const transportProtocol = new MorphoProtocolEvm(transportAccount, {
          chainId: 1,
          earnVaultAddress: VAULT,
          borrowMarketParams: MARKET_PARAMS,
        });

        await createClientMock.withImplementation(
          (parameters) =>
            viem.createClient(
              parameters as Parameters<typeof viem.createClient>[0],
            ),
          () =>
            morphoViemExtensionMock.withImplementation(
              () => () => ({ morpho: morphoNamespaceMock }),
              async () => {
                const prepared = await transportProtocol.prepareSupply({
                  token: TOKEN,
                  amount: 100_000n,
                });
                await expect(prepared.quote()).resolves.toEqual({
                  fee: 12_345n,
                });
                const quoteCalls = handle.request.mock.calls.length;
                servedChain = "0x2105";

                const error = await expectFailClosed(
                  prepared.submit(),
                  "chain",
                );
                expect(error).toBeInstanceOf(ChainIdMismatchError);
                expect(
                  handle.request.mock.calls
                    .slice(quoteCalls)
                    .map(([call]) => call.method),
                ).toEqual(["eth_chainId"]);
              },
            ),
        );

        expect(signTransaction).not.toHaveBeenCalled();
        expect(
          handle.request.mock.calls.map(([call]) => call.method),
        ).not.toContain("eth_sendRawTransaction");
      });
    });

    test("should return supply requirements from morpho-sdk", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      const options = { token: TOKEN, amount: 100_000n };
      const requirementOptions = { useSimplePermit: true };
      const pending = protocol.prepareSupply(options);
      options.amount = 200_000n;
      observedChain.resolve(1);
      const prepared = await pending;
      expectTypeOf(prepared).toEqualTypeOf<PreparedMorphoSupply>();
      expect(Object.isFrozen(prepared)).toBe(true);
      const promise = prepared.getRequirements(requirementOptions);
      requirementOptions.useSimplePermit = false;
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly BundlesApprovalOrSignatureRequirement[]>
      >();
      const requirements = await promise;

      expect(requirements).toEqual([{ action: { type: "erc20Approval" } }]);
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100_000n }),
      );
      expect(vaultV2Entity.deposit).toHaveBeenCalledTimes(1);
      expect(supplyAction.getRequirements).toHaveBeenCalledWith({
        useSimplePermit: true,
      });
    });

    test.each(["getRequirements", "submit", "quote"] as const)(
      "error: ChainIdMismatchError after preparing ERC-20 or native funding (%s)",
      async (method) => {
        account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        account.sendTransaction = vi.fn();
        account.quoteSendTransaction = vi.fn();
        for (const options of [
          { token: TOKEN, amount: 100_000n },
          { token: COLLATERAL, nativeAmount: 100_000n },
        ]) {
          mockGetChainId.mockResolvedValue(1);
          vaultV2Entity.getData.mockResolvedValueOnce({
            ...vaultData,
            asset: options.token,
          });
          const prepared = await protocol.prepareSupply(options);
          mockGetChainId.mockResolvedValue(8453);

          await expect(prepared[method]()).rejects.toBeInstanceOf(
            ChainIdMismatchError,
          );
        }
        expect(supplyAction.getRequirements).not.toHaveBeenCalled();
        expect(supplyAction.buildTx).not.toHaveBeenCalled();
        expect(account.getTokenBalance).not.toHaveBeenCalled();
        expect(account.sendTransaction).not.toHaveBeenCalled();
        expect(account.quoteSendTransaction).not.toHaveBeenCalled();
      },
    );

    test.each(["submit", "quote"] as const)(
      "behavior: prepared supply forwards its token signature to %s",
      async (method) => {
        const signature = {
          args: {
            owner: ADDRESS,
            asset: TOKEN,
            amount: 100_000n,
            nonce: 7n,
            deadline: SIGNATURE_DEADLINE,
            signature: "0x1234",
          },
          action: {
            type: "permit2SignatureTransfer",
            args: {
              spender: "0x0000000000000000000000000000000000000001",
              amount: 100_000n,
              nonce: 7n,
              deadline: SIGNATURE_DEADLINE,
            },
          },
        } satisfies BundlesTokenRequirementSignature;
        account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        account.sendTransaction = vi
          .fn()
          .mockResolvedValue({ hash: "supply-hash", fee: 123n });
        account.quoteSendTransaction = vi.fn().mockResolvedValue({ fee: 123n });
        const prepared = await protocol.prepareSupply({
          token: TOKEN,
          amount: 100_000n,
        });

        const result = await prepared[method](signature);

        expect(supplyAction.buildTx).toHaveBeenCalledWith([signature]);
        expect(vaultV2Entity.deposit).toHaveBeenCalledTimes(1);
        expect(account.quoteSendTransaction).toHaveBeenCalledWith(SUPPLY_TX);
        if (method === "submit") {
          expect(account.signTransaction).toHaveBeenCalledWith({
            ...SUPPLY_TX,
            ...POPULATED_TRANSACTION,
          });
          expect(result).toEqual({
            hash: MOCK_TRANSACTION_HASH,
            fee: 123n,
          });
        } else {
          expect(account.signTransaction).not.toHaveBeenCalled();
          expect(sendRawTransactionMock).not.toHaveBeenCalled();
          expect(result).toEqual({ fee: 123n });
        }
      },
    );

    test("behavior: prepared supply checks the balance of the token it was prepared with", async () => {
      const options = {
        token: TOKEN,
        amount: 100_000n,
      } as { token: string; amount: bigint };

      const prepared = await protocol.prepareSupply(options);

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-supply-hash", fee: 12_345n });

      // A caller reusing its own options object must not retarget the balance check
      // away from the asset the prepared action actually deposits.
      options.token = COLLATERAL;

      await prepared.submit();

      expect(account.getTokenBalance).toHaveBeenCalledWith(TOKEN);
    });

    test("rejects a signer result bound to another chain", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      const wrongChainTransaction = await account.signTransaction({
        ...SUPPLY_TX,
        ...POPULATED_TRANSACTION,
        chainId: 8453,
      });
      vi.mocked(account.signTransaction)
        .mockClear()
        .mockResolvedValueOnce(wrongChainTransaction);

      await expect(
        protocol.supply({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(sendRawTransactionMock).not.toHaveBeenCalled();
    });

    test("rejects an EOA provider switch after signing", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      const signedTransaction = await account.signTransaction({
        ...SUPPLY_TX,
        ...POPULATED_TRANSACTION,
      });
      vi.mocked(account.signTransaction)
        .mockClear()
        .mockImplementationOnce(async () => {
          mockGetChainId.mockResolvedValue(8453);
          return signedTransaction;
        });

      await expect(
        protocol.supply({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(sendRawTransactionMock).not.toHaveBeenCalled();
    });

    test("should use vaultV2 when an explicit vault is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      await prepared.submit();

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should default explicit vault configuration to Morpho Vault V2", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      await protocol.getVaultPosition();

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should copy options instead of keeping the caller reference", async () => {
      const mutableParams = { ...MARKET_PARAMS } as {
        loanToken: string;
        collateralToken: string;
        oracle: string;
        irm: string;
        lltv: bigint;
      };
      const options = {
        chainId: 1,
        earnVaultAddress: VAULT as string,
        borrowMarketParams: mutableParams,
        metadata: { origin: "before" },
      };
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(
        account,
        options as unknown as ConstructorParameters<
          typeof MorphoProtocolEvm
        >[1],
      );
      options.earnVaultAddress = "0x0000000000000000000000000000000000000001";
      mutableParams.loanToken = COLLATERAL;
      options.metadata.origin = "after";

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      await prepared.submit();

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
      expect(morphoViemExtensionMock).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { origin: "before" } }),
      );
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ vaultData, amount: 100_000n }),
      );
    });

    test("should build a native-only vault deposit", async () => {
      vaultV2Entity.getData.mockResolvedValueOnce({
        ...vaultData,
        asset: COLLATERAL,
      });

      account.getTokenBalance = vi.fn();

      await protocol.supply({ token: COLLATERAL, nativeAmount: 100_000n });

      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({
          nativeAmount: 100_000n,
          userAddress: ADDRESS,
          vaultData: expect.objectContaining({ asset: COLLATERAL }),
        }),
      );
    });

    test("should reject zero deposit amount across erc20 and native sources", async () => {
      await expect(
        protocol.prepareSupply({ token: TOKEN, amount: 0n }),
      ).rejects.toBeInstanceOf(NonPositiveInputError);
    });

    test("should use vaultV2 when the selected preset is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: "sky-money-usdt-savings" },
        borrowMarketParams: MARKET_PARAMS,
      });

      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      await prepared.submit();

      expect(vaultV2Mock).toHaveBeenCalledWith(VAULT, 1);
    });

    test("should reject earn presets on the wrong chain", async () => {
      mockGetChainId.mockResolvedValue(8453);
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        presets: { earn: "sky-money-usdt-savings" },
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(protocol.getVaultPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
    });

    test("should throw if 'token' is invalid", async () => {
      await expect(
        protocol.prepareSupply({
          token: "invalid-token-address",
          amount: 100_000n,
        }),
      ).rejects.toThrow("'token' must be a valid address.");
    });

    test("should throw if 'amount' and 'nativeAmount' are zero", async () => {
      await expect(
        protocol.prepareSupply({ token: TOKEN, amount: 0n }),
      ).rejects.toBeInstanceOf(NonPositiveInputError);
    });

    test("should reject 'amount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.prepareSupply({
          token: TOKEN,
          amount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'amount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });

    test("should reject 'nativeAmount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.prepareSupply({
          token: TOKEN,
          nativeAmount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'nativeAmount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });

    test("should require chainId with explicit Morpho targets", () => {
      expect(
        () =>
          new MorphoProtocolEvm(account, {
            earnVaultAddress: VAULT,
            borrowMarketParams: MARKET_PARAMS,
          }),
      ).toThrow(
        "'chainId' must be configured when using explicit Morpho targets.",
      );
    });
  });

  describe("quotes", () => {
    test("should quote a vault deposit transaction", async () => {
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });

      const result = await protocol.quoteSupply({
        token: TOKEN,
        amount: 100_000n,
      });

      expect(vaultV2Entity.deposit).toHaveBeenCalledTimes(1);
      expect(supplyAction.buildTx).toHaveBeenCalledWith(undefined);

      expect(account.quoteSendTransaction).toHaveBeenCalledWith(SUPPLY_TX);
      expect(result).toEqual({ fee: 12_345n });
    });

    test.each([
      {
        name: "quoteWithdraw",
        quote: () => protocol.quoteWithdraw({ token: TOKEN, amount: 100_000n }),
        transaction: WITHDRAW_TX,
      },
      {
        name: "quoteBorrow",
        quote: () => protocol.quoteBorrow({ token: TOKEN, amount: 100_000n }),
        transaction: BORROW_TX,
      },
      {
        name: "quoteRepay",
        quote: () => protocol.quoteRepay({ token: TOKEN, amount: 100_000n }),
        transaction: REPAY_TX,
      },
      {
        name: "quoteSupplyCollateral",
        quote: () =>
          protocol.quoteSupplyCollateral({
            token: COLLATERAL,
            amount: 100_000n,
          }),
        transaction: SUPPLY_COLLATERAL_TX,
      },
      {
        name: "quoteWithdrawCollateral",
        quote: () =>
          protocol.quoteWithdrawCollateral({
            token: COLLATERAL,
            amount: 100_000n,
          }),
        transaction: WITHDRAW_COLLATERAL_TX,
      },
    ])(
      "should route $name through the WDK quote API",
      async ({ quote, transaction }) => {
        withdrawAction.getRequirements.mockResolvedValue([]);
        account.quoteSendTransaction = vi
          .fn()
          .mockResolvedValue({ fee: 12_345n });

        await expect(quote()).resolves.toEqual({ fee: 12_345n });

        expect(account.quoteSendTransaction).toHaveBeenCalledWith(transaction);
      },
    );

    test("snapshots collateral-withdraw quote options", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });
      const options = { token: COLLATERAL, amount: 100_000n };

      const pending = protocol.quoteWithdrawCollateral(options);
      options.amount = 200_000n;
      observedChain.resolve(1);
      await pending;

      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith(
        expect.objectContaining({ collateralAssets: 100_000n }),
      );
    });
  });

  describe("withdraw", () => {
    beforeEach(() => {
      // `vi.clearAllMocks()` keeps implementations, so restore the shared default here and let
      // individual tests opt into an already-satisfied allowance.
      withdrawAction.getRequirements.mockResolvedValue([
        { action: { type: "erc20Approval" } },
      ]);
    });

    test("should build a vault withdraw with morpho-sdk and send it", async () => {
      withdrawAction.getRequirements.mockResolvedValue([]);

      const result = await protocol.withdraw({
        token: TOKEN,
        amount: 100_000n,
      });

      expect(vaultV2Entity.withdraw).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        vaultData,
        slippageTolerance: undefined,
      });
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...WITHDRAW_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("behavior: forwards the configured slippage tolerance", async () => {
      withdrawAction.getRequirements.mockResolvedValue([]);
      const configured = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
        slippageTolerance: 5_000_000_000_000_000n,
      });
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-withdraw-hash", fee: 12_345n });

      await configured.withdraw({ token: TOKEN, amount: 100_000n });

      expect(vaultV2Entity.withdraw).toHaveBeenCalledWith({
        amount: 100_000n,
        userAddress: ADDRESS,
        vaultData,
        slippageTolerance: 5_000_000_000_000_000n,
      });
    });

    test("should expose and consume vault-share requirements", async () => {
      const options = { token: TOKEN, amount: 100_000n };
      const prepared = await protocol.prepareWithdraw(options);
      expect(Object.isFrozen(prepared)).toBe(true);
      const requirements = await prepared.getRequirements();
      expectTypeOf(requirements).toEqualTypeOf<
        readonly (
          | RequirementApproval
          | RequirementSignatureRequest<Erc2612RequirementSignature>
        )[]
      >();
      expect(requirements).toEqual([{ action: { type: "erc20Approval" } }]);
      expect(withdrawAction.getRequirements).toHaveBeenCalledWith();

      const requirementSignature = {
        args: { deadline: SIGNATURE_DEADLINE },
        action: { type: "permit" },
      } as unknown as Erc2612RequirementSignature;
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-withdraw-hash", fee: 12_345n });
      await prepared.submit(requirementSignature);
      expect(withdrawAction.buildTx).toHaveBeenCalledWith([
        requirementSignature,
      ]);
      expect(vaultV2Entity.withdraw).toHaveBeenCalledTimes(1);
    });

    test("should submit a prepared withdrawal without a signature once the allowance matches", async () => {
      withdrawAction.getRequirements.mockResolvedValue([]);
      const prepared = await protocol.prepareWithdraw({
        token: TOKEN,
        amount: 100_000n,
      });
      const result = await prepared.submit();

      expect(withdrawAction.buildTx).toHaveBeenCalledWith(undefined);
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...WITHDRAW_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("error: UnresolvedVaultWithdrawRequirementsError on prepared submit without a signature", async () => {
      const prepared = await protocol.prepareWithdraw({
        token: TOKEN,
        amount: 100_000n,
      });
      account.sendTransaction = vi.fn();

      // Never awaits prepared.getRequirements() first — submit() must re-resolve the allowance
      // itself rather than building against a stale, possibly oversized leftover approval.
      await expect(prepared.submit()).rejects.toBeInstanceOf(
        UnresolvedVaultWithdrawRequirementsError,
      );
      expect(withdrawAction.buildTx).not.toHaveBeenCalled();
      expect(account.sendTransaction).not.toHaveBeenCalled();
    });

    test("should throw if 'to' is not the wallet address", async () => {
      await expect(
        protocol.withdraw({
          token: TOKEN,
          amount: 100_000n,
          to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        }),
      ).rejects.toBeInstanceOf(AddressMismatchError);
    });

    test("error: UnresolvedVaultWithdrawRequirementsError", async () => {
      account.sendTransaction = vi.fn();

      await expect(
        protocol.withdraw({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(UnresolvedVaultWithdrawRequirementsError);
      expect(withdrawAction.getRequirements).toHaveBeenCalledWith();
      expect(withdrawAction.buildTx).not.toHaveBeenCalled();
      expect(account.sendTransaction).not.toHaveBeenCalled();
    });

    test("snapshots withdraw options before resolving chain state", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      withdrawAction.getRequirements.mockResolvedValue([]);
      const options = { token: TOKEN, amount: 100_000n };

      const pending = protocol.withdraw(options);
      options.amount = 200_000n;
      observedChain.resolve(1);
      await pending;

      expect(vaultV2Entity.withdraw).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100_000n }),
      );
    });
  });

  describe("borrow", () => {
    test("types: borrow accepts only Vault V2 reallocations", () => {
      expectTypeOf<
        NonNullable<MorphoBorrowOptions["reallocations"]>
      >().toEqualTypeOf<readonly VaultV2BlueReallocation[]>();
    });

    test("should build a market borrow with morpho-sdk and send it", async () => {
      const result = await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(blueMock).toHaveBeenCalledWith(
        expect.objectContaining({
          loanToken: TOKEN,
          collateralToken: COLLATERAL,
        }),
        1,
      );
      expect(marketEntity.getPositionData).toHaveBeenCalledWith(ADDRESS);
      expect(marketEntity.borrow).toHaveBeenCalledWith({
        userAddress: ADDRESS,
        borrowAssets: 100_000n,
        positionData,
        reallocations: undefined,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...BORROW_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("should forward Vault V2 BluePublicAllocator reallocations", async () => {
      const reallocation = {
        vault: VAULT,
        from: { type: "idle" },
        to: {
          adapter: "0x0000000000000000000000000000000000000020",
        },
        assets: 50_000n,
        penalty: 1n,
      } satisfies VaultV2BlueReallocation;

      await protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        reallocations: [reallocation],
      });

      expect(marketEntity.borrow).toHaveBeenCalledWith({
        userAddress: ADDRESS,
        borrowAssets: 100_000n,
        positionData,
        reallocations: [reallocation],
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
    });

    test("snapshots borrow inputs before resolving chain state", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      const adapter = "0x0000000000000000000000000000000000000020";
      const sourceMarketParams = new MarketParams({
        ...MARKET_PARAMS,
        collateralToken: VAULT,
      });
      const reallocation = {
        vault: VAULT,
        from: {
          type: "market",
          adapter: COLLATERAL,
          marketParams: sourceMarketParams,
        },
        to: { adapter: adapter as `0x${string}` },
        assets: 50_000n,
        penalty: 1n,
      } satisfies VaultV2BlueReallocation;
      const requirementSignature = {
        args: {
          owner: ADDRESS,
          authorized: adapter,
          isAuthorized: true,
          nonce: 1n,
          deadline: 2n,
          signature: "0x01",
        },
        action: {
          type: "authorization",
          args: { authorized: adapter, isAuthorized: true, deadline: 2n },
        },
      } satisfies AuthorizationRequirementSignature;
      const options = {
        token: TOKEN,
        amount: 100_000n,
        reallocations: [reallocation],
        requirementSignature,
      } satisfies MorphoBorrowOptions;

      const pending = protocol.borrow(options);
      options.amount = 200_000n;
      reallocation.assets = 75_000n;
      reallocation.to.adapter = TOKEN;
      Object.assign(sourceMarketParams, { collateralToken: TOKEN });
      requirementSignature.args.deadline = 3n;
      requirementSignature.action.args.deadline = 3n;
      observedChain.resolve(1);
      await pending;

      expect(marketEntity.borrow).toHaveBeenCalledWith(
        expect.objectContaining({
          borrowAssets: 100_000n,
          reallocations: [
            expect.objectContaining({
              assets: 50_000n,
              from: expect.objectContaining({
                type: "market",
                marketParams: expect.objectContaining({
                  collateralToken: VAULT,
                }),
              }),
              to: { adapter },
            }),
          ],
        }),
      );
      const forwardedSignature = borrowAction.buildTx.mock.calls[0]?.[0]?.[0];
      expect(forwardedSignature).not.toBe(requirementSignature);
      expect(forwardedSignature).toEqual(
        expect.objectContaining({
          args: expect.objectContaining({ deadline: 2n }),
          action: expect.objectContaining({
            args: expect.objectContaining({ deadline: 2n }),
          }),
        }),
      );
    });

    test("should fetch market params when only borrowMarketId is configured", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketId: MARKET_ID,
      });

      await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(fetchMarketMock).toHaveBeenCalledWith(
        MARKET_ID,
        expect.any(Object),
        {
          deployless: undefined,
        },
      );
    });

    test("should reject borrow presets on the wrong chain", async () => {
      mockGetChainId.mockResolvedValue(8453);
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        presets: { borrow: "wsteth" },
      });

      await expect(
        protocol.borrow({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(fetchMarketMock).not.toHaveBeenCalled();
    });

    test("should return borrow requirements from morpho-sdk", async () => {
      const options = {
        token: TOKEN,
        amount: 100_000n,
      } satisfies MorphoBorrowOptions;
      const promise = protocol.getBorrowRequirements(options);
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly AuthorizationOrSignatureRequirement[]>
      >();
      const requirements = await promise;

      expect(requirements).toEqual([{ action: { type: "blueAuthorization" } }]);
      expect(borrowAction.getRequirements).toHaveBeenCalled();
    });

    test("types: Vault V2 borrow requirements remain authorization-only", async () => {
      const options = {
        token: TOKEN,
        amount: 100_000n,
        reallocations: [
          {
            vault: VAULT,
            from: { type: "idle" },
            to: {
              adapter: "0x0000000000000000000000000000000000000020",
            },
            assets: 50_000n,
            penalty: 1n,
          },
        ],
      } satisfies MorphoBorrowOptions;

      const promise = protocol.getBorrowRequirements(options);
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly AuthorizationOrSignatureRequirement[]>
      >();
      await promise;
    });

    test("should build the borrow without signatures by default", async () => {
      await protocol.borrow({ token: TOKEN, amount: 100_000n });

      expect(borrowAction.buildTx).toHaveBeenCalledWith(undefined);
    });

    test("should fold a signed authorization into the bundle when provided", async () => {
      const requirementSignature = {
        args: { deadline: SIGNATURE_DEADLINE },
        action: { type: "authorization" },
      } as unknown as AuthorizationRequirementSignature;

      await protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        requirementSignature,
      });

      expect(borrowAction.buildTx).toHaveBeenCalledWith([
        expect.objectContaining({
          action: expect.objectContaining({ type: "authorization" }),
        }),
      ]);
      expect(marketEntity.borrow).toHaveBeenCalledWith(
        expect.objectContaining({ deadline: SIGNATURE_DEADLINE }),
      );
    });

    test("error: BlueBundlesV1DeadlineExceedsWindowError on a far-future signature deadline", async () => {
      const requirementSignature = {
        args: {
          deadline: BigInt(Math.floor(Date.now() / 1_000)) + 7_200n + 3_600n,
        },
        action: { type: "authorization" },
      } as unknown as AuthorizationRequirementSignature;

      await expect(
        protocol.borrow({
          token: TOKEN,
          amount: 100_000n,
          requirementSignature,
        }),
      ).rejects.toBeInstanceOf(BlueBundlesV1DeadlineExceedsWindowError);
    });

    test("behavior: accepts a signature deadline exactly at the two-hour window bound plus the clock-skew allowance", async () => {
      const deadline = BigInt(Math.floor(Date.now() / 1_000)) + 7_200n + 300n;
      const requirementSignature = {
        args: { deadline },
        action: { type: "authorization" },
      } as unknown as AuthorizationRequirementSignature;

      await protocol.borrow({
        token: TOKEN,
        amount: 100_000n,
        requirementSignature,
      });

      expect(borrowAction.buildTx).toHaveBeenCalledWith([
        expect.objectContaining({
          action: expect.objectContaining({ type: "authorization" }),
        }),
      ]);
      expect(marketEntity.borrow).toHaveBeenCalledWith(
        expect.objectContaining({ deadline }),
      );
    });

    test("error: BlueBundlesV1DeadlineExceedsWindowError one second past the two-hour window plus the clock-skew allowance", async () => {
      const requirementSignature = {
        args: {
          deadline: BigInt(Math.floor(Date.now() / 1_000)) + 7_200n + 301n,
        },
        action: { type: "authorization" },
      } as unknown as AuthorizationRequirementSignature;

      const error = await protocol
        .borrow({
          token: TOKEN,
          amount: 100_000n,
          requirementSignature,
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BlueBundlesV1DeadlineExceedsWindowError);
      expect(
        (error as BlueBundlesV1DeadlineExceedsWindowError).maxDeadline,
      ).toBe(BigInt(Math.floor(Date.now() / 1_000)) + 7_500n);
    });

    test("should throw if 'onBehalfOf' differs from the wallet address", async () => {
      await expect(
        protocol.borrow({
          token: TOKEN,
          amount: 100_000n,
          onBehalfOf: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
        }),
      ).rejects.toThrow(
        "'onBehalfOf' must equal the wallet account address for Morpho SDK-backed operations.",
      );
    });

    test("should reject 'amount' numbers above Number.MAX_SAFE_INTEGER", async () => {
      await expect(
        protocol.borrow({
          token: TOKEN,
          amount: Number.MAX_SAFE_INTEGER + 1,
        }),
      ).rejects.toThrow(
        "'amount' must be a safe integer; pass a bigint for values above Number.MAX_SAFE_INTEGER.",
      );
    });
  });

  describe("repay", () => {
    test("should build a max repay by shares with morpho-sdk", async () => {
      const result = await protocol.repay({ token: TOKEN, amount: "max" });

      expect(marketEntity.repay).toHaveBeenCalledWith({
        repayShares: viem.maxUint256,
        userAddress: ADDRESS,
        positionData,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...REPAY_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("should build an asset repay with morpho-sdk after balance check", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      await protocol.repay({ token: TOKEN, amount: 100_000n });

      expect(account.getTokenBalance).toHaveBeenCalledWith(TOKEN);
      expect(marketEntity.repay).toHaveBeenCalledWith({
        repayAssets: 100_000n,
        userAddress: ADDRESS,
        positionData,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
    });

    test("behavior: forwards requirement options without approvalAmount", async () => {
      const requirementOptions = {
        useSimplePermit: true,
        permit2Nonce: 7n,
      } satisfies RequirementOptions;
      const promise = protocol.getRepayRequirements(
        { token: TOKEN, amount: 100_000n },
        requirementOptions,
      );
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly BundlesApprovalOrSignatureRequirement[]>
      >();
      await promise;
      expect(repayAction.getRequirements).toHaveBeenCalledWith(
        requirementOptions,
      );
    });

    test("behavior: forwards no requirement options for full repay", async () => {
      await protocol.getRepayRequirements({
        token: TOKEN,
        amount: "max",
      });

      expect(repayAction.getRequirements).toHaveBeenCalledWith(undefined);
    });

    test("behavior: max repay forwards requirement options unchanged", async () => {
      await protocol.getRepayRequirements(
        { token: TOKEN, amount: "max" },
        { useSimplePermit: true, permit2Nonce: 7n },
      );

      expect(repayAction.getRequirements).toHaveBeenCalledWith({
        useSimplePermit: true,
        permit2Nonce: 7n,
      });
    });

    test("behavior: forwards default requirement options for exact-asset repay", async () => {
      await protocol.getRepayRequirements({
        token: TOKEN,
        amount: 100_000n,
      });

      expect(repayAction.getRequirements).toHaveBeenCalledWith(undefined);
    });

    test("should fold a token signature and its deadline into max repay", async () => {
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: "dummy-repay-hash", fee: 12_345n });
      const requirementSignature = {
        args: { deadline: SIGNATURE_DEADLINE },
        action: { type: "permit2SignatureTransfer" },
      } as unknown as BundlesTokenRequirementSignature;

      await protocol.repay({
        token: TOKEN,
        amount: "max",
        requirementSignature,
      });

      expect(repayAction.buildTx).toHaveBeenCalledWith([requirementSignature]);
      expect(marketEntity.repay).toHaveBeenCalledWith(
        expect.objectContaining({
          repayShares: viem.maxUint256,
          deadline: SIGNATURE_DEADLINE,
        }),
      );
    });
  });

  describe("collateral", () => {
    test("types: collateral funding is ERC-20 or native, never both", () => {
      expectTypeOf<{
        token: string;
        amount: bigint;
      }>().toMatchTypeOf<MorphoCollateralSupplyOptions>();
      expectTypeOf<{
        token: string;
        nativeAmount: bigint;
      }>().toMatchTypeOf<MorphoCollateralSupplyOptions>();
      expectTypeOf<{
        token: string;
        amount: bigint;
        nativeAmount: bigint;
      }>().not.toMatchTypeOf<MorphoCollateralSupplyOptions>();
      expectTypeOf<{
        token: string;
        amount: bigint;
        slippageTolerance: bigint;
      }>().not.toMatchTypeOf<MorphoCollateralSupplyOptions>();
    });

    test("should build a supply collateral transaction with morpho-sdk", async () => {
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);

      const result = await protocol.supplyCollateral({
        token: COLLATERAL,
        amount: 100_000n,
      });

      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        collateralAssets: 100_000n,
        nativeAmount: undefined,
        userAddress: ADDRESS,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...SUPPLY_COLLATERAL_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("should build a native-only supply collateral transaction", async () => {
      account.getTokenBalance = vi.fn();

      await protocol.supplyCollateral({
        token: COLLATERAL,
        nativeAmount: 100_000n,
      });

      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(marketEntity.supplyCollateral).toHaveBeenCalledWith({
        collateralAssets: 100_000n,
        nativeAmount: 100_000n,
        userAddress: ADDRESS,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
    });

    test.each([
      "supplyCollateral",
      "getSupplyCollateralRequirements",
      "quoteSupplyCollateral",
    ] as const)(
      "error: MixedBlueCollateralFundingError from %s",
      async (method) => {
        const mixedFunding = {
          token: COLLATERAL,
          amount: 50_000n,
          nativeAmount: 50_000n,
        } as unknown as MorphoCollateralSupplyOptions;

        await expect(protocol[method](mixedFunding)).rejects.toBeInstanceOf(
          MixedBlueCollateralFundingError,
        );
        expect(marketEntity.supplyCollateral).not.toHaveBeenCalled();
      },
    );

    test("should build a withdraw collateral transaction with morpho-sdk", async () => {
      const result = await protocol.withdrawCollateral({
        token: COLLATERAL,
        amount: 100_000n,
      });

      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith({
        collateralAssets: 100_000n,
        userAddress: ADDRESS,
        positionData,
        deadline: BLUE_BUNDLES_V1_DEADLINE,
      });
      expect(account.signTransaction).toHaveBeenCalledWith({
        ...WITHDRAW_COLLATERAL_TX,
        ...POPULATED_TRANSACTION,
      });
      expect(result).toEqual({
        hash: MOCK_TRANSACTION_HASH,
        fee: 12_345n,
      });
    });

    test("should pass requirement options to morpho-sdk supply collateral requirements", async () => {
      const requirementOptions = {
        useSimplePermit: true,
        permit2Nonce: 11n,
      } satisfies RequirementOptions;
      const promise = protocol.getSupplyCollateralRequirements(
        { token: COLLATERAL, amount: 100_000n },
        requirementOptions,
      );
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly BundlesApprovalOrSignatureRequirement[]>
      >();
      const requirements = await promise;

      expect(requirements).toEqual([
        {
          action: { type: "erc20Approval", args: { amount: viem.maxUint256 } },
        },
      ]);
      expect(supplyCollateralAction.getRequirements).toHaveBeenCalledWith(
        requirementOptions,
      );
    });

    test("should return withdraw collateral requirements", async () => {
      const promise = protocol.getWithdrawCollateralRequirements({
        token: COLLATERAL,
        amount: 100_000n,
      });
      expectTypeOf(promise).toEqualTypeOf<
        Promise<readonly AuthorizationOrSignatureRequirement[]>
      >();
      const requirements = await promise;

      expect(requirements).toEqual([{ action: { type: "blueAuthorization" } }]);
      expect(withdrawCollateralAction.getRequirements).toHaveBeenCalledWith();
    });

    test("should fold a signed authorization into collateral withdrawal", async () => {
      account.sendTransaction = vi.fn().mockResolvedValue({
        hash: "dummy-withdraw-collateral-hash",
        fee: 12_345n,
      });
      const requirementSignature = {
        args: { deadline: SIGNATURE_DEADLINE },
        action: { type: "authorization" },
      } as unknown as AuthorizationRequirementSignature;

      await protocol.withdrawCollateral({
        token: COLLATERAL,
        amount: 100_000n,
        requirementSignature,
      });

      expect(withdrawCollateralAction.buildTx).toHaveBeenCalledWith([
        requirementSignature,
      ]);
      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith(
        expect.objectContaining({ deadline: SIGNATURE_DEADLINE }),
      );
    });

    test("snapshots the requirement signature before resolving chain state", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      const requirementSignature = {
        args: {
          owner: ADDRESS,
          authorized: COLLATERAL,
          isAuthorized: true,
          nonce: 1n,
          deadline: 2n,
          signature: "0x01",
        },
        action: {
          type: "authorization",
          args: { authorized: COLLATERAL, isAuthorized: true, deadline: 2n },
        },
      } satisfies AuthorizationRequirementSignature;

      const pending = protocol.withdrawCollateral({
        token: COLLATERAL,
        amount: 100_000n,
        requirementSignature,
      });
      requirementSignature.args.deadline = 3n;
      requirementSignature.action.args.deadline = 3n;
      observedChain.resolve(1);
      await pending;

      const forwardedSignature =
        withdrawCollateralAction.buildTx.mock.calls[0]?.[0]?.[0];
      expect(forwardedSignature).not.toBe(requirementSignature);
      expect(forwardedSignature).toEqual(
        expect.objectContaining({
          args: expect.objectContaining({ deadline: 2n }),
          action: expect.objectContaining({
            args: expect.objectContaining({ deadline: 2n }),
          }),
        }),
      );
      expect(marketEntity.withdrawCollateral).toHaveBeenCalledWith(
        expect.objectContaining({ deadline: 2n }),
      );
    });
  });

  describe("erc-4337", () => {
    test("should use the validated balance client and atomically send a cache-proof erc-4337 operation", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
      const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      readContractMock.mockResolvedValueOnce(0n);
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });
      const signed = { signature: "0x01" } as unknown as Awaited<
        ReturnType<typeof account.signTransaction>
      >;
      account.signTransaction = vi.fn().mockResolvedValue(signed);
      account.sendTransaction = vi
        .fn()
        .mockResolvedValue({ hash: MOCK_USER_OPERATION_HASH, fee: 99_999n });

      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(
        protocol.supply({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(Error);
      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(account.quoteSendTransaction).not.toHaveBeenCalled();

      readContractMock.mockResolvedValue(100_000n);
      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      const config = { paymasterToken: { address: TOKEN } };
      const pending = prepared.submit(undefined, config);
      config.paymasterToken.address = COLLATERAL;
      observedChain.resolve(1);
      const result = await pending;

      expect(account.getTokenBalance).not.toHaveBeenCalled();
      expect(readContractMock).toHaveBeenCalledWith({
        address: TOKEN,
        abi: viem.erc20Abi,
        functionName: "balanceOf",
        args: [ADDRESS],
      });
      const operationConfig = vi.mocked(account.sendTransaction).mock
        .calls[0]?.[1];
      expect(operationConfig).toEqual({
        paymasterToken: { address: TOKEN },
        nonceKey: 0n,
      });
      expect(operationConfig).not.toBe(config);
      expect(
        operationConfig !== undefined &&
          "paymasterToken" in operationConfig &&
          operationConfig.paymasterToken,
      ).not.toBe(config.paymasterToken);
      expect(account.quoteSendTransaction).not.toHaveBeenCalled();
      expect(account.signTransaction).not.toHaveBeenCalled();
      expect(account.sendTransaction).toHaveBeenCalledWith(
        SUPPLY_TX,
        operationConfig,
      );
      expect(result).toEqual({
        hash: MOCK_USER_OPERATION_HASH,
        fee: 99_999n,
      });
      const quoteConfig = { useNativeCoins: true as const };
      await expect(
        protocol.quoteBorrow({ token: TOKEN, amount: 100_000n }, quoteConfig),
      ).resolves.toEqual({ fee: 12_345n });
      const forwardedQuoteConfig = vi.mocked(account.quoteSendTransaction).mock
        .calls[0]?.[1];
      expect(account.quoteSendTransaction).toHaveBeenCalledWith(
        BORROW_TX,
        quoteConfig,
      );
      expect(forwardedQuoteConfig).not.toBe(quoteConfig);
    });

    test.each([
      { name: "short", hash: "0x1234" },
      { name: "63-nibble", hash: `0x${"a".repeat(63)}` },
    ] as const)(
      "rejects a malformed ERC-4337 transaction hash ($name)",
      async ({ hash }) => {
        // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
        const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
          chainId: 1,
          provider: { request: async () => "0x1" },
          bundlerUrl: "https://dummy-bundler-url.com",
          safeModulesVersion: "0.3.0",
          isSponsored: false,
          useNativeCoins: true,
        });
        account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
        account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
        account.sendTransaction = vi.fn().mockResolvedValue({
          hash,
          fee: 99_999n,
        });

        // biome-ignore lint/suspicious/noShadow: test-local protocol for the ERC-4337 account above
        const protocol = new MorphoProtocolEvm(account, {
          chainId: 1,
          earnVaultAddress: VAULT,
          borrowMarketParams: MARKET_PARAMS,
        });
        readContractMock.mockResolvedValue(100_000n);

        const prepared = await protocol.prepareSupply({
          token: TOKEN,
          amount: 100_000n,
        });
        const error = await prepared
          .submit()
          .catch((caught: unknown) => caught);

        assert(error instanceof InvalidTransactionHashError);
        expect(error.eoa).toBeUndefined();
        expect(error.message).toContain(
          "The user operation may already be in flight (e.g. with `nonceKey` or `parallel`); look it up with the bundler or check the account nonce before retrying the operation.",
        );
        expect(classifyError(error)).toBe("integrity");
      },
    );

    test("reports bundler transport failures without returning a result", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account using the real WDK bundler transport
      const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: { request: async () => "0x1" },
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      account.getTokenBalance = vi.fn().mockResolvedValue(100_000n);
      Reflect.set(
        account,
        "_prepareForSend",
        vi.fn().mockResolvedValue({
          fee: 0n,
          userOp: {},
          smartAccount: { entrypointAddress: VAULT },
          chainId: 1n,
        }),
      );
      Reflect.set(
        account,
        "_signUserOperation",
        vi.fn().mockResolvedValue({
          userOp: {},
          smartAccount: { entrypointAddress: VAULT },
          chainId: 1n,
        }),
      );
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("fetch failed"));
      vi.stubGlobal("fetch", fetchMock);

      // biome-ignore lint/suspicious/noShadow: test-local protocol for the ERC-4337 account above
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });
      readContractMock.mockResolvedValue(100_000n);

      try {
        const prepared = await protocol.prepareSupply({
          token: TOKEN,
          amount: 100_000n,
        });
        const error = await prepared
          .submit()
          .catch((caught: unknown) => caught);

        expect(fetchMock).toHaveBeenCalled();
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).constructor.name).toBe("AbstractionKitError");
        expect(classifyError(error)).toBe("unknown");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    test("binds WDK's signing chain without splitting atomic dispatch", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
      const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      readContractMock.mockResolvedValue(100_000n);
      let signingChainId: bigint | undefined;
      account.sendTransaction = vi.fn(async function (this: object) {
        (account as unknown as { _chainId: bigint | undefined })._chainId =
          8453n;
        const getChainId = Reflect.get(
          this,
          "_getChainId",
        ) as () => Promise<bigint>;
        signingChainId = await getChainId.call(this);
        return { hash: MOCK_USER_OPERATION_HASH, fee: 777n };
      });
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
      });

      await expect(
        protocol.supply(
          { token: TOKEN, amount: 100_000n },
          { paymasterToken: { address: TOKEN } },
        ),
      ).resolves.toEqual({ hash: MOCK_USER_OPERATION_HASH, fee: 777n });

      expect(signingChainId).toBe(1n);
      expect(account.sendTransaction).toHaveBeenCalledWith(SUPPLY_TX, {
        paymasterToken: { address: TOKEN },
        nonceKey: 0n,
      });
    });

    test("behavior: bypasses WDK's transaction-only quote cache", async () => {
      const provider = {
        request: vi.fn(async ({ method }: { method: string }) => {
          if (method === "eth_chainId") return "0x1";
          if (method === "eth_call") return "0x0";
          throw new Error(`Unhandled RPC ${method}`);
        }),
      };
      const erc4337Account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider,
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      erc4337Account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      readContractMock.mockResolvedValue(100_000n);

      const internals = erc4337Account as unknown as {
        _buildUserOperation: (...args: unknown[]) => Promise<unknown>;
        _sendUserOperation: (...args: unknown[]) => Promise<string>;
      };
      const smartAccount = {
        entrypointAddress: "0x0000000071727De22E5E9d8BAf0edAc6f37da032",
        accountAddress: ADDRESS,
      };
      const cachedUserOp = {
        nonce: 0n,
        callGasLimit: 1n,
        verificationGasLimit: 1n,
        preVerificationGas: 1n,
        maxFeePerGas: 100n,
      };
      const buildUserOperation = vi
        .spyOn(internals, "_buildUserOperation")
        .mockResolvedValueOnce({
          userOp: cachedUserOp,
          smartAccount,
          chainId: 1n,
          mode: "native",
        })
        .mockResolvedValueOnce({
          userOp: { ...cachedUserOp, maxFeePerGas: 200n },
          smartAccount,
          chainId: 1n,
          mode: "native",
        });
      vi.spyOn(internals, "_sendUserOperation").mockResolvedValue(
        MOCK_USER_OPERATION_HASH,
      );
      const sendTransaction = vi.spyOn(erc4337Account, "sendTransaction");
      const erc4337Protocol = new MorphoProtocolEvm(erc4337Account, {
        chainId: 1,
        earnVaultAddress: VAULT,
      });

      await expect(
        erc4337Protocol.quoteSupply(
          { token: TOKEN, amount: 100_000n },
          { transactionMaxFee: 400n },
        ),
      ).resolves.toEqual({ fee: 360n });
      await expect(
        erc4337Protocol.supply(
          { token: TOKEN, amount: 100_000n },
          { transactionMaxFee: 1_000n },
        ),
      ).resolves.toEqual({
        hash: MOCK_USER_OPERATION_HASH,
        fee: 720n,
      });

      expect(sendTransaction).toHaveBeenCalledWith(SUPPLY_TX, {
        transactionMaxFee: 1_000n,
        nonceKey: 0n,
      });
      expect(buildUserOperation).toHaveBeenCalledTimes(2);
      expect(buildUserOperation.mock.calls[1]?.[1]).toEqual(
        expect.objectContaining({ transactionMaxFee: 1_000n, nonceKey: 0n }),
      );
      expect(buildUserOperation.mock.calls[1]?.[2]).toEqual({ nonce: 0n });
    });

    test.each([
      ["parallel", { parallel: true }],
      ["custom nonce", { nonceKey: "morpho" }],
    ])(
      "behavior: preserves an account-level %s lane",
      async (_name, nonceConfig) => {
        // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
        const account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
          chainId: 1,
          provider: "https://dummy-rpc-url.com",
          bundlerUrl: "https://dummy-bundler-url.com",
          safeModulesVersion: "0.3.0",
          isSponsored: false,
          useNativeCoins: true,
          ...nonceConfig,
        });
        account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
        readContractMock.mockResolvedValue(100_000n);
        account.sendTransaction = vi.fn().mockResolvedValue({
          hash: MOCK_USER_OPERATION_HASH,
          fee: 99_999n,
        });
        // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
        const protocol = new MorphoProtocolEvm(account, {
          chainId: 1,
          earnVaultAddress: VAULT,
        });

        await protocol.supply({ token: TOKEN, amount: 100_000n });

        expect(account.sendTransaction).toHaveBeenCalledWith(
          SUPPLY_TX,
          undefined,
        );
      },
    );

    test("snapshots native value before resolving chain state", async () => {
      const observedChain = Promise.withResolvers<number>();
      mockGetChainId.mockImplementationOnce(() => observedChain.promise);
      const options = { token: TOKEN, nativeAmount: 100_000n };

      const result = protocol.supply(options);
      options.nativeAmount = 200_000n;
      observedChain.resolve(1);
      await result;

      expect(vaultV2Entity.deposit).toHaveBeenCalledWith(
        expect.objectContaining({ nativeAmount: 100_000n }),
      );
      expect(vaultV2Entity.deposit).not.toHaveBeenCalledWith(
        expect.objectContaining({ amount: expect.anything() }),
      );
    });
  });

  describe("read methods", () => {
    test("tracks the provider selected by WDK failover", async () => {
      const attempts: string[] = [];
      const providers = [
        {
          request: vi.fn(async ({ method }: { method: string }) => {
            attempts.push(`A:${method}`);
            if (method === "eth_blockNumber") throw new Error("A down");
            return method === "eth_chainId" ? "0x1" : "0x0";
          }),
        },
        {
          request: vi.fn(async ({ method }: { method: string }) => {
            attempts.push(`B:${method}`);
            if (method === "eth_chainId") return "0x2105";
            return method === "eth_blockNumber" ? "0x1" : "0x0";
          }),
        },
      ];
      const fallbackAccount = new WalletAccountReadOnlyEvm(ADDRESS, {
        provider: providers,
        retries: 1,
        chainId: 1,
      });
      fallbackAccount.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      const fallbackProtocol = new MorphoProtocolEvm(fallbackAccount, {
        chainId: 1,
        borrowMarketParams: MARKET_PARAMS,
      });

      await fallbackProtocol.getMarketPosition();

      const accountProvider = Reflect.get(fallbackAccount, "_provider") as {
        send(method: string, params: readonly unknown[]): Promise<unknown>;
      };
      await accountProvider.send("eth_blockNumber", []);
      const clientConfig = createClientMock.mock.calls[0]?.[0] as {
        transport: viem.Transport;
      };
      const transport = clientConfig.transport({ retryCount: 0 });
      await expect(transport.request({ method: "eth_chainId" })).resolves.toBe(
        "0x2105",
      );
      expect(attempts).toEqual([
        "A:eth_chainId",
        "A:eth_blockNumber",
        "B:eth_chainId",
        "B:eth_blockNumber",
        "B:eth_chainId",
      ]);
    });

    test.each([
      {
        name: "-32000",
        code: -32000,
        message: "header not found",
        errorClass: viem.InvalidInputRpcError,
        expectedCalls: 1,
      },
      {
        name: "-32005",
        code: -32005,
        message: "limit exceeded",
        errorClass: viem.LimitExceededRpcError,
        expectedCalls: 4,
      },
    ] as const)(
      "uses viem retry rules for read-side provider error $name",
      async ({ code, message, errorClass, expectedCalls }) => {
        const providerError = Object.assign(new Error(message), { code });
        const providerSend = vi.fn(async (method: string) => {
          if (method === "eth_chainId") return "0x1";
          if (method === "eth_blockNumber") throw providerError;
          throw new Error(`Unhandled RPC ${method}`);
        });
        // biome-ignore lint/suspicious/noShadow: test-local account for the custom send path
        const account = new WalletAccountReadOnlyEvm(ADDRESS, {
          provider: "https://dummy-rpc-url.com",
        });
        account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
        Reflect.set(account, "_provider", { send: providerSend });
        // biome-ignore lint/suspicious/noShadow: test-local protocol for the custom send path
        const protocol = new MorphoProtocolEvm(account, {
          chainId: 1,
          borrowMarketParams: MARKET_PARAMS,
        });

        await createClientMock.withImplementation(
          (parameters) =>
            viem.createClient(
              parameters as Parameters<typeof viem.createClient>[0],
            ),
          () =>
            morphoViemExtensionMock.withImplementation(
              () => () => ({ morpho: morphoNamespaceMock }),
              async () => {
                await protocol.getMarketPosition();
                const clientCache = Reflect.get(protocol, "_viemClient") as {
                  value: { getBlockNumber: () => Promise<bigint> };
                };

                await expect(
                  clientCache.value.getBlockNumber(),
                ).rejects.toBeInstanceOf(errorClass);
                expect(
                  providerSend.mock.calls.filter(
                    ([method]) => method === "eth_blockNumber",
                  ),
                ).toHaveLength(expectedCalls);
              },
            ),
        );
      },
    );

    test("should return vault position data", async () => {
      const result = await protocol.getVaultPosition();

      expect(readContractMock).toHaveBeenCalledWith({
        address: VAULT,
        abi: viem.erc4626Abi,
        functionName: "balanceOf",
        args: [ADDRESS],
      });
      expect(result).toEqual({
        shares: 123n,
        assets: 123n,
        vaultAddress: VAULT,
      });
    });

    test("should return market position data", async () => {
      const result = await protocol.getMarketPosition();

      expect(result).toEqual({
        supplyShares: 11n,
        borrowShares: 22n,
        borrowAssets: 33n,
        collateral: 44n,
        marketId: new MarketParams(MARKET_PARAMS).id,
      });
    });

    test("reuses same-chain clients after the provider returns", async () => {
      await protocol.getMarketPosition();
      expect(blueMock).toHaveBeenCalledWith(expect.any(Object), 1);
      expect(morphoViemExtensionMock).toHaveBeenCalledOnce();

      mockGetChainId.mockResolvedValue(8453);

      await expect(protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      expect(blueMock).toHaveBeenCalledTimes(1);

      mockGetChainId.mockResolvedValue(1);
      await protocol.getMarketPosition();
      expect(blueMock).toHaveBeenCalledTimes(2);
      expect(morphoViemExtensionMock).toHaveBeenCalledOnce();
    });

    test("serializes concurrent chain observations by invocation order", async () => {
      const first = Promise.withResolvers<number>();
      const second = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);

      const firstPosition = protocol.getMarketPosition();
      const secondPosition = protocol.getMarketPosition();
      second.resolve(1);
      await expect(
        Promise.race([
          secondPosition.then(() => "settled"),
          Promise.resolve("pending"),
        ]),
      ).resolves.toBe("pending");
      first.resolve(1);
      await expect(
        Promise.all([firstPosition, secondPosition]),
      ).resolves.toEqual([
        expect.objectContaining({ marketId: expect.any(String) }),
        expect.objectContaining({ marketId: expect.any(String) }),
      ]);
    });

    test("recovers after a failed chain observation", async () => {
      const providerError = new Error("provider unavailable");
      mockGetChainId.mockRejectedValueOnce(providerError);

      await expect(protocol.getMarketPosition()).rejects.toBe(providerError);
      await expect(protocol.getMarketPosition()).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
    });

    test("does not cache market data resolved after a chain switch", async () => {
      const fetchedMarket = Promise.withResolvers<{
        params: InstanceType<typeof MarketParams>;
      }>();
      fetchMarketMock.mockImplementationOnce(() => fetchedMarket.promise);
      const marketIdProtocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketId: MARKET_ID,
      });

      const stalePosition = marketIdProtocol.getMarketPosition();
      await vi.waitFor(() => expect(fetchMarketMock).toHaveBeenCalledOnce());
      mockGetChainId.mockResolvedValue(8453);
      await expect(marketIdProtocol.getVaultPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      fetchedMarket.resolve({ params: new MarketParams(MARKET_PARAMS) });
      await expect(stalePosition).rejects.toBeInstanceOf(ChainIdMismatchError);

      mockGetChainId.mockResolvedValue(1);
      await marketIdProtocol.getMarketPosition();
      expect(fetchMarketMock).toHaveBeenCalledTimes(2);
    });

    test("rechecks the chain immediately before native-value dispatch", async () => {
      mockGetChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(8453);
      await expect(
        protocol.supply({ token: TOKEN, nativeAmount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(sendRawTransactionMock).not.toHaveBeenCalled();
    });

    test("waits for an older chain observation before dispatch", async () => {
      const balance = Promise.withResolvers<bigint>();
      account.getTokenBalance = vi.fn(() => balance.promise);
      const supply = protocol.supply({ token: TOKEN, amount: 100_000n });
      await vi.waitFor(() =>
        expect(account.getTokenBalance).toHaveBeenCalled(),
      );

      // prepareSupply observes the chain once and revalidates after building the action; the
      // prepared submit revalidates again before the balance check.
      const observationsBeforeBalance = mockGetChainId.mock.calls.length;
      expect(observationsBeforeBalance).toBe(3);

      const switchedChain = Promise.withResolvers<number>();
      const terminalChain = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => switchedChain.promise)
        .mockImplementationOnce(() => terminalChain.promise);
      const switchedPosition = protocol.getMarketPosition();
      balance.resolve(100_000n);
      await vi.waitFor(() =>
        expect(mockGetChainId).toHaveBeenCalledTimes(
          observationsBeforeBalance + 2,
        ),
      );

      terminalChain.resolve(1);
      await Promise.resolve();
      expect(sendRawTransactionMock).not.toHaveBeenCalled();

      switchedChain.resolve(8453);
      await expect(switchedPosition).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      await expect(supply).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(sendRawTransactionMock).not.toHaveBeenCalled();
    });

    test("rejects a market quote when its completion crosses chains", async () => {
      mockGetChainId.mockResolvedValueOnce(1).mockResolvedValueOnce(8453);
      account.quoteSendTransaction = vi
        .fn()
        .mockResolvedValue({ fee: 12_345n });

      await expect(
        protocol.quoteBorrow({ token: TOKEN, amount: 100_000n }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("rejects an in-flight operation after out-of-order A-B-A observations", async () => {
      const requirementResult =
        Promise.withResolvers<{ action: { type: string } }[]>();
      supplyAction.getRequirements.mockImplementationOnce(
        () => requirementResult.promise,
      );
      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      mockGetChainId.mockClear();
      const requirements = prepared.getRequirements();
      await vi.waitFor(() =>
        expect(supplyAction.getRequirements).toHaveBeenCalledOnce(),
      );

      const olderObservation = Promise.withResolvers<number>();
      const newerObservation = Promise.withResolvers<number>();
      mockGetChainId
        .mockImplementationOnce(() => olderObservation.promise)
        .mockImplementationOnce(() => newerObservation.promise);
      const olderPosition = protocol.getMarketPosition();
      const newerPosition = protocol.getMarketPosition();
      await vi.waitFor(() => expect(mockGetChainId).toHaveBeenCalledTimes(3));

      newerObservation.resolve(1);
      await expect(
        Promise.race([
          newerPosition.then(() => "settled"),
          Promise.resolve("pending"),
        ]),
      ).resolves.toBe("pending");
      olderObservation.resolve(8453);
      await expect(olderPosition).rejects.toBeInstanceOf(ChainIdMismatchError);
      await expect(newerPosition).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );

      mockGetChainId.mockResolvedValue(1);
      requirementResult.resolve([{ action: { type: "erc20Approval" } }]);
      await expect(requirements).rejects.toBeInstanceOf(ChainIdMismatchError);
    });

    test("checks account-data reads at the operation boundaries", async () => {
      const finalChain = Promise.withResolvers<number>();
      mockGetChainId
        .mockResolvedValueOnce(1)
        .mockImplementationOnce(() => finalChain.promise);

      const accountData = protocol.getAccountData();
      await vi.waitFor(() => expect(mockGetChainId).toHaveBeenCalledTimes(2));
      finalChain.resolve(1);

      await expect(accountData).resolves.toEqual(
        expect.objectContaining({
          vaultAddress: VAULT,
          marketId: new MarketParams(MARKET_PARAMS).id,
        }),
      );
      expect(mockGetChainId).toHaveBeenCalledTimes(2);
    });
  });

  describe("erc-4337 chain binding", () => {
    test("rejects a cached account chain before resolving entities", async () => {
      const erc4337Account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 8453,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      erc4337Account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      (erc4337Account as unknown as { _chainId: bigint | undefined })._chainId =
        1n;
      mockGetChainId.mockResolvedValue(8453);
      const erc4337Protocol = new MorphoProtocolEvm(erc4337Account, {
        chainId: 8453,
        borrowMarketParams: MARKET_PARAMS,
      });

      await expect(erc4337Protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      expect(blueMock).not.toHaveBeenCalled();
    });

    test("recovers when the provider returns to the configured chain", async () => {
      const erc4337Account = new WalletAccountEvmErc4337(SEED, "0'/0/0", {
        chainId: 1,
        provider: "https://dummy-rpc-url.com",
        bundlerUrl: "https://dummy-bundler-url.com",
        safeModulesVersion: "0.3.0",
        isSponsored: false,
        useNativeCoins: true,
      });
      erc4337Account.getAddress = vi.fn().mockResolvedValue(ADDRESS);
      (erc4337Account as unknown as { _chainId: bigint | undefined })._chainId =
        1n;
      const erc4337Protocol = new MorphoProtocolEvm(erc4337Account, {
        chainId: 1,
        borrowMarketParams: MARKET_PARAMS,
      });

      await erc4337Protocol.getMarketPosition();
      mockGetChainId.mockResolvedValue(8453);
      await expect(erc4337Protocol.getMarketPosition()).rejects.toBeInstanceOf(
        ChainIdMismatchError,
      );
      mockGetChainId.mockResolvedValue(1);
      await expect(erc4337Protocol.getMarketPosition()).resolves.toEqual(
        expect.objectContaining({ marketId: expect.any(String) }),
      );
    });
  });

  describe("read-only accounts", () => {
    test("error: MissingWalletProviderError", () => {
      const providerlessAccount = new WalletAccountEvm(SEED, "0'/0/0", {
        provider: [],
      });

      expect(() => new MorphoProtocolEvm(providerlessAccount)).toThrow(
        MissingWalletProviderError,
      );
    });

    test("should reject write methods", async () => {
      // biome-ignore lint/suspicious/noShadow: test-local account shadowing the suite default
      const account = new WalletAccountReadOnlyEvm(ADDRESS, {
        provider: "https://dummy-rpc-url.com",
      });
      // biome-ignore lint/suspicious/noShadow: test-local protocol shadowing the suite default
      const protocol = new MorphoProtocolEvm(account, {
        chainId: 1,
        earnVaultAddress: VAULT,
        borrowMarketParams: MARKET_PARAMS,
      });

      const prepared = await protocol.prepareSupply({
        token: TOKEN,
        amount: 100_000n,
      });
      await expect(prepared.submit()).rejects.toThrow(
        "The 'preparedSupply.submit()' method requires the protocol to be initialized with a non read-only account.",
      );
    });
  });
});
