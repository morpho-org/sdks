import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { morphoViemExtension } from "../../client/index.js";
import { isRequirementApproval } from "../../types/index.js";

const amount = 100n;
const ALLOWANCE_SELECTOR = "0xdd62ed3e"; // allowance(address,address)

const countAllowanceReads = (
  handle: ReturnType<typeof createMockClient>,
): number =>
  handle.request.mock.calls.filter(([call]) => {
    if (call.method !== "eth_call") return false;
    const [request] = (call.params ?? []) as readonly [{ data?: string }];
    return request?.data?.startsWith(ALLOWANCE_SELECTOR) === true;
  }).length;

const prepareDeposit = (handle: ReturnType<typeof createMockClient>) =>
  handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV1(IN_KIND_VAULT, mainnet.id)
    .deposit({
      amount,
      userAddress: IN_KIND_USER,
      vaultData: inKindVaultV1Data(),
    });

describe("MorphoVaultV1 deposit getRequirements", () => {
  test("behavior: concurrent callers share one requirement resolution", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const deposit = prepareDeposit(handle);

    const [first, second] = await Promise.all([
      deposit.getRequirements(),
      deposit.getRequirements(),
    ]);

    // One shared in-flight promise. A second concurrent resolution would overwrite
    // the captured requirement, making `buildTx()` reject the other caller's signature.
    expect(countAllowanceReads(handle)).toBe(1);
    expect(second).toBe(first);
    expect(
      first.filter(isRequirementApproval).map(({ action }) => action.args),
    ).toEqual([
      {
        spender: getChainAddress(mainnet.id, "bundles.vaultBundlesV1"),
        amount,
      },
    ]);
  });

  test("behavior: a failed resolution is not cached", async () => {
    const handle = createMockClient(mainnet);
    const deposit = prepareDeposit(handle);

    // No allowance mock registered yet, so the first resolution fails.
    await expect(deposit.getRequirements()).rejects.toThrow();

    mockRead(handle, {
      address: IN_KIND_ASSET,
      abi: erc20Abi,
      functionName: "allowance",
      result: amount,
    });

    expect(await deposit.getRequirements()).toEqual([]);
  });
});
