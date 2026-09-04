import { Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { createPublicClient, erc20Abi, http } from "viem";
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
import { ExpiredDeadlineError } from "../../types/index.js";

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

  test("error: cached withdrawal requirements expire with their deadline", async () => {
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

  test("error: redeem re-checks the deadline before returning cached requirements", async () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(1n);
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const vaultData = withChainTimestamp(now, () => inKindVaultV1Data());
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

  test("error: migration re-checks the deadline before returning cached requirements", async () => {
    const now = 1_800_000_000n;
    const deadline = now + Time.s.from.h(1n);
    const handle = createMockClient(mainnet);
    const vault = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(IN_KIND_VAULT, mainnet.id);
    const sourceVault = withChainTimestamp(now, () => inKindVaultV1Data());
    const targetVault = withChainTimestamp(now, () =>
      inKindVaultV2Data({ address: TARGET_VAULT }),
    );
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const migration = withChainTimestamp(now, () =>
      vault.migrateToV2({
        shares: 10n,
        sourceVault,
        targetVault,
        userAddress: IN_KIND_USER,
        deadline,
      }),
    );

    const requirements = await withChainTimestamp(now, () =>
      migration.getRequirements(),
    );

    expect(requirements).toHaveLength(1);
    await expect(
      withChainTimestamp(deadline + 1n, () => migration.getRequirements()),
    ).rejects.toBeInstanceOf(ExpiredDeadlineError);
  });
});
