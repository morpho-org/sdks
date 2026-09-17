import type { AccrualVault } from "@morpho-org/blue-sdk";
import { Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createPublicClient, erc20Abi, http } from "viem";
import { base, mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
} from "../../types/index.js";
import { getVaultBundlesSharesRequirements } from "./getVaultBundlesSharesRequirements.js";

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
  test("default: no requirement when the allowance already equals the cap", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance);

    await expect(resolve(handle, false)).resolves.toEqual([]);
  });

  test("behavior: replaces an oversized allowance with an exact approval", async () => {
    const handle = createMockClient(mainnet);
    // A prior unlimited approval would otherwise cap the burn far above the slippage-derived cap.
    mockAllowance(handle, 2n ** 256n - 1n);

    const [approval] = await resolve(handle, false);

    expect(approval?.action).toEqual({
      type: "erc20Approval",
      args: { spender, amount: requiredShareAllowance },
    });
    expect(approval).toMatchObject({ to: vaultData.address });
  });

  test("behavior: approves the exact cap when the allowance is below it", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, requiredShareAllowance - 1n);

    const [approval] = await resolve(handle, false);

    expect(approval?.action).toMatchObject({
      type: "erc20Approval",
      args: { amount: requiredShareAllowance },
    });
  });

  test("behavior: requests an exact permit over an oversized allowance", async () => {
    const handle = createMockClient(mainnet);
    mockAllowance(handle, 2n ** 256n - 1n);
    mockRead(handle, {
      address: vaultData.address,
      abi: erc2612Abi,
      functionName: "nonces",
      result: 7n,
    });

    const [permit] = await resolve(handle, true);

    expect(permit?.action).toMatchObject({
      type: "permit",
      args: { spender, amount: requiredShareAllowance, nonce: 7n },
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
  });

  test("error: ChainIdMismatchError before reading an allowance", async () => {
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
});
