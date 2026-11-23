import { AccrualVault, DEFAULT_SLIPPAGE_TOLERANCE } from "@morpho-org/blue-sdk";
import {
  erc2612Abi,
  MissingPermitDomainNameError,
} from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { decodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  IN_KIND_USER,
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { vaultBundlesV1Abi } from "../../abis.js";
import { morphoViemExtension } from "../../client/index.js";
import { computeVaultMaxShareAllowance } from "../../helpers/index.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  MissingContractCodeError,
  NonPositiveInputError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
} from "../error.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import { buildVaultV1Withdraw, prepareVaultV1Withdraw } from "./withdraw.js";

const account = privateKeyToAccount(
  "0x0000000000000000000000000000000000000000000000000000000000000001",
);
const vaultData = inKindVaultV1Data();
const params = {
  vault: vaultData,
  chainId: 1,
  account: account.address,
  assets: 100n,
};

test.each([
  { explicitNow: true, customExpiry: false },
  { explicitNow: true, customExpiry: true },
  { explicitNow: false, customExpiry: false },
  { explicitNow: false, customExpiry: true },
])(
  "withdrawal uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
  async ({ explicitNow, customExpiry }) => {
    const chainNow = 1_700_000_000n;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const preparation = withChainTimestamp(deviceNow, () =>
      prepareVaultV1Withdraw(mock.client, {
        ...params,
        now: explicitNow ? chainNow : undefined,
        expiresAt,
      }),
    );
    if (!explicitNow && customExpiry) {
      await expect(preparation).rejects.toThrow(ExpiredDeadlineError);
      expect(mock.request).not.toHaveBeenCalled();
      return;
    }
    const plan = await preparation;
    const expectedExpiry = expiresAt ?? Number(now + 7_200n);
    expect(plan.expiresAt).toBe(expectedExpiry);
    expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
      deadline: BigInt(expectedExpiry),
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(buildTransactions(plan)).toHaveLength(1);
  },
);

test("preserves chain mismatch and missing code error types", async () => {
  for (const [chainId, bytecode, error] of [
    ["0x2105", "0x", ChainIdMismatchError],
    ["0x1", "0x", MissingContractCodeError],
  ] as const) {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_chainId") {
        return chainId;
      }
      if (args.method === "eth_getCode") {
        return bytecode;
      }
      return request(args);
    });
    mockRead(handle, {
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    await expect(
      prepareVaultV1Withdraw(handle.client, params),
    ).rejects.toBeInstanceOf(error);
  }
});

test("rejects a share permit without snapshot domain metadata", async () => {
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
    result: 0n,
  });
  const snapshot = new AccrualVault(
    { ...vaultData, name: undefined, eip5267Domain: undefined },
    [...vaultData.allocations.values()],
  );
  await expect(
    prepareVaultV1Withdraw(handle.client, {
      ...params,
      vault: snapshot,
      supportSignature: true,
    }),
  ).rejects.toBeInstanceOf(MissingPermitDomainNameError);
});

test("all plan interpreters accept a Vault V1 withdrawal after storage", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: maxUint256,
  });
  const plan = parseTransactionPlan(
    serializeTransactionPlan(
      await prepareVaultV1Withdraw(handle.client, params),
    ),
  );
  expect(getPendingSignatureRequests(plan)).toEqual([]);
  const restored = applySignatures(plan, []);
  const transaction = buildTransaction(restored, restored.steps[0]!);
  expect(buildTransactions(restored)).toEqual([transaction]);
  expect(transaction).not.toHaveProperty("id");
  expect(transaction).not.toHaveProperty("kind");
});

