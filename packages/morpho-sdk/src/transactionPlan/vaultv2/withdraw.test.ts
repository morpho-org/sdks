import { DEFAULT_SLIPPAGE_TOLERANCE } from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  ContractFunctionRevertedError,
  decodeFunctionData,
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  type TypedData,
  toFunctionSelector,
  toHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readContract } from "viem/actions";
import { mainnet } from "viem/chains";
import { assert, expect, expectTypeOf, test } from "vitest";
import {
  IN_KIND_USER,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { vaultBundlesV1Abi } from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxShareAllowance } from "../../helpers/index.js";
import {
  InputExceedsMaxError,
  NonPositiveInputError,
  VaultAddressMismatchError,
} from "../../types/index.js";
import {
  applySignatures,
  buildTransaction,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import {
  buildVaultV2Withdraw,
  prepareVaultV2Withdraw,
  type VaultV2WithdrawPlanParams,
} from "./withdraw.js";

const vaultData = inKindVaultV2Data();
const params = {
  vault: vaultData.address,
  vaultData,
  chainId: 1,
  account: IN_KIND_USER,
  amount: 100n,
};

test("withdrawal plan params do not accept slippage tolerance", () => {
  expectTypeOf<VaultV2WithdrawPlanParams>().not.toHaveProperty(
    "slippageTolerance",
  );
});

test("withdrawal calldata matches the entity flow with default slippage", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const expiresAt = Number(Time.timestamp() + 3600n);
  const plan = await prepareVaultV2Withdraw(handle.client, {
    ...params,
    expiresAt,
    referralFee: { bps: 250, recipient: IN_KIND_USER },
    supportSignature: false,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV2Withdraw",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  const step = plan.steps[1]!;
  assert(step.action.type === "vaultV2Withdraw");
  expect(step.action.inputs.requiredShareAllowance).toBe(
    computeVaultMaxShareAllowance({
      vaultData,
      deadline: BigInt(expiresAt),
      assets: params.amount,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    }),
  );
  const entityTx = handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV2(params.vault, params.chainId)
    .withdraw({
      amount: params.amount,
      vaultData,
      userAddress: params.account,
      deadline: BigInt(expiresAt),
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      referralFeePct: 25_000000000000000n,
      referralFeeRecipient: IN_KIND_USER,
    })
    .buildTx();
  const tx = buildTransaction(plan, plan.steps[1]!);
  expect(tx.data).toBe(entityTx.data);
  expect(tx.to).toBe(entityTx.to);
  expect(tx.value).toBe(entityTx.value);
});

test.each([-1n, 0n, 1n])(
  "selects share approval at the quoted threshold plus %s",
  async (offset) => {
    const handle = createMockClient(mainnet);
    const expiresAt = Number(vaultData.lastUpdate + 3600n);
    const expected = computeVaultMaxShareAllowance({
      vaultData,
      deadline: BigInt(expiresAt),
      assets: params.amount,
      slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
    });
    expect(expected).toBeGreaterThan(1n);
    expect(expected).toBeGreaterThan(
      computeVaultMaxShareAllowance({
        vaultData,
        deadline: BigInt(expiresAt),
        assets: params.amount,
        slippageTolerance: 0n,
      }),
    );
    mockRead(handle, {
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: expected + offset,
    });
    const plan = await prepareVaultV2Withdraw(handle.client, {
      ...params,
      expiresAt,
      referralFee: { bps: 250, recipient: IN_KIND_USER },
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      offset < 0n ? ["erc20Approval", "vaultV2Withdraw"] : ["vaultV2Withdraw"],
    );
    const step = plan.steps.at(-1)!;
    assert(step.action.type === "vaultV2Withdraw");
    expect(step.action.inputs.requiredShareAllowance).toBe(expected);
    expect(plan.signatureRequests).toEqual([]);
  },
);

test("rejects a snapshot for another vault before RPC reads", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareVaultV2Withdraw(handle.client, { ...params, vault: zeroAddress }),
  ).rejects.toBeInstanceOf(VaultAddressMismatchError);
  expect(handle.request).not.toHaveBeenCalled();
});

test.each([
  [0n, NonPositiveInputError],
  [-1n, NonPositiveInputError],
  [maxUint256 + 1n, InputExceedsMaxError],
] as const)(
  "rejects invalid amount %s before RPC reads",
  async (amount, error) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareVaultV2Withdraw(handle.client, { ...params, amount }),
    ).rejects.toBeInstanceOf(error);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("defaults to direct approval of vault shares to VaultBundlesV1", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const plan = await prepareVaultV2Withdraw(handle.client, params);
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV2Withdraw",
  ]);
  expect(plan.steps[0]?.action.inputs).toEqual({
    chainId: params.chainId,
    account: params.account,
    token: vaultData.address,
    spender: getChainAddress(1, "bundles.vaultBundlesV1"),
    amount: maxUint256,
  });
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps.map(({ id, label }) => [id, label])).toEqual([
    ["vaultV2Withdraw:approval", "Approve token spending"],
    ["vaultV2Withdraw", "Withdraw from vault"],
  ]);
  const step = plan.steps[1]!;
  expect(step.action.inputs).toMatchObject({
    chainId: params.chainId,
    account: params.account,
  });
  assert(step.action.type === "vaultV2Withdraw");
  expect(buildTransaction(plan, step)).toMatchObject(
    buildVaultV2Withdraw(step.action, []),
  );
});

