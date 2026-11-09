import { addressesRegistry, UnknownTokenError } from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { expectFailClosed } from "@morpho-org/test/chaos";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Address,
  ContractFunctionRevertedError,
  ExecutionRevertedError,
  erc20Abi,
  getTypesForEIP712Domain,
  HttpRequestError,
  hashDomain,
  LimitExceededRpcError,
  maxUint256,
  RpcRequestError,
  type TypedData,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import { MalformedTokenMetadataError } from "../../errors.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  isRequirementApproval,
  isRequirementSignature,
  NegativeInputError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../types/index.js";
import { getBundlesTokenRequirements } from "./getBundlesTokenRequirements.js";

const account = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const ERC2612_NONCES_SELECTOR = "0x7ecebe00";

describe("getBundlesTokenRequirements", () => {
  test("DAI uses a direct allowance without probing nonces even when simple permits are enabled", async () => {
    const handle = createMockClient(mainnet);
    const token = addressesRegistry[mainnet.id].dai;
    const spender = addressesRegistry[mainnet.id].bundles.blueBundlesV1;
    mockRead(handle, {
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    expect(
      await getBundlesTokenRequirements(handle.client, {
        token,
        spender,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        useSimplePermit: true,
      }),
    ).toEqual([]);
    expect(
      handle.request.mock.calls
        .map(([call]) => call)
        .filter((call) => call.method === "eth_call"),
    ).toHaveLength(1);
  });
  const { usdc, permit2, bundles } = addressesRegistry[mainnet.id];
  if (permit2 == null || bundles?.blueBundlesV1 == null) {
    throw new Error("BlueBundlesV1 requirements are not registered");
  }
  const blueBundlesV1 = bundles.blueBundlesV1;
  test.each(
    [1_000_000n, maxUint256].flatMap((allowance) =>
      [undefined, true, false].map((useSimplePermit) => ({
        allowance,
        useSimplePermit,
      })),
    ),
  )(
    "reuses sufficient allowance $allowance without probing nonces with useSimplePermit=$useSimplePermit",
    async ({ allowance, useSimplePermit }) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        result: allowance,
      });
      expect(
        await getBundlesTokenRequirements(handle.client, {
          token: usdc,
          spender: blueBundlesV1,
          amount: 1_000_000n,
          owner: account.address,
          chainId: mainnet.id,
          deadline: maxUint256,
          supportSignature: true,
          useSimplePermit,
        }),
      ).toEqual([]);
      expect(
        expectReadCall(handle, {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
        }),
      ).toEqual([
        { functionName: "allowance", args: [account.address, blueBundlesV1] },
      ]);
      expect(
        handle.request.mock.calls.filter(
          ([call]) => call.method === "eth_call",
        ),
      ).toHaveLength(1);
    },
  );
  const rejectNonceProbeWithRevert = (
    handle: ReturnType<typeof createMockClient>,
  ) => {
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (
          tx?.to?.toLowerCase() === usdc.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === ERC2612_NONCES_SELECTOR
        )
          throw new ContractFunctionRevertedError({
            abi: erc2612Abi,
            functionName: "nonces",
          });
      }
      return base(call);
    });
  };

  test("[INV-05] rejects a client on another RPC chain before other requests", async () => {
    const handle = createMockClient(mainnet);
    handle.request.mockImplementation(async ({ method }) => {
      if (method === "eth_chainId") return "0x2105";
      throw new Error(`unexpected ${method}`);
    });

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1_000_000n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });

  test.each([
    { supportSignature: false, amount: 0n, allowance: 0n },
    { supportSignature: false, amount: 1n, allowance: 0n },
    { supportSignature: false, amount: 1n, allowance: maxUint256 },
    { supportSignature: true, amount: 1n, useSimplePermit: true },
    { supportSignature: true, amount: 1n, useSimplePermit: false },
  ])(
    "error: UnsupportedErc20ApprovalSpenderError before RPC reads (case %#)",
    async (options) => {
      for (const spender of [permit2, zeroAddress]) {
        const handle = createMockClient(mainnet);
        mockRead(handle, {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          result: options.allowance ?? 0n,
        });

        await expect(
          getBundlesTokenRequirements(handle.client, {
            token: usdc,
            spender,
            owner: account.address,
            chainId: mainnet.id,
            deadline: maxUint256,
            permit2Nonce: 0n,
            ...options,
          }),
        ).rejects.toBeInstanceOf(UnsupportedErc20ApprovalSpenderError);
        expect(handle.request).not.toHaveBeenCalled();
      }
    },
  );

  test("error: an overridden now rejects a live deadline before any RPC request", async () => {
    const handle = createMockClient(mainnet);
    // Live on the wall clock but already past the supplied `now`.
    const deadline = Time.timestamp() + Time.s.from.h(1n);
    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        owner: account.address,
        chainId: mainnet.id,
        deadline,
        now: deadline,
        supportSignature: false,
        amount: 1n,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("returns an unlimited direct approval when signatures are disabled", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1_000_000n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: false,
    });

    expect(requirements).toHaveLength(1);
    expect(isRequirementApproval(requirements[0])).toBe(true);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: maxUint256 },
    });

    // An existing allowance that already covers the pull must not emit an
    // approval, even when it is below the unlimited amount.
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 2_000_000n,
    });
    const coveredRequirements = await getBundlesTokenRequirements(
      handle.client,
      {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1_000_000n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );
    expect(coveredRequirements).toHaveLength(0);

    // When the existing allowance does not cover the pull, request the
    // unlimited approval.
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const reusableRequirements = await getBundlesTokenRequirements(
      handle.client,
      {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1_000_000n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      },
    );
    expect(reusableRequirements).toHaveLength(1);
    expect(reusableRequirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: maxUint256 },
    });
  });

  test("falls back from a failed ERC-2612 nonce probe to direct approval", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    rejectNonceProbeWithRevert(handle);

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: maxUint256,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      permit2Nonce: maxUint256 - 1n,
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1, amount: maxUint256 },
    });
  });

  // A token with a working nonces() probe but no name()/eip712Domain() must not
  // reject with MissingPermitDomainNameError: the documented simple-permit
  // fallback resolves direct approval instead.
  const mockMissingPermitDomain = (
    handle: ReturnType<typeof createMockClient>,
  ) => {
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    mockRead(handle, {
      address: usdc,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 0n,
    });
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "decimals",
      result: 6,
    });
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "symbol",
      result: "USDC",
    });
    handle.dispatch.set(`${usdc.toLowerCase()}|0x06fdde03`, "0x");
    handle.dispatch.set(`${usdc.toLowerCase()}|0x84b0196e`, "0x");
  };

  test("error: a 429 on nonces() propagates", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (
          tx?.to?.toLowerCase() === usdc.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === ERC2612_NONCES_SELECTOR
        )
          throw new LimitExceededRpcError(new Error("request rate limited"));
      }
      return base(call);
    });

    await expectFailClosed(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        useSimplePermit: true,
        supportDeployless: false,
      }),
      "infra",
    );
  });

  test("error: a non-revert JSON-RPC error on nonces() rejects without Permit2 fallback", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (
          tx?.to?.toLowerCase() === usdc.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === ERC2612_NONCES_SELECTOR
        )
          throw new RpcRequestError({
            body: {},
            url: "http://rpc.test",
            error: { code: -32000, message: "header not found" },
          });
      }
      return base(call);
    });

    const error = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    let cause: unknown = error;
    while (cause instanceof Error && !(cause instanceof RpcRequestError))
      cause = cause.cause;
    expect(cause).toBeInstanceOf(RpcRequestError);
    if (cause instanceof RpcRequestError) expect(cause.code).toBe(-32000);
  });

  test("behavior: a reverting nonces() probe falls back to direct approval", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    rejectNonceProbeWithRevert(handle);

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1 },
    });
  });

  test("behavior: undecodable nonces() return data falls back to direct approval", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    handle.dispatch.set(
      `${usdc.toLowerCase()}|${ERC2612_NONCES_SELECTOR}`,
      "0x12",
    );

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    });
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1 },
    });
  });

  // A working nonces() probe with a garbled eip712Domain() result is a token
  // defect, not a missing domain: it must not fall back to Permit2.
  test("error: a malformed eip712Domain() result rejects", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    handle.dispatch.set(`${usdc.toLowerCase()}|0x84b0196e`, "0xdeadbeef");

    const error = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(MalformedTokenMetadataError);
  });

  test("error: an HTTP 503 body saying execution reverted on nonces() propagates", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (
          tx?.to?.toLowerCase() === usdc.toLowerCase() &&
          tx?.data?.slice(0, 10).toLowerCase() === ERC2612_NONCES_SELECTOR
        )
          // The shape viem produces for a non-200 reply whose JSON-RPC error
          // body says "execution reverted": the message is stringified into
          // HttpRequestError.details and getNodeError wraps it in
          // ExecutionRevertedError, but it is still a transport failure.
          throw new ExecutionRevertedError({
            cause: new HttpRequestError({
              status: 503,
              url: "http://rpc.test",
            }),
          });
      }
      return base(call);
    });

    const error = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    }).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    let cause: unknown = error;
    while (cause instanceof Error && !(cause instanceof HttpRequestError))
      cause = cause.cause;
    expect(cause).toBeInstanceOf(HttpRequestError);
    if (cause instanceof HttpRequestError) expect(cause.status).toBe(503);
  });

  test("behavior: a token without a permit domain falls back to direct approval", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline: maxUint256,
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1 },
    });
  });

  test("behavior: an overridden now lets an approval fallback outlive the wall clock", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    mockRead(handle, {
      address: usdc,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    // Expired on the wall clock but live at the supplied `now`: the signature
    // encoder must honour the same override as the resolver's deadline check.
    const deadline = Time.timestamp() - Time.s.from.h(1n);
    const requirements = await getBundlesTokenRequirements(handle.client, {
      token: usdc,
      spender: blueBundlesV1,
      amount: 1n,
      owner: account.address,
      chainId: mainnet.id,
      deadline,
      now: deadline - Time.s.from.h(1n),
      supportSignature: true,
      useSimplePermit: true,
      supportDeployless: false,
      permit2Nonce: 0n,
    });

    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.action).toMatchObject({
      type: "erc20Approval",
      args: { spender: blueBundlesV1 },
    });
  });

  test.each([
    "revert",
    "mismatch",
    "matching",
    "wrong chain",
    "wrong token",
    "extensions",
    "transport",
  ])(
    "checks the token permit domain before selecting ERC-2612: %s",
    async (scenario) => {
      const handle = createMockClient(mainnet);
      mockMissingPermitDomain(handle);
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "name",
        result: "USD Coin",
      });
      const domain = {
        name: "USD Coin",
        version: "2",
        chainId: mainnet.id,
        verifyingContract: usdc,
      };
      if (["wrong chain", "wrong token", "extensions"].includes(scenario))
        mockRead(handle, {
          address: usdc,
          abi: erc5267Abi,
          functionName: "eip712Domain",
          result: [
            "0x0f",
            "USD Coin",
            "2",
            scenario === "wrong chain" ? 8453n : BigInt(mainnet.id),
            scenario === "wrong token" ? zeroAddress : usdc,
            `0x${"00".repeat(32)}`,
            scenario === "extensions" ? [1n] : [],
          ],
        });
      mockRead(handle, {
        address: usdc,
        abi: erc2612Abi,
        functionName: "DOMAIN_SEPARATOR",
        result:
          scenario === "mismatch"
            ? `0x${"00".repeat(32)}`
            : hashDomain<TypedData>({
                domain,
                types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
              }),
      });
      if (scenario === "revert" || scenario === "transport") {
        const base = handle.request.getMockImplementation()!;
        handle.request.mockImplementation(async (call) => {
          if (call.method === "eth_call") {
            const [tx] = (call.params ?? []) as [{ data?: string }];
            if (tx?.data?.startsWith("0x3644e515")) {
              if (scenario === "transport")
                throw new HttpRequestError({
                  status: 503,
                  url: "http://rpc.test",
                });
              throw new ContractFunctionRevertedError({
                abi: erc2612Abi,
                functionName: "DOMAIN_SEPARATOR",
              });
            }
          }
          return base(call);
        });
      }
      const result = getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        supportDeployless: false,
      });
      if (scenario === "transport") {
        await expectFailClosed(result, "infra");
        return;
      }
      expect((await result).map(({ action }) => action.type)).toEqual([
        scenario === "matching" ? "permit" : "erc20Approval",
      ]);
      expect(
        expectReadCall(handle, {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
        }),
      ).toHaveLength(1);
      if (["matching", "mismatch"].includes(scenario))
        expect(
          expectReadCall(handle, {
            address: usdc,
            abi: erc2612Abi,
            functionName: "DOMAIN_SEPARATOR",
          }),
        ).toHaveLength(1);
    },
  );

  test.each([undefined, true, false])(
    "behavior: a working permit domain with useSimplePermit=%s honours the selection and overridden now",
    async (useSimplePermit) => {
      const handle = createMockClient(mainnet);
      mockRead(handle, {
        address: usdc,
        abi: erc2612Abi,
        functionName: "nonces",
        result: 0n,
      });
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "decimals",
        result: 6,
      });
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "symbol",
        result: "USDC",
      });
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "name",
        result: "USD Coin",
      });
      const domain = {
        name: "USD Coin",
        version: "2",
        chainId: mainnet.id,
        verifyingContract: usdc,
      };
      mockRead(handle, {
        address: usdc,
        abi: erc2612Abi,
        functionName: "DOMAIN_SEPARATOR",
        result: hashDomain<TypedData>({
          domain,
          types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
        }),
      });
      mockRead(handle, {
        address: usdc,
        abi: erc5267Abi,
        functionName: "eip712Domain",
        result: [
          "0x0f",
          "USD Coin",
          "2",
          BigInt(mainnet.id),
          usdc,
          `0x${"00".repeat(32)}`,
          [],
        ],
      });

      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      // Expired on the wall clock but live at the supplied `now`: the ERC-2612
      // branch must honour the same override and return a `permit`, not Permit2.
      const deadline = Time.timestamp() - Time.s.from.h(1n);
      const requirements = await getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline,
        now: deadline - Time.s.from.h(1n),
        supportSignature: true,
        useSimplePermit,
        supportDeployless: false,
      });

      if (useSimplePermit === false) {
        expect(requirements).toHaveLength(1);
        expect(requirements[0]?.action).toMatchObject({
          type: "erc20Approval",
          args: { spender: blueBundlesV1 },
        });
        expect(
          expectReadCall(handle, {
            address: usdc,
            abi: erc20Abi,
            functionName: "allowance",
          }),
        ).toEqual([
          { functionName: "allowance", args: [account.address, blueBundlesV1] },
        ]);
        expect(
          handle.request.mock.calls.filter(
            ([call]) => call.method === "eth_call",
          ),
        ).toHaveLength(1);
        return;
      }

      const signatureRequirement = requirements.at(-1);
      if (!isRequirementSignature(signatureRequirement)) {
        throw new Error("permit requirement is missing");
      }
      expect(signatureRequirement.action.type).toBe("permit");
    },
  );

  test("error: a token without a permit domain and reverting decimals() rejects with UnknownTokenError", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    handle.dispatch.set(`${usdc.toLowerCase()}|0x313ce567`, "0x");

    const error = await expectFailClosed(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        useSimplePermit: true,
        supportDeployless: false,
        permit2Nonce: 0n,
      }),
      "config",
    );
    expect(error).toBeInstanceOf(UnknownTokenError);
  });

  test("error: a 429 on name() still rejects as infra", async () => {
    const handle = createMockClient(mainnet);
    mockMissingPermitDomain(handle);
    const base = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (call) => {
      if (call.method === "eth_call") {
        const [tx] = (call.params ?? []) as [{ to?: Address; data?: string }];
        if (tx?.data?.slice(0, 10).toLowerCase() === "0x06fdde03")
          throw new LimitExceededRpcError(new Error("request rate limited"));
      }
      return base(call);
    });

    await expectFailClosed(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        useSimplePermit: true,
        supportDeployless: false,
        permit2Nonce: 0n,
      }),
      "infra",
    );
  });

  test.each([undefined, -1n, maxUint256 + 1n])(
    "returns a direct approval without Permit2 reads, ignoring legacy nonce %s",
    async (permit2Nonce) => {
      const handle = createMockClient(mainnet);
      rejectNonceProbeWithRevert(handle);
      mockRead(handle, {
        address: usdc,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
      const requirements = await getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: true,
        permit2Nonce,
      });
      expect(requirements).toHaveLength(1);
      expect(requirements[0]?.action).toMatchObject({
        type: "erc20Approval",
        args: { spender: blueBundlesV1, amount: maxUint256 },
      });
      expect(
        expectReadCall(handle, {
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
        }),
      ).toEqual([
        { functionName: "allowance", args: [account.address, blueBundlesV1] },
      ]);
      expect(
        handle.request.mock.calls
          .map(([call]) => call)
          .filter((call) => call.method === "eth_call")
          .every(
            (call) =>
              (
                call.params?.[0] as { to?: string } | undefined
              )?.to?.toLowerCase() === usdc.toLowerCase(),
          ),
      ).toBe(true);
      expect(
        handle.request.mock.calls
          .map(([call]) => call)
          .some(
            (call) =>
              call.params?.[0] != null &&
              JSON.stringify(call.params[0])
                .toLowerCase()
                .includes(permit2.toLowerCase()),
          ),
      ).toBe(false);
    },
  );

  test("rejects invalid amounts", async () => {
    const handle = createMockClient(mainnet);
    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: -1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NegativeInputError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: 0n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(NonPositiveInputError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: maxUint256 + 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: maxUint256 + 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);

    await expect(
      getBundlesTokenRequirements(handle.client, {
        token: usdc,
        spender: blueBundlesV1,
        amount: 1n,
        owner: account.address,
        chainId: mainnet.id,
        deadline: 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });
});
