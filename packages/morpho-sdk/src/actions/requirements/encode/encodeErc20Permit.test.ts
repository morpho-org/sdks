import { addressesRegistry } from "@morpho-org/blue-sdk";
import {
  erc5267Abi,
  MissingPermitDomainNameError,
} from "@morpho-org/blue-sdk-viem";
import { Time } from "@morpho-org/morpho-ts";
import { expectFailClosed } from "@morpho-org/test/chaos";
import {
  type Address,
  createClient,
  encodeFunctionResult,
  erc20Abi,
  http,
  isHex,
  maxUint256,
  verifyTypedData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signTypedData } from "viem/actions";
import { mainnet } from "viem/chains";
import { afterEach, describe, expect, vi } from "vitest";
import { test } from "../../../../test/unit.js";
import {
  AddressMismatchError,
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NonPositiveInputError,
  UnsupportedErc20ApprovalSpenderError,
} from "../../../types/index.js";
import { encodeErc20Permit } from "./encodeErc20Permit.js";

describe("encodeErc20Permit", () => {
  const { usdc } = addressesRegistry[mainnet.id];
  const blueBundlesV1 = addressesRegistry[mainnet.id].bundles?.blueBundlesV1;
  if (blueBundlesV1 == null) throw new Error("BlueBundlesV1 is not registered");

  const mockAmount = 1000000n;
  const mockNonce = 0n;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const rpcResult = (id: number, result: string) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const erc20Result = (
    functionName: "decimals" | "symbol" | "name",
    result: unknown,
  ) =>
    encodeFunctionResult({
      abi: erc20Abi,
      functionName,
      result,
    } as never);

  const httpClient = () =>
    createClient({
      chain: mainnet,
      transport: http("http://localhost/rpc", { retryCount: 0 }),
    });

  // viem batches concurrent JSON-RPC calls into one array body; a non-200
  // reply faults the whole request, like the real transports.
  const stubJsonRpc = (
    handle: (call: {
      method: string;
      id: number;
      params?: unknown[];
    }) => Response,
  ) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (_url, init) => {
      const parsed = JSON.parse(String(init?.body));
      const calls: {
        method: string;
        id: number;
        params?: unknown[];
      }[] = Array.isArray(parsed) ? parsed : [parsed];
      const responses = calls.map(handle);
      const failed = responses.find((response) => response.status !== 200);
      if (failed != null || !Array.isArray(parsed))
        return failed ?? responses[0]!;
      return new Response(
        JSON.stringify(await Promise.all(responses.map((r) => r.json()))),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
  };

  // Sequential: the tests stub the global fetch; a shared stub would race.
  describe.sequential("chaos: S6 token metadata", () => {
    test.each(["0x06fdde03", "0x84b0196e"])(
      "error: a 429 on selector %s propagates as infra with no Requirement",
      async (faultSelector) => {
        let faultedCalls = 0;
        stubJsonRpc((body) => {
          if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
          const [tx] = (body.params ?? []) as [{ to?: Address; data?: string }];
          const selector = String(tx?.data).slice(0, 10).toLowerCase();
          if (selector === faultSelector) {
            faultedCalls += 1;
            return new Response("rate limited", { status: 429 });
          }
          if (selector === "0x313ce567")
            return rpcResult(body.id, erc20Result("decimals", 6));
          if (selector === "0x95d89b41")
            return rpcResult(body.id, erc20Result("symbol", "USDC"));
          if (selector === "0x06fdde03")
            return rpcResult(body.id, erc20Result("name", "USD Coin"));
          if (selector === "0x84b0196e")
            return rpcResult(
              body.id,
              encodeFunctionResult({
                abi: erc5267Abi,
                functionName: "eip712Domain",
                result: [
                  "0x0f",
                  "USD Coin",
                  "2",
                  1n,
                  usdc,
                  `0x${"00".repeat(32)}`,
                  [],
                ],
              }),
            );
          return new Response(`unhandled ${selector}`, { status: 500 });
        });

        const error = await expectFailClosed(
          encodeErc20Permit(httpClient(), {
            token: usdc,
            owner: "0x0000000000000000000000000000000000000001" as Address,
            spender: blueBundlesV1,
            amount: mockAmount,
            chainId: mainnet.id,
            nonce: mockNonce,
            supportDeployless: false,
          }),
          "infra",
        );
        expect(error).not.toBeInstanceOf(MissingPermitDomainNameError);
        expect(faultedCalls).toBe(1);
      },
    );

    test("error: a 429 on name() propagates as infra through the deployless fallback", async () => {
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        const [tx] = (body.params ?? []) as [{ to?: Address; data?: string }];
        const selector = String(tx?.data).slice(0, 10).toLowerCase();
        if (tx?.to == null || selector === "0x06fdde03")
          return new Response("rate limited", { status: 429 });
        if (selector === "0x313ce567")
          return rpcResult(body.id, erc20Result("decimals", 6));
        if (selector === "0x95d89b41")
          return rpcResult(body.id, erc20Result("symbol", "USDC"));
        if (selector === "0x84b0196e")
          return rpcResult(
            body.id,
            encodeFunctionResult({
              abi: erc5267Abi,
              functionName: "eip712Domain",
              result: [
                "0x0f",
                "USD Coin",
                "2",
                1n,
                usdc,
                `0x${"00".repeat(32)}`,
                [],
              ],
            }),
          );
        return new Response(`unhandled ${selector}`, { status: 500 });
      });

      await expectFailClosed(
        encodeErc20Permit(httpClient(), {
          token: usdc,
          owner: "0x0000000000000000000000000000000000000001" as Address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          supportDeployless: true,
        }),
        "infra",
      );
    });

    test("error: a token without name() or eip712Domain() rejects with MissingPermitDomainNameError", async () => {
      stubJsonRpc((body) => {
        if (body.method === "eth_chainId") return rpcResult(body.id, "0x1");
        const [tx] = (body.params ?? []) as [{ to?: Address; data?: string }];
        const selector = String(tx?.data).slice(0, 10).toLowerCase();
        if (selector === "0x313ce567")
          return rpcResult(body.id, erc20Result("decimals", 6));
        if (selector === "0x95d89b41")
          return rpcResult(body.id, erc20Result("symbol", "USDC"));
        return rpcResult(body.id, "0x");
      });

      const error = await expectFailClosed(
        encodeErc20Permit(httpClient(), {
          token: usdc,
          owner: "0x0000000000000000000000000000000000000001" as Address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          supportDeployless: false,
        }),
        "config",
      );
      expect(error).toBeInstanceOf(MissingPermitDomainNameError);
    });
  });

  describe("sign", () => {
    test("should throw ChainIdMismatchError when client chain does not match", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id + 1,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(ChainIdMismatchError);
    });

    test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
      const methods: string[] = [];
      vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as
          | { id: number; method: string }
          | { id: number; method: string }[];
        const calls = Array.isArray(body) ? body : [body];
        methods.push(...calls.map(({ method }) => method));
        const [call] = calls;
        if (calls.length === 1 && call?.method === "eth_chainId")
          return rpcResult(call.id, "0x2105");
        return new Response("unexpected request", { status: 500 });
      });

      await expect(
        encodeErc20Permit(httpClient(), {
          token: usdc,
          owner: "0x0000000000000000000000000000000000000001" as Address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          supportDeployless: false,
        }),
      ).rejects.toBeInstanceOf(ChainIdMismatchError);
      expect(methods).toEqual(["eth_chainId"]);
    });

    test("should throw UnsupportedErc20ApprovalSpenderError when spender is not supported", async ({
      client,
    }) => {
      const spender = "0x0000000000000000000000000000000000000001" as Address;

      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
        }),
      ).rejects.toThrow(UnsupportedErc20ApprovalSpenderError);
    });

    test("should throw NonPositiveInputError when explicit deadline is not positive", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: 0n,
        }),
      ).rejects.toThrow(NonPositiveInputError);
    });

    test("should throw InputExceedsMaxError when explicit deadline exceeds uint256", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: maxUint256 + 1n,
        }),
      ).rejects.toThrow(InputExceedsMaxError);
    });

    test("should throw ExpiredDeadlineError when explicit deadline is already elapsed", async ({
      client,
    }) => {
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline: 1n,
        }),
      ).rejects.toThrow(ExpiredDeadlineError);
    });

    test("behavior: a deadline that has passed on the wall clock is accepted with an earlier now", async ({
      client,
    }) => {
      const deadline = Time.timestamp() - Time.s.from.h(1n);
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
        deadline,
        now: deadline - 1n,
      });

      expect(permit.action.type).toBe("permit");
    });

    test("error: ExpiredDeadlineError when a deadline still live on the wall clock is passed a later now", async ({
      client,
    }) => {
      const deadline = Time.timestamp() + Time.s.from.h(1n);
      await expect(
        encodeErc20Permit(client, {
          token: usdc,
          owner: client.account.address,
          spender: blueBundlesV1,
          amount: mockAmount,
          chainId: mainnet.id,
          nonce: mockNonce,
          deadline,
          now: deadline + 1n,
        }),
      ).rejects.toThrow(ExpiredDeadlineError);
    });

    test("should sign permit for non-DAI token", async ({ client }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(isHex(signatureRequirement.args.signature)).toBe(true);
      expect(signatureRequirement.args.signature.length).toBe(132);
    });

    test("should throw error if client account address does not match user address", async ({
      client,
    }) => {
      const differentAddress =
        "0x0000000000000000000000000000000000000001" as Address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      await expect(
        permit.sign(client, differentAddress),
      ).rejects.toBeInstanceOf(AddressMismatchError);
    });

    test("should throw InvalidSignatureError when signature verification fails", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const wrongSigner = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000002",
      );
      const invalidSignatureClient = {
        ...client,
        account: {
          ...wrongSigner,
          address: userAddress,
        },
      };
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      await expect(
        permit.sign(invalidSignatureClient, userAddress),
      ).rejects.toThrow(InvalidSignatureError);
    });

    test("should return all expected properties in signature args", async ({
      client,
    }) => {
      const userAddress = client.account.address;

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      expect(signatureRequirement.args).toHaveProperty("owner");
      expect(signatureRequirement.args).toHaveProperty("signature");
      expect(signatureRequirement.args).toHaveProperty("deadline");
      expect(signatureRequirement.args).toHaveProperty("amount");
      expect(signatureRequirement.args).toHaveProperty("asset");
      expect(signatureRequirement.args).toHaveProperty("nonce");
      expect(signatureRequirement.args.owner).toEqual(userAddress);
      expect(signatureRequirement.args.amount).toEqual(mockAmount);
      expect(signatureRequirement.args.asset).toEqual(usdc);
      expect(signatureRequirement.args.nonce).toEqual(mockNonce);
    });

    test("should set deadline to approximately 2 hours in the future", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const now = Time.timestamp();

      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const signatureRequirement = await permit.sign(client, userAddress);

      // Deadline should be approximately 2 hours (7200 seconds) in the future
      // Allow 5 seconds tolerance for test execution time
      const expectedDeadline = now + 7200n;
      const tolerance = 5n;

      expect(signatureRequirement.args.deadline).toBeGreaterThan(now);
      expect(signatureRequirement.args.deadline).toBeGreaterThanOrEqual(
        expectedDeadline - tolerance,
      );
      expect(signatureRequirement.args.deadline).toBeLessThanOrEqual(
        expectedDeadline + tolerance,
      );
    });

    test("should have correct action structure", async ({ client }) => {
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      expect(permit.action.type).toBe("permit");
      expect(permit.action.args).toHaveProperty("spender");
      expect(permit.action.args).toHaveProperty("amount");
      expect(permit.action.args).toHaveProperty("deadline");
      expect(permit.action.args.spender).toEqual(blueBundlesV1);
      expect(permit.action.args.amount).toEqual(mockAmount);
    });
  });

  describe("action.typedData", () => {
    test("default", async ({ client }) => {
      const userAddress = client.account.address;
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const typedData = permit.action.typedData;

      expect(typedData.primaryType).toBe("Permit");
      expect(typedData.domain).toMatchObject({
        chainId: mainnet.id,
        verifyingContract: usdc,
      });
      expect(typedData.message).toMatchObject({
        owner: userAddress,
        spender: blueBundlesV1,
        value: mockAmount,
        nonce: mockNonce,
      });
      expect(Object.isFrozen(typedData)).toBe(true);
      expect(Object.isFrozen(typedData.message)).toBe(true);
      expect(Object.isFrozen(typedData.domain)).toBe(true);
    });

    test("behavior: signing action.typedData externally matches sign()", async ({
      client,
    }) => {
      const userAddress = client.account.address;
      const permit = await encodeErc20Permit(client, {
        token: usdc,
        owner: client.account.address,
        spender: blueBundlesV1,
        amount: mockAmount,
        chainId: mainnet.id,
        nonce: mockNonce,
      });

      const typedData = permit.action.typedData;
      const externalSignature = await signTypedData(client, {
        ...typedData,
        account: client.account,
      });
      const signed = await permit.sign(client, userAddress);

      expect(externalSignature).toEqual(signed.args.signature);
      expect(
        await verifyTypedData({
          ...typedData,
          address: userAddress,
          signature: externalSignature,
        }),
      ).toBe(true);
    });
  });
});