test("skips share approval and permit when the allowance is sufficient", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const plan = await prepareVaultV2Withdraw(handle.client, {
    ...params,
    supportSignature: true,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "vaultV2Withdraw",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV2Withdraw",
    label: "Withdraw from vault",
    action: { signatureRequestIds: {} },
  });
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
});

test("prepares an unlimited share permit and preserves its value through storage and encoding", async () => {
  const account = privateKeyToAccount(toHex(1n, { size: 32 }));
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  mockRead(handle, {
    address: vaultData.address,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  for (const [functionName, result] of [
    ["name", "Vault"],
    ["symbol", "VAULT"],
    ["decimals", 18],
  ] as const) {
    mockRead(handle, {
      address: vaultData.address,
      abi: erc20Abi,
      functionName,
      result,
    });
  }
  const baseRequest = handle.request.getMockImplementation()!;
  handle.request.mockImplementation(async (call) => {
    if (call.method === "eth_call") {
      const [tx] = call.params as readonly [{ data?: string }];
      if (tx.data?.startsWith(toFunctionSelector("eip712Domain()")))
        throw new ContractFunctionRevertedError({
          abi: erc5267Abi,
          functionName: "eip712Domain",
        });
    }
    return baseRequest(call);
  });
  await expect(
    readContract(handle.client, {
      address: vaultData.address,
      abi: erc5267Abi,
      functionName: "eip712Domain",
    }),
  ).rejects.toThrow();
  const domain = {
    chainId: 1,
    verifyingContract: vaultData.address,
  };
  mockRead(handle, {
    address: vaultData.address,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
    result: hashDomain<TypedData>({
      domain,
      types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
    }),
  });
  const plan = await prepareVaultV2Withdraw(handle.client, {
    ...params,
    supportSignature: true,
    calldataOrigin: "0xcafe",
    account: account.address,
  });
  expect(plan.signatureRequests).toHaveLength(1);
  expect(plan.signatureRequests[0]?.typedData.domain).toEqual(domain);
  expect(plan.signatureRequests[0]).toMatchObject({
    id: "vaultV2Withdraw:tokenPermit",
    kind: "permit",
    args: {
      spender: getChainAddress(1, "bundles.vaultBundlesV1"),
      amount: maxUint256,
      nonce: 7n,
      deadline: BigInt(plan.expiresAt),
    },
    typedData: {
      domain: { chainId: 1, verifyingContract: vaultData.address },
      message: {
        owner: account.address,
        value: maxUint256,
      },
    },
  });
  expect(plan.steps).toHaveLength(1);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV2Withdraw",
    label: "Withdraw from vault",
    action: {
      signatureRequestIds: { tokenPermit: "vaultV2Withdraw:tokenPermit" },
    },
  });
  expect(plan.calldataOrigin).toBe("0xcafe");
  expect(Object.isFrozen(plan.signatureRequests[0]?.args)).toBe(true);
  expect(Object.isFrozen(plan.signatureRequests[0]?.typedData)).toBe(true);
  expect(getPendingSignatureRequests(plan)).toEqual(plan.signatureRequests);
  const step = plan.steps[0]!;
  assert(step.action.type === "vaultV2Withdraw");
  expect(step.action.inputs.requiredShareAllowance).toBeGreaterThan(0n);
  expect(step.action.inputs.requiredShareAllowance).toBeLessThan(maxUint256);
  const request = plan.signatureRequests[0]!;
  // Finite permits in stored v1 plans remain valid when they cover the quoted minimum.
  for (const amount of [
    maxUint256,
    step.action.inputs.requiredShareAllowance,
  ]) {
    const pending = {
      ...plan,
      signatureRequests: [
        {
          ...request,
          args: { ...request.args, amount },
          typedData: {
            ...request.typedData,
            message: { ...request.typedData.message, value: amount },
          },
        },
      ],
    };
    expect(getPendingSignatureRequests(pending)).toEqual(
      pending.signatureRequests,
    );
    const signature = await account.signTypedData(
      pending.signatureRequests[0]!.typedData,
    );
    const restored = parseTransactionPlan(
      serializeTransactionPlan(
        applySignatures(pending, [{ id: request.id, signature }]),
      ),
    );
    const transaction = buildTransaction(restored, restored.steps[0]!);
    const decoded = decodeFunctionData({
      abi: vaultBundlesV1Abi,
      data: transaction.data,
    });
    assert(decoded.functionName === "vaultBundlesV1Withdraw");
    expect(decoded.args[3]).toMatchObject({
      value: amount,
      nonce: 7n,
      deadline: BigInt(plan.expiresAt),
    });
    expect(transaction.data.endsWith("cafe")).toBe(true);
  }
});
