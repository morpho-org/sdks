import { getChainAddresses } from "@morpho-org/blue-sdk";
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
import {
  metaMorphoAbi,
  vaultV2Abi,
  vaultV2FactoryAbi,
} from "@morpho-org/morpho-sdk/abis";
import { getErpcForkUrl } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc4626Abi,
  isAddressEqual,
  maxUint256,
  parseEventLogs,
  zeroAddress,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  ConsumerLimitViolationError,
  type InputOperationLimit,
  simulate,
  toSimulationAuthorizations,
} from "../../src/index.js";
import { seededVaultData } from "../setup.js";

const test = createViemTest(mainnet, {
  forkUrl: getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: 26_355_500n,
}).extend<{ VAULT: Address }>({
  VAULT: async ({ client }, use) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    await client.setNextBlockTimestamp({
      timestamp: BigInt(Math.floor(Date.now() / 1_000)),
    });
    const hash = await client.writeContract({
      address: getChainAddresses(mainnet.id).vaultV2Factory!,
      abi: vaultV2FactoryAbi,
      functionName: "createVaultV2",
      args: [client.account.address, USDC, zeroHash],
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const [created] = parseEventLogs({
      abi: vaultV2FactoryAbi,
      eventName: "CreateVaultV2",
      logs: receipt.logs,
    });
    await use(created!.args.newVaultV2);
  },
});
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

for (const exit of ["redeem", "withdraw"] as const) {
  test(`V2 ${exit} measures burned shares despite performance fees minted to the owner`, async ({
    client,
    VAULT,
  }) => {
    const owner = client.account.address;
    await client.setCode({ address: owner, bytecode: "0x" });
    await client.writeContract({
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "setCurator",
      args: [owner],
    });
    for (const call of [
      { functionName: "setIsAllocator", args: [owner, true] },
      { functionName: "setPerformanceFeeRecipient", args: [owner] },
      { functionName: "setPerformanceFee", args: [100_000_000_000_000_000n] },
    ] as const) {
      const data = encodeFunctionData({ abi: vaultV2Abi, ...call });
      await client.writeContract({
        address: VAULT,
        abi: vaultV2Abi,
        functionName: "submit",
        args: [data],
      });
      await client.sendTransaction({ to: VAULT, data });
    }
    await client.writeContract({
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "setMaxRate",
      args: [10n ** 18n / 31_536_000n],
    });
    expect(
      await client.readContract({
        address: VAULT,
        abi: vaultV2Abi,
        functionName: "performanceFeeRecipient",
      }),
    ).toBe(owner);

    await client.deal({ erc20: USDC, amount: 10_000_000n });
    await client.approve({ address: USDC, args: [VAULT, maxUint256] });
    await client.writeContract({
      address: VAULT,
      abi: erc4626Abi,
      functionName: "deposit",
      args: [10_000_000n, owner],
    });
    await client.deal({ erc20: USDC, amount: 1_000_000n });
    await client.writeContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [VAULT, 1_000_000n],
    });
    await client.setNextBlockTimestamp({
      timestamp: (await client.getBlock()).timestamp + 86_400n,
    });
    await client.mine({ blocks: 1 });
    const [, performanceFeeShares] = await client.readContract({
      address: VAULT,
      abi: vaultV2Abi,
      functionName: "accrueInterestView",
    });
    expect(performanceFeeShares).toBeGreaterThan(0n);
    const shares = await client.readContract({
      address: VAULT,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    expect(shares).toBeGreaterThan(0n);
    const vault = client
      .extend(morphoViemExtension({ supportSignature: false }))
      .morpho.vaultV2(VAULT, mainnet.id);
    const deadline = (await client.getBlock()).timestamp + 3_600n;
    const action =
      exit === "redeem"
        ? vault.redeem({
            shares,
            userAddress: owner,
            deadline,
          })
        : vault.withdraw({
            amount: 1_000_000n,
            userAddress: owner,
            deadline,
            vaultData: await vault.getData(),
          });
    const operation: InputOperationLimit =
      exit === "redeem"
        ? { type: "vaultV2Redeem", vault: VAULT, inputs: { shares } }
        : {
            type: "vaultV2Withdraw",
            vault: VAULT,
            inputs: { assets: 1_000_000n },
          };
    const tx = action.buildTx();
    const request = {
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations: toSimulationAuthorizations({
        owner,
        requirements: await action.getRequirements(),
      }),
      transactions: [{ from: owner, to: tx.to, data: tx.data }],
    };
    const config = {
      timeoutMs: 30_000,
      chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
    };
    const result = await simulate(config, {
      ...request,
      limits: {
        operations: [operation],
      },
    });
    const minted = result.transfers
      .filter(
        (transfer) =>
          isAddressEqual(transfer.token, VAULT) &&
          isAddressEqual(transfer.from, zeroAddress) &&
          isAddressEqual(transfer.to, owner),
      )
      .reduce((total, transfer) => total + transfer.amount, 0n);
    const burned = result.transfers
      .filter(
        (transfer) =>
          isAddressEqual(transfer.token, VAULT) &&
          isAddressEqual(transfer.from, owner) &&
          isAddressEqual(transfer.to, zeroAddress),
      )
      .reduce((total, transfer) => total + transfer.amount, 0n);
    expect(minted).toBeGreaterThan(0n);
    expect(burned).toBe(
      result.verification.operations[0]?.checkedLimits.quote.sharesBurned,
    );
    if (exit === "redeem") expect(burned).toBe(shares);
    expect(
      result.verification.operations[0]?.checkedLimits.fieldChecks,
    ).toMatchObject({
      sharesBurned: "exact",
    });
    await expect(
      simulate(config, {
        ...request,
        limits: {
          operations: [
            exit === "redeem"
              ? {
                  type: "vaultV2Redeem",
                  vault: VAULT,
                  inputs: { shares: shares + 1n },
                }
              : {
                  type: "vaultV2Withdraw",
                  vault: VAULT,
                  inputs: { assets: 1_000_001n },
                },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }, 180_000);
}

for (const exit of ["redeem", "withdraw", "migrate"] as const) {
  test(`V1 fee-recipient ${exit} keeps the exact source-share check`, async ({
    client,
    VAULT,
  }) => {
    const source: Address = "0xBEEF01735c132Ada46AA9aA4c54623cAA92A64CB";
    const owner = client.account.address;
    await client.setCode({ address: owner, bytecode: "0x" });
    const vaultOwner = await client.readContract({
      address: source,
      abi: metaMorphoAbi,
      functionName: "owner",
    });
    await client.setBalance({ address: vaultOwner, value: 10n ** 18n });
    await client.writeContract({
      account: vaultOwner,
      address: source,
      abi: metaMorphoAbi,
      functionName: "setFeeRecipient",
      args: [owner],
    });
    expect(
      await client.readContract({
        address: source,
        abi: metaMorphoAbi,
        functionName: "fee",
      }),
    ).toBeGreaterThan(0n);
    await client.deal({ erc20: USDC, amount: 10_000_000n });
    await client.approve({ address: USDC, args: [source, maxUint256] });
    await client.writeContract({
      address: source,
      abi: erc4626Abi,
      functionName: "deposit",
      args: [10_000_000n, owner],
    });
    const morpho = client.extend(
      morphoViemExtension({ supportSignature: false }),
    ).morpho;
    const vault = morpho.vaultV1(source, mainnet.id);
    const targetVault =
      exit === "migrate"
        ? await seededVaultData(client, morpho.vaultV2(VAULT, mainnet.id))
        : undefined;
    await client.increaseTime({ seconds: 86_400 });
    await client.mine({ blocks: 1 });
    const shares = await client.readContract({
      address: source,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    });
    const common = {
      userAddress: owner,
      deadline: (await client.getBlock()).timestamp + 3_600n,
    };
    const action =
      exit === "redeem"
        ? vault.redeem({ ...common, shares })
        : exit === "withdraw"
          ? vault.withdraw({
              ...common,
              amount: 1_000_000n,
              vaultData: await vault.getData(),
            })
          : vault.migrateToV2({
              ...common,
              shares,
              sourceVault: await vault.getData(),
              targetVault: targetVault!,
            });
    const operation: InputOperationLimit =
      exit === "redeem"
        ? { type: "vaultV1Redeem", vault: source, inputs: { shares } }
        : exit === "withdraw"
          ? {
              type: "vaultV1Withdraw",
              vault: source,
              inputs: { assets: 1_000_000n },
            }
          : {
              type: "vaultV1MigrateToV2",
              sourceVault: source,
              targetVault: VAULT,
              inputs: { shares },
            };
    const tx = action.buildTx();
    const request = {
      chainId: mainnet.id,
      mode: "preview" as const,
      authorizations: toSimulationAuthorizations({
        owner,
        requirements: await action.getRequirements(),
      }),
      transactions: [{ from: owner, to: tx.to, data: tx.data }],
    };
    const config = {
      timeoutMs: 30_000,
      chains: new Map([[mainnet.id, { simulateV1Url: client.transport.url! }]]),
    };
    const result = await simulate(config, {
      ...request,
      limits: { operations: [operation] },
    });
    const minted = result.transfers
      .filter(
        (transfer) =>
          isAddressEqual(transfer.token, source) &&
          isAddressEqual(transfer.from, zeroAddress) &&
          isAddressEqual(transfer.to, owner),
      )
      .reduce((total, transfer) => total + transfer.amount, 0n);
    expect(minted).toBeGreaterThan(0n);
    expect(
      result.verification.operations[0]?.checkedLimits.fieldChecks,
    ).toMatchObject({ sharesBurned: "exact" });
    const wrongAmount: InputOperationLimit =
      operation.type === "vaultV1Withdraw"
        ? { ...operation, inputs: { assets: 1_000_001n } }
        : { ...operation, inputs: { shares: shares + 1n } };
    await expect(
      simulate(config, { ...request, limits: { operations: [wrongAmount] } }),
    ).rejects.toBeInstanceOf(ConsumerLimitViolationError);
  }, 180_000);
}