test("fee and slippage withdrawal calldata matches the entity flow", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.address,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const expiresAt = Number(Time.timestamp() + 3600n);
  const slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE;
  const plan = await prepareVaultV1Withdraw(handle.client, {
    ...params,
    expiresAt,
    referralFee: { bps: 250, recipient: IN_KIND_USER },
    supportSignature: false,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV1Withdraw",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  const step = plan.steps[1]!;
  assert(step.action.type === "vaultV1Withdraw");
  expect(step.action.inputs.requiredShareAllowance).toBe(
    computeVaultMaxShareAllowance({
      vaultData,
      deadline: BigInt(expiresAt),
      assets: params.assets,
      slippageTolerance,
    }),
  );
  const entityTx = handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV1(params.vault.address, params.chainId)
    .withdraw({
      amount: params.assets,
      vaultData,
      userAddress: params.account,
      deadline: BigInt(expiresAt),
      slippageTolerance,
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
    const expiresAt = Number(Time.timestamp() + 3600n);
    const slippageTolerance = DEFAULT_SLIPPAGE_TOLERANCE;
    const expected = computeVaultMaxShareAllowance({
      vaultData,
      deadline: BigInt(expiresAt),
      assets: params.assets,
      slippageTolerance,
    });
    expect(expected).toBeGreaterThan(1n);
    expect(expected).toBeGreaterThan(
      computeVaultMaxShareAllowance({
        vaultData,
        deadline: BigInt(expiresAt),
        assets: params.assets,
        slippageTolerance: 0n,
      }),
    );
    mockRead(handle, {
      address: vaultData.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: expected + offset,
    });
    const plan = await prepareVaultV1Withdraw(handle.client, {
      ...params,
      expiresAt,
      referralFee: { bps: 250, recipient: IN_KIND_USER },
    });
    expect(plan.steps.map(({ action }) => action.type)).toEqual(
      offset < 0n ? ["erc20Approval", "vaultV1Withdraw"] : ["vaultV1Withdraw"],
    );
    const step = plan.steps.at(-1)!;
    assert(step.action.type === "vaultV1Withdraw");
    expect(step.action.inputs.requiredShareAllowance).toBe(expected);
    expect(plan.signatureRequests).toEqual([]);
  },
);

test.each([
  [0n, NonPositiveInputError],
  [-1n, NonPositiveInputError],
  [maxUint256 + 1n, InputExceedsMaxError],
] as const)(
  "rejects invalid amount %s before RPC reads",
  async (assets, error) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareVaultV1Withdraw(handle.client, { ...params, assets }),
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
  const plan = await prepareVaultV1Withdraw(handle.client, params);
  expect(() =>
    parseTransactionPlan(
      serializeTransactionPlan(plan).replace('"assets":', '"amount":'),
    ),
  ).toThrow(InvalidTransactionPlanError);
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV1Withdraw",
  ]);
  expect(plan.steps[0]?.action.inputs).toEqual({
    chainId: params.chainId,
    account: params.account,
    token: vaultData.address,
    spender: getChainAddress(1, "bundles.vaultBundlesV1"),
    shares: maxUint256,
  });
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps.map(({ id, label }) => [id, label])).toEqual([
    ["vaultV1Withdraw:approval", "Approve token spending"],
    ["vaultV1Withdraw", "Withdraw from vault"],
  ]);
  const step = plan.steps[1]!;
  expect(step.action.inputs).toMatchObject({
    chainId: params.chainId,
    account: params.account,
  });
  assert(step.action.type === "vaultV1Withdraw");
  expect(buildTransaction(plan, step)).toMatchObject(
    buildVaultV1Withdraw(step.action, []),
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
  const plan = await prepareVaultV1Withdraw(handle.client, {
    ...params,
    supportSignature: true,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "vaultV1Withdraw",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV1Withdraw",
    label: "Withdraw from vault",
    action: { signatureRequestIds: {} },
  });
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
});

test("prepares an unlimited share permit and preserves its value through storage and encoding", async () => {
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
  const plan = await prepareVaultV1Withdraw(handle.client, {
    ...params,
    supportSignature: true,
    calldataOrigin: "0xcafe",
  });
  expect(plan.signatureRequests).toHaveLength(1);
  expect(plan.signatureRequests[0]).toMatchObject({
    id: "vaultV1Withdraw:tokenPermit",
    kind: "permit",
    args: {
      spender: getChainAddress(1, "bundles.vaultBundlesV1"),
      amount: maxUint256,
      nonce: 7n,
      deadline: BigInt(plan.expiresAt),
    },
    typedData: {
      domain: { chainId: 1, verifyingContract: vaultData.address },
      message: { owner: params.account, value: maxUint256 },
    },
  });
  expect(plan.steps).toHaveLength(1);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV1Withdraw",
    label: "Withdraw from vault",
    action: {
      signatureRequestIds: { tokenPermit: "vaultV1Withdraw:tokenPermit" },
    },
  });
  expect(plan.calldataOrigin).toBe("0xcafe");
  expect(Object.isFrozen(plan.signatureRequests[0]?.args)).toBe(true);
  expect(Object.isFrozen(plan.signatureRequests[0]?.typedData)).toBe(true);
  expect(getPendingSignatureRequests(plan)).toEqual(plan.signatureRequests);
  const step = plan.steps[0]!;
  assert(step.action.type === "vaultV1Withdraw");
  expect(step.action.inputs.requiredShareAllowance).toBeGreaterThan(0n);
  expect(step.action.inputs.requiredShareAllowance).toBeLessThan(maxUint256);
  const request = plan.signatureRequests[0]!;
  assert(request.kind === "permit");
  expect(() => buildTransactions({ ...plan, signatureRequests: [] })).toThrow(
    new IncompleteTransactionPlanError(request.id),
  );
  // Finite permits remain valid in format 2 when they cover the quoted minimum.
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
