import { Token } from "@morpho-org/blue-sdk";
import { getChainAddress } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  createPublicClient,
  custom,
  erc20Abi,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, expectTypeOf, test } from "vitest";
import {
  IN_KIND_USER,
  IN_KIND_VAULT,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { encodeVaultSharesPermit } from "../../actions/requirements/encode/encodeVaultSharesPermit.js";
import { vaultV2Redeem } from "../../actions/vaultV2/redeem.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
  InputExceedsMaxError,
  NonPositiveInputError,
  type Transaction,
} from "../../types/index.js";
import {
  IncompleteTransactionPlanError,
  TransactionPlanSignatureMismatchError,
} from "../error.js";
import {
  applySignatures,
  buildTransaction,
  buildTransactions,
  getPendingSignatureRequests,
} from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import type { TransactionPlan } from "../types.js";
import {
  prepareVaultV2Redeem,
  type VaultV2RedeemPlanParams,
} from "./redeem.js";

const deadline = 2_000_000_000n;
const spender = getChainAddress(1, "bundles.vaultBundlesV1");
const requirement = encodeVaultSharesPermit({
  vault: new Token({ address: IN_KIND_VAULT }),
  version: "vaultV2",
  chainId: 1,
  owner: IN_KIND_USER,
  spender,
  nonce: 0n,
  deadline,
  now: 1n,
});
const signature = serializeSignature({
  r: toHex(1n, { size: 32 }),
  s: toHex(2n, { size: 32 }),
  yParity: 0,
});
const id = "vaultV2Redeem:tokenPermit";
const inputs = {
  chainId: 1,
  account: IN_KIND_USER,
  vault: IN_KIND_VAULT,
  shares: 100n,
  deadline,
  referralFeePct: 0n,
  referralFeeRecipient: zeroAddress,
};
const pending: TransactionPlan = {
  version: 2,
  chainId: 1,
  account: IN_KIND_USER,
  expiresAt: Number(deadline),
  steps: [
    {
      id: "vaultV2Redeem",
      label: "Redeem vault shares",
      action: {
        type: "vaultV2Redeem",
        inputs,
        signatureRequestIds: { tokenPermit: id },
      },
    },
  ],
  signatureRequests: [
    {
      id,
      kind: "permit",
      typedData: requirement.action.typedData,
      args: { ...requirement.action.args, nonce: 0n },
    },
  ],
};

test("redeem requires a share token but no accrual snapshot or deployless option", () => {
  expectTypeOf<Pick<VaultV2RedeemPlanParams, "shareToken">>().toEqualTypeOf<{
    readonly shareToken: Token;
  }>();
  expectTypeOf<VaultV2RedeemPlanParams>().not.toHaveProperty("deployless");
});

