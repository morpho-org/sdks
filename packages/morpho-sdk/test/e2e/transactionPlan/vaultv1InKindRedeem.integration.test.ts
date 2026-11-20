import { fetchAccrualPosition } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { getErpcForkUrl, MAINNET_FORK_BLOCK } from "@morpho-org/test";
import { createViemTest } from "@morpho-org/test/vitest";
import { erc20Abi, maxUint256, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { expect } from "vitest";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
  isRequirementSignature,
  morphoViemExtension,
  parseTransactionPlan,
  prepareVaultV1InKindRedeem,
  type RequirementSignature,
  serializeTransactionPlan,
} from "../../../src/index.js";
import { SteakhouseUsdcVaultV1 } from "../../fixtures/vaultV1.js";
import { withChainTimestamp } from "../../helpers/time.js";

const test = createViemTest(mainnet, {
  forkUrl:
    process.env.MAINNET_RPC_URL ??
    getErpcForkUrl(mainnet.id, process.env.ERPC_SECRET),
  chainId: mainnet.id,
  forkBlockNumber: MAINNET_FORK_BLOCK,
});

for (const mode of ["existing allowance", "approval", "permit"] as const) {
  test(`prepareVaultV1InKindRedeem: ${mode}`, async ({ client }) => {
    await client.setCode({ address: client.account.address, bytecode: "0x" });
    const supportSignature = mode !== "approval";
    const vault = client
      .extend(morphoViemExtension({ supportSignature }))
      .morpho.vaultV1(SteakhouseUsdcVaultV1.address, mainnet.id);
    const vaultData = await vault.getData();
    const amount = parseUnits("1", 6);
    const marketParamsList = [...vaultData.allocations.values()]
      .filter(
        ({ config, position }) => config.enabled && position.supplyShares > 0n,
      )
      .map(({ position }) => position.market.params);
    await client.deal({
      erc20: vaultData.address,
      amount: vaultData.toShares(amount * 2n),
    });
    const spender = getChainAddress(mainnet.id, "bundles.vaultExitBundlesV1");
    await client.writeContract({
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, mode === "existing allowance" ? maxUint256 : 0n],
    });
    const initialShares = await client.readContract({
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const initialPositions = await Promise.all(
      marketParamsList.map(({ id }) =>
        fetchAccrualPosition(client.account.address, id, client),
      ),
    );
    const initialAssets = await client.readContract({
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const timestamp = await client.timestamp();
    const expiresAt = Number(Time.timestamp() + 7200n);
    let plan = await withChainTimestamp(timestamp, () =>
      prepareVaultV1InKindRedeem(client, {
        chainId: mainnet.id,
        account: client.account.address,
        vault: vaultData,
        marketParamsList,
        assets: amount,
        supportSignature,
        expiresAt,
      }),
    );
    const pending = getPendingSignatureRequests(plan);
    expect(pending.map(({ kind }) => kind)).toEqual(
      mode === "permit" ? ["permit"] : [],
    );
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      mode === "approval"
        ? ["erc20Approval", "vaultV1InKindRedeem"]
        : ["vaultV1InKindRedeem"],
    );
    if (mode === "approval")
      expect(plan.steps[0]?.action.inputs).toMatchObject({
        spender,
        shares: maxUint256,
      });
    const signatures = await Promise.all(
      pending.map(async (request) => ({
        id: request.id,
        signature: await client.signTypedData(request.typedData),
      })),
    );
    plan = applySignatures(plan, signatures);
    const exit = withChainTimestamp(timestamp, () =>
      vault.inKindRedeem({
        amount,
        marketParamsList,
        vaultData,
        userAddress: client.account.address,
        deadline: BigInt(expiresAt),
      }),
    );
    const stableSignatures: RequirementSignature[] = [];
    if (mode === "permit") {
      const [requirement] = await withChainTimestamp(timestamp, () =>
        exit.getRequirements(),
      );
      expect(isRequirementSignature(requirement)).toBe(true);
      if (!isRequirementSignature(requirement)) return;
      stableSignatures.push(
        await requirement.sign(client, client.account.address),
      );
    }
    const transactions = buildTransactions(
      parseTransactionPlan(serializeTransactionPlan(plan)),
    );
    expect(transactions.at(-1)).toEqual(exit.buildTx(stableSignatures));
    for (const transaction of transactions)
      await client.sendTransaction(transaction);
    const finalShares = await client.readContract({
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    const finalPositions = await Promise.all(
      marketParamsList.map(({ id }) =>
        fetchAccrualPosition(client.account.address, id, client),
      ),
    );
    const finalAssets = await client.readContract({
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [client.account.address],
    });
    expect(finalShares).toBeLessThan(initialShares);
    expect(
      finalPositions.reduce((sum, position) => sum + position.supplyShares, 0n),
    ).toBeGreaterThan(
      initialPositions.reduce(
        (sum, position) => sum + position.supplyShares,
        0n,
      ),
    );
    expect(
      finalPositions.reduce(
        (sum, position) => sum + position.supplyAssets,
        0n,
      ) +
        finalAssets -
        initialAssets,
    ).toBeGreaterThanOrEqual(amount - 10n);
  });
}
