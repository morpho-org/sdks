import { type AccrualVaultV2, Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import { erc20Abi, maxUint256, toHex, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { describe, expect, test, vi } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_VAULT,
  inKindVaultV1Data,
  inKindVaultV2Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  AmountAndSharesExclusiveError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  InvalidSignatureError,
  NonPositiveInputError,
  SameVaultMigrationError,
  VaultAssetMismatchError,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  InvalidTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import {
  applySignatures,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import type { TransactionPlan } from "../types.js";
import {
  prepareVaultV1MigrateToV2,
  type VaultV1MigrateToV2PlanParams,
} from "./migrateToV2.js";

const IN_KIND_USER = privateKeyToAccount(toHex(1n, { size: 32 })).address;
const target = IN_KIND_USER;

test.each([
  { explicitNow: true, customExpiry: false },
  { explicitNow: true, customExpiry: true },
  { explicitNow: false, customExpiry: false },
  { explicitNow: false, customExpiry: true },
])(
  "migration uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
  async ({ explicitNow, customExpiry }) => {
    const sourceVault = inKindVaultV1Data();
    const targetVault = inKindVaultV2Data({ address: target });
    const chainNow = targetVault.lastUpdate;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const mock = createMockClient(mainnet);
    mockRead(mock, {
      address: sourceVault.address,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const preparation = withChainTimestamp(deviceNow, () =>
      prepareVaultV1MigrateToV2(mock.client, {
        sourceVault,
        targetVault,
        chainId: 1,
        account: IN_KIND_USER,
        shares: 100n,
        now: explicitNow ? chainNow : undefined,
        expiresAt,
      }),
    );
    if (!explicitNow && customExpiry) {
      await expect(preparation).rejects.toThrow(ExpiredDeadlineError);
      expect(mock.request).not.toHaveBeenCalled();
      return;
    }
    const prepared = await preparation;
    const expectedExpiry = expiresAt ?? Number(now + 7_200n);
    expect(prepared.expiresAt).toBe(expectedExpiry);
    expect(prepared.steps.at(-1)?.action.inputs).toMatchObject({
      deadline: BigInt(expectedExpiry),
    });
    expect(prepared.signatureRequests).toEqual([]);
    expect(buildTransactions(prepared)).toHaveLength(1);
  },
);
const inputs = {
  chainId: 1,
  account: IN_KIND_USER,
  vault: IN_KIND_VAULT,
  sourceVault: IN_KIND_VAULT,
  targetVault: target,
  asset: IN_KIND_ASSET,
  shares: 10n,
  requiredShareAllowance: 10n,
  maxSharePrice: 10n ** 27n,
  deadline: 2_000_000_000n,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
};
const plan: TransactionPlan = {
  version: 2,
  chainId: 1,
  account: IN_KIND_USER,
  expiresAt: Number(inputs.deadline),
  steps: [
    {
      id: "migrate",
      label: "Migrate to Vault V2",
      action: {
        type: "vaultV1MigrateToV2",
        inputs,
        signatureRequestIds: { tokenPermit: "migrationPermit" },
      },
    },
  ],
  signatureRequests: [],
};
const args = {
  spender: getChainAddress(1, "bundles.vaultBundlesV1"),
  amount: maxUint256,
  deadline: inputs.deadline,
  nonce: 0n,
};
const request = {
  id: "migrationPermit",
  kind: "permit",
  args,
  typedData: getPermitTypedData(
    {
      erc20: new Token({ address: IN_KIND_VAULT, name: "Vault" }),
      owner: IN_KIND_USER,
      allowance: args.amount,
      ...args,
    },
    1,
  ),
} as const;

describe("Vault V1 migration plans", () => {
  test.each(["assets", "shares"] as const)(
    "%s mode stores snapshot addresses and preserves entity calldata",
    async (mode) => {
      const handle = createMockClient(mainnet);
      const sourceVault = inKindVaultV1Data();
      const targetVault = inKindVaultV2Data({ address: target });
      const amount = mode === "assets" ? { assets: 10n } : { shares: 10n };
      mockRead(handle, {
        address: sourceVault.address,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
      const prepared = await prepareVaultV1MigrateToV2(handle.client, {
        sourceVault,
        targetVault,
        chainId: 1,
        account: IN_KIND_USER,
        ...amount,
      });
      expect(prepared.steps.at(-1)?.action.inputs).toMatchObject({
        vault: sourceVault.address,
        sourceVault: sourceVault.address,
        targetVault: targetVault.address,
      });
      const entity = handle.client
        .extend(morphoViemExtension())
        .morpho.vaultV1(sourceVault.address, 1)
        .migrateToV2({
          sourceVault,
          targetVault,
          userAddress: IN_KIND_USER,
          deadline: BigInt(prepared.expiresAt),
          ...amount,
        });
      expect(
        buildTransactions(
          parseTransactionPlan(serializeTransactionPlan(prepared)),
        ),
      ).toEqual([entity.buildTx()]);
    },
  );

  test("stored migration inputs reject malformed amounts, addresses and role maps", () => {
    const { shares: _shares, ...noAmount } = inputs;
    for (const [patch, roleMap] of [
      [noAmount, {}],
      [{ ...inputs, assets: 10n }, {}],
      [{ ...inputs, shares: -1n }, {}],
      [{ ...inputs, shares: maxUint256 + 1n }, {}],
      [{ ...inputs, sourceVault: "invalid" }, {}],
      [{ ...inputs, vault: zeroAddress }, {}],
      [
        {
          ...inputs,
          maxSharePrice: undefined,
          maxSharePriceVaultV2: inputs.maxSharePrice,
        },
        {},
      ],
      [inputs, undefined],
    ] as const) {
      const saved = serializeTransactionPlan({
        ...plan,
        steps: [
          {
            ...plan.steps[0]!,
            action: {
              type: "vaultV1MigrateToV2",
              inputs: patch,
              signatureRequestIds: roleMap,
            },
          },
        ],
      } as TransactionPlan);
      expect(() => parseTransactionPlan(saved)).toThrow(
        InvalidTransactionPlanError,
      );
    }
  });
  test("parsed migration plans support inspection, verification and signature updates", async () => {
    const owner = privateKeyToAccount(toHex(1n, { size: 32 }));
    const other = privateKeyToAccount(toHex(2n, { size: 32 }));
    const typedData = getPermitTypedData(
      {
        erc20: new Token({ address: IN_KIND_VAULT, name: "Vault" }),
        owner: owner.address,
        allowance: args.amount,
        ...args,
      },
      1,
    );
    const parsed = parseTransactionPlan(
      serializeTransactionPlan({
        ...plan,
        account: owner.address,
        steps: [
          {
            ...plan.steps[0]!,
            action: {
              type: "vaultV1MigrateToV2",
              inputs: { ...inputs, account: owner.address },
              signatureRequestIds: { tokenPermit: request.id },
            },
          },
        ],
        signatureRequests: [{ ...request, typedData }],
      }),
    );
    expect(getPendingSignatureRequests(parsed)).toHaveLength(1);
    const signature = await owner.signTypedData(typedData);
    const signatures = [{ id: request.id, signature }];
    const signed = applySignatures(parsed, signatures);
    expect(getPendingSignatureRequests(signed)).toEqual([]);
    const [transaction] = buildTransactions(signed);
    expect(transaction).not.toHaveProperty("id");
    expect(transaction).not.toHaveProperty("kind");
    const wrongSignature = await other.signTypedData(typedData);
    expect(() =>
      applySignatures(parsed, [{ id: request.id, signature: wrongSignature }]),
    ).toThrow(InvalidSignatureError);
    const tampered = {
      ...parsed,
      signatureRequests: [
        {
          ...parsed.signatureRequests[0]!,
          typedData: {
            ...typedData,
            domain: { ...typedData.domain, verifyingContract: target },
          },
        },
      ],
    };
    expect(() => applySignatures(tampered, signatures)).toThrow(
      TransactionPlanSignatureMismatchError,
    );
  });
  test("missing and unsigned requests report their ID", () => {
    for (const signatureRequests of [[], [request]]) {
      expect(() => buildTransactions({ ...plan, signatureRequests })).toThrow(
        new IncompleteTransactionPlanError("migrationPermit"),
      );
    }
  });
  test("signed and allowance-only plans round-trip to identical bytes", async () => {
    const signature = await privateKeyToAccount(
      toHex(1n, { size: 32 }),
    ).signTypedData(request.typedData);
    const signed = { ...plan, signatureRequests: [{ ...request, signature }] };
    const noPermit: TransactionPlan = {
      ...plan,
      steps: [
        {
          ...plan.steps[0]!,
          action: {
            type: "vaultV1MigrateToV2",
            inputs,
            signatureRequestIds: {},
          },
        },
      ],
    };
    for (const prepared of [signed, noPermit])
      expect(
        buildTransactions(
          parseTransactionPlan(serializeTransactionPlan(prepared)),
        ),
      ).toEqual(buildTransactions(prepared));
  });
  test("invalid snapshots and amounts fail before RPC", async () => {
    const { client } = createMockClient(mainnet);
    const rpc = vi.spyOn(client, "request");
    const params: VaultV1MigrateToV2PlanParams = {
      chainId: 1,
      account: IN_KIND_USER,
      sourceVault: inKindVaultV1Data(),
      targetVault: inKindVaultV2Data({ address: target }),
      shares: 10n,
    };
    const differentAsset = {
      ...params.targetVault,
      asset: zeroAddress,
    } as unknown as AccrualVaultV2;
    const { shares: _shares, ...noAmount } = params;
    const cases = [
      [{ ...params, targetVault: differentAsset }, VaultAssetMismatchError],
      [
        {
          ...params,
          targetVault: inKindVaultV2Data(),
        },
        SameVaultMigrationError,
      ],
      [{ ...params, assets: 1n }, AmountAndSharesExclusiveError],
      [noAmount, AmountAndSharesExclusiveError],
      [{ ...params, shares: 0n }, NonPositiveInputError],
      [{ ...params, shares: maxUint256 + 1n }, InputExceedsMaxError],
    ] as const;
    for (const [invalid, error] of cases)
      await expect(
        prepareVaultV1MigrateToV2(
          client,
          invalid as VaultV1MigrateToV2PlanParams,
        ),
      ).rejects.toBeInstanceOf(error);
    expect(rpc).not.toHaveBeenCalled();
  });
});
