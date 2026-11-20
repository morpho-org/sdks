import {
  AccrualVaultV2,
  addressesRegistry,
  DEFAULT_SLIPPAGE_TOLERANCE,
} from "@morpho-org/blue-sdk";
import { erc2612Abi, erc5267Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  erc20Abi,
  getTypesForEIP712Domain,
  hashDomain,
  maxUint256,
  type TypedData,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { assert, expect, test } from "vitest";
import {
  IN_KIND_USER,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import { MAX_SLIPPAGE_TOLERANCE } from "../../helpers/constant.js";
import { computeVaultMaxSharePrice } from "../../helpers/index.js";
import {
  ChainIdMismatchError,
  ExcessiveSlippageToleranceError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  MissingContractCodeError,
  NativeAmountOnNonWNativeVaultError,
  NegativeInputError,
  NonPositiveInputError,
  ReferralFeePctExceededError,
} from "../../types/index.js";
import { ZeroAccountError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { prepareVaultV2Deposit } from "./deposit.js";
import { prepareVaultV2Withdraw } from "./withdraw.js";

const vaultData = inKindVaultV2Data();
const params = {
  vault: vaultData,
  chainId: 1,
  account: IN_KIND_USER,
  assets: 100n,
};

test.each([
  { explicitNow: true, customExpiry: false },
  { explicitNow: true, customExpiry: true },
  { explicitNow: false, customExpiry: false },
  { explicitNow: false, customExpiry: true },
])(
  "deposit uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
  async ({ explicitNow, customExpiry }) => {
    const chainNow = vaultData.lastUpdate;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const preparation = withChainTimestamp(deviceNow, () =>
      prepareVaultV2Deposit(handle.client, {
        ...params,
        now: explicitNow ? chainNow : undefined,
        expiresAt,
      }),
    );
    if (!explicitNow && customExpiry) {
      await expect(preparation).rejects.toThrow(ExpiredDeadlineError);
      expect(handle.request).not.toHaveBeenCalled();
      return;
    }
    const plan = await preparation;
    const expectedExpiry = expiresAt ?? Number(now + 7_200n);
    expect(plan.expiresAt).toBe(expectedExpiry);
    const step = plan.steps.at(-1)!;
    assert(step.action.type === "vaultV2Deposit");
    expect(step.action.inputs.deadline).toBe(BigInt(expectedExpiry));
    expect(step.action.inputs.maxSharePrice).toBe(
      computeVaultMaxSharePrice({
        vaultData,
        deadline: BigInt(expectedExpiry),
        assets: params.assets,
        slippageTolerance: DEFAULT_SLIPPAGE_TOLERANCE,
      }),
    );
    expect(buildTransactions(plan)).toHaveLength(1);
  },
);

test.each([undefined, 0n, MAX_SLIPPAGE_TOLERANCE])(
  "deposit share-price bound uses slippage %s",
  async (slippageTolerance) => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const expiresAt = Number(Time.timestamp() + 3600n);
    const plan = await prepareVaultV2Deposit(handle.client, {
      ...params,
      expiresAt,
      slippageTolerance,
    });
    const step = plan.steps.at(-1)!;
    assert(step.action.type === "vaultV2Deposit");
    expect(step.action.inputs.maxSharePrice).toBe(
      computeVaultMaxSharePrice({
        vaultData,
        deadline: BigInt(expiresAt),
        assets: params.assets,
        slippageTolerance: slippageTolerance ?? DEFAULT_SLIPPAGE_TOLERANCE,
      }),
    );
  },
);

test.each([
  [-1n, NegativeInputError],
  [MAX_SLIPPAGE_TOLERANCE + 1n, ExcessiveSlippageToleranceError],
] as const)(
  "rejects deposit slippage %s before RPC reads",
  async (slippageTolerance, error) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareVaultV2Deposit(handle.client, { ...params, slippageTolerance }),
    ).rejects.toThrow(error);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("fee and slippage deposit calldata matches the entity flow", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.asset,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  const expiresAt = Number(Time.timestamp() + 3600n);
  const slippageTolerance = 23_000000000000000n;
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    expiresAt,
    slippageTolerance,
    referralFee: { bps: 250, recipient: IN_KIND_USER },
    supportSignature: false,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV2Deposit",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  const entityTx = handle.client
    .extend(morphoViemExtension())
    .morpho.vaultV2(params.vault.address, params.chainId)
    .deposit({
      amount: params.assets,
      vaultData,
      userAddress: params.account,
      deadline: BigInt(expiresAt),
      slippageTolerance,
      referralFeePct: 25_000000000000000n,
      referralFeeRecipient: IN_KIND_USER,
    })
    .buildTx();
  const tx = buildTransactions(plan)[1]!;
  expect(tx.data).toBe(entityTx.data);
  expect(tx.to).toBe(entityTx.to);
  expect(tx.value).toBe(entityTx.value);
});

test.each([prepareVaultV2Deposit, prepareVaultV2Withdraw])(
  "%s prepares and builds fees of zero and 9999 basis points",
  async (prepare) => {
    const handle = createMockClient(mainnet);
    for (const address of [vaultData.asset, vaultData.address]) {
      mockRead(handle, {
        address,
        abi: erc20Abi,
        functionName: "allowance",
        result: 0n,
      });
    }
    for (const bps of [0, 9999]) {
      const plan = await prepare(handle.client, {
        ...params,
        assets: 10_000n,
        referralFee: { bps, recipient: IN_KIND_USER },
      });
      expect(plan.steps.at(-1)?.action.inputs).toMatchObject({
        referralFeePct: BigInt(bps) * 10n ** 14n,
        referralFeeRecipient: IN_KIND_USER,
      });
      expect(buildTransactions(plan)).toHaveLength(2);
    }
  },
);

test.each([prepareVaultV2Deposit, prepareVaultV2Withdraw])(
  "%s rejects 10000 basis points with the builder's typed error before RPC reads",
  async (prepare) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepare(handle.client, {
        ...params,
        referralFee: { bps: 10_000, recipient: IN_KIND_USER },
      }),
    ).rejects.toThrow(new ReferralFeePctExceededError(10n ** 18n));
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test.each([prepareVaultV2Deposit, prepareVaultV2Withdraw])(
  "%s rejects a zero account before RPC reads",
  async (prepare) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepare(handle.client, { ...params, account: zeroAddress }),
    ).rejects.toThrow(new ZeroAccountError(zeroAddress));
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("rejects the wrong chain before a failing allowance read", async () => {
  const handle = createMockClient(mainnet);
  const request = handle.request.getMockImplementation()!;
  handle.request.mockImplementation(async (args) => {
    if (args.method === "eth_chainId") return "0x2105";
    if (args.method === "eth_call") throw new Error("allowance read failed");
    return request(args);
  });
  await expect(
    prepareVaultV2Deposit(handle.client, params),
  ).rejects.toBeInstanceOf(ChainIdMismatchError);
  expect(
    handle.request.mock.calls.some(([call]) => call.method === "eth_call"),
  ).toBe(false);
});

test.for([prepareVaultV2Deposit, prepareVaultV2Withdraw])(
  "%s starts requirements before code checks resolve",
  async (prepare, { expect: expectInTest }) => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    handle.request.mockImplementation(async (args) => {
      if (args.method !== "eth_chainId") await gate;
      return request(args);
    });
    mockRead(handle, {
      address:
        prepare === prepareVaultV2Deposit ? vaultData.asset : vaultData.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const pending = prepare(handle.client, params);
    try {
      await expectInTest
        .poll(
          () => new Set(handle.request.mock.calls.map(([call]) => call.method)),
        )
        .toEqual(new Set(["eth_chainId", "eth_getCode", "eth_call"]));
    } finally {
      release();
      await pending;
    }
  },
);

test.each([prepareVaultV2Deposit, prepareVaultV2Withdraw])(
  "%s preserves chain mismatch and missing code error types",
  async (prepare) => {
    for (const [chainId, bytecode, error] of [
      ["0x2105", "0x", ChainIdMismatchError],
      ["0x1", "0x", MissingContractCodeError],
    ] as const) {
      const handle = createMockClient(mainnet);
      const request = handle.request.getMockImplementation()!;
      handle.request.mockImplementation(async (args) => {
        if (args.method === "eth_chainId") return chainId;
        if (args.method === "eth_getCode") return bytecode;
        return request(args);
      });
      mockRead(handle, {
        address:
          prepare === prepareVaultV2Deposit
            ? vaultData.asset
            : vaultData.address,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
      await expect(prepare(handle.client, params)).rejects.toBeInstanceOf(
        error,
      );
    }
  },
);

test.each([
  [0n, NonPositiveInputError],
  [-1n, NonPositiveInputError],
  [maxUint256 + 1n, InputExceedsMaxError],
] as const)(
  "rejects invalid amount %s before RPC reads",
  async (amount, error) => {
    const handle = createMockClient(mainnet);
    await expect(
      prepareVaultV2Deposit(handle.client, { ...params, assets: amount }),
    ).rejects.toBeInstanceOf(error);
    expect(handle.request).not.toHaveBeenCalled();
  },
);

test("rejects native funding for a non-wNative asset before RPC reads", async () => {
  const handle = createMockClient(mainnet);
  await expect(
    prepareVaultV2Deposit(handle.client, {
      ...params,
      funding: { type: "native" },
    }),
  ).rejects.toBeInstanceOf(NativeAmountOnNonWNativeVaultError);
  expect(handle.request).not.toHaveBeenCalled();
});

test("omits token prerequisites when allowance covers the deposit", async () => {
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vaultData.asset,
    abi: erc20Abi,
    functionName: "allowance",
    result: params.assets,
  });
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    supportSignature: true,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "vaultV2Deposit",
  ]);
  expect(plan.signatureRequests).toEqual([]);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV2Deposit",
    label: "Deposit into vault",
    action: { signatureRequestIds: {} },
  });
  expect(Object.isFrozen(plan)).toBe(true);
  expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
  expect(plan.steps[0]?.action.inputs).toMatchObject({
    assets: params.assets,
    asset: vaultData.asset,
    chainId: params.chainId,
    account: params.account,
  });
});

