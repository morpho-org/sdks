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
  test("error: redeem re-checks the deadline before returning cached requirements", async () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(1n);
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV2(IN_KIND_VAULT, mainnet.id);
    const vaultData = withChainTimestamp(now, () => inKindVaultV2Data());
    vi.spyOn(vault, "getData").mockResolvedValue(vaultData);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const redemption = withChainTimestamp(now, () =>
      vault.redeem({ shares: 10n, userAddress: IN_KIND_USER, deadline }),
    );

    const requirements = await withChainTimestamp(now, () =>
      redemption.getRequirements(),
    );

    expect(requirements).toHaveLength(1);
    await expect(
      withChainTimestamp(deadline + 1n, () => redemption.getRequirements()),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });
});
