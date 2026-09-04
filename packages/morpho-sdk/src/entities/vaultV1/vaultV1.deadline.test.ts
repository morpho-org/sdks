import { Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createPublicClient, erc20Abi, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { ExpiredDeadlineError } from "../../types/index.js";

describe("MorphoVaultV1 bundles deadlines", () => {
  test("behavior: deposit forecasts share price through a deadline beyond two hours", () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(3n);
    const vaultData = withChainTimestamp(now, () => inKindVaultV1Data());
    const accrueInterest = vi.spyOn(vaultData, "accrueInterest");
    const vault = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    })
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    withChainTimestamp(now, () =>
      vault.deposit({
        amount: 100n,
        userAddress: IN_KIND_USER,
        vaultData,
        deadline,
      }),
    );

    expect(accrueInterest).toHaveBeenCalledWith(deadline);
  });

  test("error: withdrawal requirement resolution expires with its deadline", async () => {
    const now = Time.timestamp();
    const deadline = now + Time.s.from.h(1n);
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    vi.spyOn(vault, "getData").mockResolvedValue(
      withChainTimestamp(now, () => inKindVaultV1Data()),
    );
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });

    const withdraw = vault.withdraw({
      amount: 100n,
      userAddress: IN_KIND_USER,
      deadline,
    });

    expect(await withdraw.getRequirements()).toHaveLength(1);
    await expect(
      withChainTimestamp(deadline + 1n, () => withdraw.getRequirements()),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });
});
