import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { BaseError, ContractFunctionRevertedError } from "viem";
import { base } from "viem/chains";
import { expect } from "vitest";
import { vaultV2Abi } from "../src/abis.js";
import { fetchAccrualVaultV2 } from "../src/fetch/vault-v2/VaultV2.js";

const test = createViemTest(base, {
  forkUrl:
    process.env.BASE_RPC_URL ??
    getErpcForkUrl(base.id, process.env.ERPC_SECRET),
  forkBlockNumber: 53_249_570,
});

test.for([
  { name: "same-block inclusion", inclusionDelay: 0n, inclusionMargin: 0n },
  {
    name: "delayed inclusion with margin",
    inclusionDelay: 12n,
    inclusionMargin: 48n,
  },
])(
  "Clearstar deposit headroom books pending market interest ($name)",
  async ({ inclusionDelay, inclusionMargin }, { client }) => {
    const fetched = await fetchAccrualVaultV2(
      "0x91C056B6d4311a743614FBc03ac32d4E6A2d3a3c",
      client,
    );
    const quoteTimestamp = 1_793_288_489n;
    const inclusionTimestamp = quoteTimestamp + inclusionDelay;
    const { vault } = fetched.accrueInterest(
      inclusionTimestamp + inclusionMargin,
    );
    const capacity = vault.maxDeposit(10n ** 15n);
    const unbufferedCapacity = fetched
      .accrueInterest(quoteTimestamp)
      .vault.maxDeposit(10n ** 15n).value;
    expect(unbufferedCapacity).toBeGreaterThanOrEqual(52_057_000_000n);
    expect(unbufferedCapacity).toBeLessThanOrEqual(52_058_500_000n);
    if (inclusionDelay > 0n)
      expect(capacity.value).toBeLessThan(unbufferedCapacity);

    const address = fetched.address;
    const receiver = client.account.address;
    await client.deal({
      erc20: fetched.asset,
      amount: unbufferedCapacity + 1_000_000n,
    });
    const approval = await client.approve({
      address: fetched.asset,
      args: [address, unbufferedCapacity + 1_000_000n],
    });
    await client.waitForTransactionReceipt({ hash: approval });
    const snapshot = await client.snapshot();
    await client.setNextBlockTimestamp({ timestamp: inclusionTimestamp });
    const deposit = await client.writeContract({
      address,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [capacity.value, receiver],
    });
    const receipt = await client.waitForTransactionReceipt({ hash: deposit });
    expect(receipt.status).toBe("success");
    await client.revert({ id: snapshot });
    await client.setNextBlockTimestamp({ timestamp: inclusionTimestamp });
    await client.mine({ blocks: 1 });
    try {
      await client.simulateContract({
        address,
        abi: vaultV2Abi,
        functionName: "deposit",
        args: [unbufferedCapacity + 1_000_000n, receiver],
      });
      expect.unreachable("Expected the over-cap deposit to revert");
    } catch (error) {
      if (!(error instanceof BaseError)) throw error;
      const reverted = error.walk(
        (cause) => cause instanceof ContractFunctionRevertedError,
      );
      expect(reverted).toBeInstanceOf(ContractFunctionRevertedError);
      expect((reverted as ContractFunctionRevertedError).data?.errorName).toBe(
        "AbsoluteCapExceeded",
      );
    }
    const overCapDeposit = await client.writeContract({
      address,
      abi: vaultV2Abi,
      functionName: "deposit",
      args: [unbufferedCapacity + 1_000_000n, receiver],
      gas: 2_000_000n,
    });
    const overCapReceipt = await client.waitForTransactionReceipt({
      hash: overCapDeposit,
    });
    expect(overCapReceipt.status).toBe("reverted");
  },
);