test("defaults to a direct approval instead of probing a permit", async () => {
  const handle = createMockClient(mainnet);
  const asset = addressesRegistry[1].usdc;
  const snapshot = new AccrualVaultV2(
    { ...vaultData, asset },
    undefined,
    [],
    1_000n,
    {},
  );
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  mockRead(handle, {
    address: asset,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    vault: snapshot,
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "erc20Approval",
    "vaultV2Deposit",
  ]);
  expect(plan.steps[0]?.action.inputs).toMatchObject({
    token: asset,
    assets: maxUint256,
  });
  expect(plan.signatureRequests).toEqual([]);
  expect(
    handle.request.mock.calls.filter(([call]) => call.method === "eth_call"),
  ).toHaveLength(1);
});

test("orders reset approvals before the deposit with stable IDs and labels", async () => {
  const handle = createMockClient(mainnet);
  const asset = addressesRegistry[1].usdt!;
  const snapshot = new AccrualVaultV2(
    { ...vaultData, asset },
    undefined,
    [],
    1_000n,
    {},
  );
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    result: 1n,
  });
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    vault: snapshot,
  });
  expect(plan.steps.map(({ id, label }) => [id, label])).toEqual([
    ["vaultV2Deposit:approval", "Approve token spending"],
    ["vaultV2Deposit:approval:2", "Approve token spending"],
    ["vaultV2Deposit", "Deposit into vault"],
  ]);
  expect(plan.steps.slice(0, 2).map(({ action }) => action.inputs)).toEqual(
    [0n, maxUint256].map((amount) => ({
      token: asset,
      spender: getChainAddress(1, "bundles.vaultBundlesV1"),
      assets: amount,
      chainId: 1,
      account: params.account,
    })),
  );
  expect(plan.signatureRequests).toEqual([]);
  expect(Object.isFrozen(plan.steps[0]?.action.inputs)).toBe(true);
});

