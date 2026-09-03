import { Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { ExpiredDeadlineError } from "../../types/index.js";

describe("MorphoVaultV2 bundles deadlines", () => {
  test("error: cached withdrawal requirements expire with their deadline", async () => {
    const now = Time.timestamp();
    const deadline = now + Time.s.from.h(1n);
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    vi.spyOn(vault, "getData").mockResolvedValue(
      withChainTimestamp(now, () => inKindVaultV2Data()),
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
