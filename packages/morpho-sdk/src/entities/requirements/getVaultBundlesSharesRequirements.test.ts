import type { AccrualVault } from "@morpho-org/blue-sdk";
import { Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createPublicClient, erc20Abi, http, maxUint256 } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "./getVaultBundlesSharesRequirements.js";

const answerWrongChain = (handle: ReturnType<typeof createMockClient>) =>
  handle.request.mockImplementation(async ({ method }) => {
    if (method === "eth_chainId") return "0x2105";
    throw new Error(`unexpected ${method}`);
  });

const owner = "0x0000000000000000000000000000000000000001" as const;
const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
// Only `address` and `name` are read on this path; the full accrual snapshot would hide them.
const vaultData = new Token({
  address: "0x0000000000000000000000000000000000002001",
  name: "Vault V1",
}) as unknown as AccrualVault;

const requiredShareAllowance = 1_000n;

const mockAllowance = (
  handle: ReturnType<typeof createMockClient<typeof mainnet>>,
  allowance: bigint,
) =>
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });

const resolve = (
  handle: ReturnType<typeof createMockClient<typeof mainnet>>,
  supportSignature: boolean,
) =>
  getVaultBundlesSharesRequirements(handle.client, {
    vaultData,
    version: "vaultV1",
    owner,
    chainId: mainnet.id,
    requiredShareAllowance: requiredShareAllowance,
    deadline: Time.timestamp() + Time.s.from.h(1n),
    supportSignature,
  });

describe("getVaultBundlesSharesRequirements", () => {
  test("default: no requirement when the allowance meets the required amount", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance);

    await expect(resolve(handle, false)).resolves.toEqual([]);
  });

  test("error: an overridden now rejects a live deadline before any RPC request", async () => {
    const handle = createMockClient(mainnet);
    // Live on the wall clock but already past the supplied `now`.
    const deadline = Time.timestamp() + Time.s.from.h(1n);
    await expect(
      getVaultBundlesSharesRequirements(handle.client, {
        vaultData,
        version: "vaultV1",
        owner,
        chainId: mainnet.id,
        requiredShareAllowance,
        deadline,
        now: deadline,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test.each([requiredShareAllowance + 1n, maxUint256])(
    "behavior: no requirement when the allowance %s exceeds the required amount",
    async (allowance) => {
      const handle = createMockClient(mainnet);
      mockAllowance(handle, allowance);

      await expect(resolve(handle, false)).resolves.toEqual([]);
    },
  );

  test("behavior: requests an unlimited approval when the allowance is below the cap", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance - 1n);

    const [approval] = await resolve(handle, false);

    expect(approval?.action).toMatchObject({
      type: "erc20Approval",
      args: { amount: maxUint256 },
    });
  });

  test("behavior: accepts a larger allowance even with signature support", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance + 1n);

    await expect(resolve(handle, true)).resolves.toEqual([]);
  });

  test("behavior: requests an unlimited permit when the allowance is below the cap", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance - 1n);
    mockRead(handle, {
      address: vaultData.address,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    });

    const [permit] = await resolve(handle, true);

    expect(permit?.action).toMatchObject({
      type: "permit",
      args: { spender, amount: maxUint256, nonce: 7n },
    });
  });

  test("behavior: an overridden now lets a signature path outlive the wall clock", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance - 1n);
    mockRead(handle, {
      address: vaultData.address,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    });

    // Expired on the wall clock but live at the supplied `now`: the permit
    // encoder must honour the same override as the resolver's deadline check.
    const deadline = Time.timestamp() - Time.s.from.h(1n);
    const [permit] = await getVaultBundlesSharesRequirements(handle.client, {
      vaultData,
      version: "vaultV1",
      owner,
      chainId: mainnet.id,
      requiredShareAllowance,
      deadline,
      now: deadline - Time.s.from.h(1n),
      supportSignature: true,
    });

    expect(permit?.action).toMatchObject({
      type: "permit",
      args: { spender, amount: maxUint256, nonce: 7n },
    });
  });

  test("error: ExpiredDeadlineError before reading an allowance", async () => {
    const handle = createMockClient(mainnet);

    await expect(
      getVaultBundlesSharesRequirements(handle.client, {
        vaultData,
        version: "vaultV1",
        owner,
        chainId: mainnet.id,
        requiredShareAllowance: requiredShareAllowance,
        deadline: 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
    expect(handle.request).not.toHaveBeenCalled();
  });

  test("[INV-05] error: ChainIdMismatchError before reading an allowance", async () => {
    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    });

    await expect(
      getVaultBundlesSharesRequirements(client, {
        vaultData: {} as never,
        version: "vaultV1",
        owner,
        chainId: base.id,
        requiredShareAllowance: 1n,
        deadline: 1n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
  test("[INV-05] error: ChainIdMismatchError when the RPC reports another chain via eth_chainId", async () => {
    const handle = createMockClient(mainnet);
    answerWrongChain(handle);
    await expect(
      getVaultBundlesSharesRequirements(handle.client, {
        vaultData,
        version: "vaultV1",
        owner,
        chainId: mainnet.id,
        requiredShareAllowance,
        deadline: 2n ** 64n,
        supportSignature: false,
      }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(handle.request.mock.calls.map(([{ method }]) => method)).toEqual([
      "eth_chainId",
    ]);
  });
});