describe("Vault V2 redeem intent validation", () => {
  const client = createPublicClient({
    chain: mainnet,
    transport: custom({
      request: async () => {
        throw new Error("Unexpected RPC during input validation");
      },
    }),
  });
  const params = {
    shareToken: new Token({ address: inputs.vault }),
    chainId: 1,
    account: IN_KIND_USER,
    shares: inputs.shares,
    expiresAt: Number(deadline),
  };

  test.each([0n, -1n])(
    "error: rejects non-positive shares %s before RPC",
    async (amount) => {
      await expect(
        prepareVaultV2Redeem(client, { ...params, shares: amount }),
      ).rejects.toBeInstanceOf(NonPositiveInputError);
    },
  );

  test("error: rejects uint256 overflow before RPC", async () => {
    await expect(
      prepareVaultV2Redeem(client, { ...params, shares: maxUint256 + 1n }),
    ).rejects.toBeInstanceOf(InputExceedsMaxError);
  });

  test("error: rejects the wrong client chain before contract reads", async () => {
    await expect(
      prepareVaultV2Redeem(client, { ...params, chainId: 8453 }),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
  });
});

test.each([
  { explicitNow: true, customExpiry: false },
  { explicitNow: true, customExpiry: true },
  { explicitNow: false, customExpiry: false },
  { explicitNow: false, customExpiry: true },
])(
  "redeem uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
  async ({ explicitNow, customExpiry }) => {
    const chainNow = 1_700_000_000n;
    const deviceNow = chainNow + 10_800n;
    const now = explicitNow ? chainNow : deviceNow;
    const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: IN_KIND_VAULT,
      abi: erc20Abi,
      functionName: "allowance",
      result: maxUint256,
    });
    const preparation = withChainTimestamp(deviceNow, () =>
      prepareVaultV2Redeem(handle.client, {
        shareToken: new Token({ address: IN_KIND_VAULT }),
        chainId: 1,
        account: IN_KIND_USER,
        shares: 100n,
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
    expect(plan.expiresAt).toBe(expiresAt ?? Number(now + 7_200n));
    expect(plan.signatureRequests).toEqual([]);
    expect(buildTransactions(plan)).toHaveLength(1);
  },
);

describe("Vault V2 redeem plan encoding", () => {
  test("stores insufficient-allowance approvals in shares, not assets", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: inputs.vault,
      abi: erc20Abi,
      functionName: "allowance",
      result: 0n,
    });
    const plan = await prepareVaultV2Redeem(handle.client, {
      shareToken: new Token({ address: inputs.vault }),
      chainId: 1,
      account: inputs.account,
      shares: inputs.shares,
      expiresAt: Number(deadline),
      supportSignature: false,
    });
    expect(plan.steps[0]?.action.type).toBe("erc20Approval");
    expect(plan.steps[0]?.action.inputs).toMatchObject({
      token: inputs.vault,
      shares: maxUint256,
    });
    expect(plan.steps[0]?.action.inputs).not.toHaveProperty("assets");
  });

  test.each(["request", "signature"])(
    "error: missing %s identifies the signature dependency",
    (missing) => {
      const plan =
        missing === "request" ? { ...pending, signatureRequests: [] } : pending;
      expect(() => buildTransactions(plan)).toThrow(
        IncompleteTransactionPlanError,
      );
      try {
        buildTransactions(plan);
      } catch (error) {
        expect(error).toMatchObject({ id });
      }
    },
  );

  test("behavior: serialization preserves permit calldata and origin", () => {
    const plan = {
      ...pending,
      calldataOrigin: "0xcafe" as const,
      signatureRequests: pending.signatureRequests.map((request) => ({
        ...request,
        signature,
      })),
    };
    const transactions = buildTransactions(plan);
    expect(
      buildTransactions(parseTransactionPlan(serializeTransactionPlan(plan))),
    ).toEqual(transactions);
    const expected = vaultV2Redeem({
      vault: { chainId: 1, address: inputs.vault },
      args: {
        shares: inputs.shares,
        userAddress: plan.account,
        deadline,
        requirementSignature: {
          action: requirement.action,
          args: {
            owner: plan.account,
            asset: inputs.vault,
            amount: maxUint256,
            nonce: 0n,
            deadline,
            signature,
          },
        },
      },
    });
    expect(transactions[0]).toEqual({
      ...expected,
      data: `${expected.data}cafe`,
    });
    expect(Object.isFrozen(transactions[0])).toBe(true);
    expect(transactions[0]).not.toHaveProperty("id");
    expect(transactions[0]).not.toHaveProperty("kind");
    expectTypeOf(buildTransaction(plan, plan.steps[0]!)).toEqualTypeOf<
      Readonly<Transaction>
    >();
  });

  test("default: builds without a permit when shares were approved", () => {
    const plan: TransactionPlan = {
      ...pending,
      signatureRequests: [],
      steps: [
        {
          ...pending.steps[0]!,
          action: {
            type: "vaultV2Redeem",
            inputs,
            signatureRequestIds: {},
          },
        },
      ],
    };
    expect(buildTransactions(plan)[0]?.data).toBe(
      vaultV2Redeem({
        vault: { chainId: 1, address: inputs.vault },
        args: {
          shares: inputs.shares,
          userAddress: plan.account,
          deadline,
        },
      }).data,
    );
  });

  test("behavior: exposes the share permit and validates it before applying signatures", async () => {
    expect(getPendingSignatureRequests(pending)).toEqual(
      pending.signatureRequests,
    );
    const client = createPublicClient({
      chain: mainnet,
      transport: custom({
        request: async () => {
          throw new Error("Unexpected RPC during request validation");
        },
      }),
    });
    expect(client.chain.id).toBe(pending.chainId);
    expect(applySignatures(pending, [])).toEqual(pending);
    expect(
      getPendingSignatureRequests({
        ...pending,
        signatureRequests: pending.signatureRequests.map((request) => ({
          ...request,
          signature,
        })),
      }),
    ).toEqual([]);
  });

  test("error: rejects a share permit below the exact redeemed amount", async () => {
    const request = pending.signatureRequests[0]!;
    const plan: TransactionPlan = {
      ...pending,
      signatureRequests: [
        {
          ...request,
          args: { ...request.args, amount: inputs.shares - 1n },
          typedData: {
            ...request.typedData,
            message: {
              ...request.typedData.message,
              value: inputs.shares - 1n,
            },
          },
        },
      ],
    };
    expect(() => getPendingSignatureRequests(plan)).toThrow(
      TransactionPlanSignatureMismatchError,
    );
    expect(() =>
      buildTransactions({
        ...plan,
        signatureRequests: plan.signatureRequests.map((permitRequest) => ({
          ...permitRequest,
          signature,
        })),
      }),
    ).toThrow(TransactionPlanSignatureMismatchError);
  });

  test("behavior: builds from the action's own chain and account, not the plan header", () => {
    const plan = {
      ...pending,
      signatureRequests: pending.signatureRequests.map((request) => ({
        ...request,
        signature,
      })),
    };
    expect(
      buildTransactions({ ...plan, chainId: 8453, account: zeroAddress }),
    ).toEqual(buildTransactions(plan));
  });
});