test("attaches a frozen concrete token permit by ID", async () => {
  const handle = createMockClient(mainnet);
  const asset = addressesRegistry[1].usdc;
  const snapshot = new AccrualVaultV2(
    { ...vaultData, asset },
    undefined,
    [],
    1_000n,
    {},
  );
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "allowance",
    result: 0n,
  });
  mockRead(handle, {
    address: asset,
    abi: erc2612Abi,
    functionName: "nonces",
    result: 7n,
  });
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "name",
    result: "USD Coin",
  });
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "symbol",
    result: "USDC",
  });
  mockRead(handle, {
    address: asset,
    abi: erc20Abi,
    functionName: "decimals",
    result: 6,
  });
  mockRead(handle, {
    address: asset,
    abi: erc5267Abi,
    functionName: "eip712Domain",
    result: ["0x0f", "USD Coin", "2", 1n, asset, `0x${"00".repeat(32)}`, []],
  });
  const domain = {
    name: "USD Coin",
    version: "2",
    chainId: 1,
    verifyingContract: asset,
  };
  mockRead(handle, {
    address: asset,
    abi: erc2612Abi,
    functionName: "DOMAIN_SEPARATOR",
    result: hashDomain<TypedData>({
      domain,
      types: { EIP712Domain: getTypesForEIP712Domain({ domain }) },
    }),
  });
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    vault: snapshot,
    supportSignature: true,
    deployless: false,
    calldataOrigin: "0xcafe",
  });
  expect(plan.signatureRequests).toHaveLength(1);
  expect(plan.signatureRequests[0]).toMatchObject({
    id: "vaultV2Deposit:tokenPermit",
    kind: "permit",
    args: {
      spender: getChainAddress(1, "bundles.vaultBundlesV1"),
      amount: params.assets,
      nonce: 7n,
      deadline: BigInt(plan.expiresAt),
    },
    typedData: {
      domain: { chainId: 1, verifyingContract: asset },
      message: { owner: params.account },
    },
  });
  expect(plan.steps).toHaveLength(1);
  expect(plan.steps[0]).toMatchObject({
    id: "vaultV2Deposit",
    label: "Deposit into vault",
    action: {
      signatureRequestIds: { tokenPermit: "vaultV2Deposit:tokenPermit" },
    },
  });
  expect(plan.calldataOrigin).toBe("0xcafe");
  expect(Object.isFrozen(plan.signatureRequests[0]?.args)).toBe(true);
  expect(Object.isFrozen(plan.signatureRequests[0]?.typedData)).toBe(true);
});

test("native funding skips token requirements and builds a transaction with native value", async () => {
  const handle = createMockClient(mainnet);
  const snapshot = new AccrualVaultV2(
    { ...vaultData, asset: addressesRegistry[1].wNative },
    undefined,
    [],
    1_000n,
    {},
  );
  const plan = await prepareVaultV2Deposit(handle.client, {
    ...params,
    vault: snapshot,
    funding: { type: "native" },
  });
  expect(plan.steps.map(({ action }) => action.type)).toEqual([
    "vaultV2Deposit",
  ]);
  expect(plan.steps[0]?.action.inputs).toMatchObject({
    nativeAssets: params.assets,
  });
  expect(plan.steps[0]?.action.inputs).not.toHaveProperty("assets");
  expect(plan.signatureRequests).toEqual([]);
  expect(buildTransactions(plan)[0]?.value).toBe(params.assets);
  expect(
    handle.request.mock.calls.every(([call]) => call.method !== "eth_call"),
  ).toBe(true);
});
