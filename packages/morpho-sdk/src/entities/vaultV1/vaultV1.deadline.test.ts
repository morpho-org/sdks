import { Time } from "@morpho-org/morpho-ts";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";

const TARGET_VAULT = "0x0000000000000000000000000000000000001012";

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

  test("behavior: migration forecasts its destination through a deadline beyond two hours", () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(3n);
    const sourceVault = withChainTimestamp(now, () => inKindVaultV1Data());
    const targetVault = withChainTimestamp(now, () =>
      inKindVaultV2Data({ address: TARGET_VAULT }),
    );
    const accrueInterest = vi.spyOn(targetVault, "accrueInterest");
    const vault = createPublicClient({
      chain: mainnet,
      transport: http("https://rpc.example"),
    })
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);

    withChainTimestamp(now, () =>
      vault.migrateToV2({
        assets: 100n,
        sourceVault,
        targetVault,
        userAddress: IN_KIND_USER,
        deadline,
      }),
    );

    expect(accrueInterest).toHaveBeenCalledWith(deadline);
  });
});
