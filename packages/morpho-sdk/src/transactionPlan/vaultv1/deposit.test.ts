import { Token } from "@morpho-org/blue-sdk";
import { getPermitTypedData } from "@morpho-org/blue-sdk-viem";
import { getChainAddress, Time } from "@morpho-org/morpho-ts";
import { createMockClient, mockRead } from "@morpho-org/test/mock";
import {
  erc20Abi,
  maxUint256,
  serializeSignature,
  toHex,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import { describe, expect, test } from "vitest";
import {
  IN_KIND_ASSET,
  IN_KIND_USER,
  IN_KIND_VAULT,
  inKindVaultV1Data,
} from "../../../test/fixtures/inKindRedeem.js";
import { withChainTimestamp } from "../../../test/helpers/time.js";
import { vaultV1Deposit } from "../../actions/vaultV1/deposit.js";
import { morphoViemExtension } from "../../client/index.js";
import {
  ChainIdMismatchError,
  ExpiredDeadlineError,
} from "../../types/index.js";
import { IncompleteTransactionPlanError } from "../error.js";
import { buildTransactions } from "../plan.js";
import { parseTransactionPlan, serializeTransactionPlan } from "../serde.js";
import type { Step, TransactionPlan } from "../types.js";
import { prepareVaultV1Deposit } from "./deposit.js";

const vaultData = inKindVaultV1Data();
const params = {
  vault: vaultData,
  chainId: 1,
  account: IN_KIND_USER,
  assets: 100n,
};

describe("prepareVaultV1Deposit", () => {
  test.each([
    { explicitNow: true, customExpiry: false },
    { explicitNow: true, customExpiry: true },
    { explicitNow: false, customExpiry: false },
    { explicitNow: false, customExpiry: true },
  ])(
    "uses reference time with explicitNow=$explicitNow and customExpiry=$customExpiry",
    async ({ explicitNow, customExpiry }) => {
      const chainNow = 1_700_000_000n;
      const deviceNow = chainNow + 10_800n;
      const now = explicitNow ? chainNow : deviceNow;
      const expiresAt = customExpiry ? Number(chainNow + 1_200n) : undefined;
      const mock = createMockClient(mainnet);
      mockRead(mock, {
        address: vaultData.asset,
        abi: erc20Abi,
        functionName: "allowance",
        result: maxUint256,
      });
      const preparation = withChainTimestamp(deviceNow, () =>
        prepareVaultV1Deposit(mock.client, {
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
    const plan = await prepareVaultV1Deposit(handle.client, {
      ...params,
      expiresAt,
      slippageTolerance,
      referralFee: { bps: 250, recipient: IN_KIND_USER },
    });
    expect(plan.steps.map(({ id, action }) => [id, action.type])).toEqual([
      ["vaultV1Deposit:approval", "erc20Approval"],
      ["vaultV1Deposit", "vaultV1Deposit"],
    ]);
    expect(plan.steps[0]?.action.inputs).toMatchObject({
      spender: getChainAddress(1, "bundles.vaultBundlesV1"),
      assets: maxUint256,
    });
    expect(plan.signatureRequests).toEqual([]);
    const entityTx = handle.client
      .extend(morphoViemExtension())
      .morpho.vaultV1(params.vault.address, params.chainId)
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
    expect(tx.action).toEqual(entityTx.action);
  });

  test("[INV-05] rejects the wrong chain before a failing allowance read", async () => {
    const handle = createMockClient(mainnet);
    const request = handle.request.getMockImplementation()!;
    handle.request.mockImplementation(async (args) => {
      if (args.method === "eth_chainId") return "0x2105";
      if (args.method === "eth_call") throw new Error("allowance read failed");
      return request(args);
    });
    await expect(
      prepareVaultV1Deposit(handle.client, params),
    ).rejects.toBeInstanceOf(ChainIdMismatchError);
    expect(
      handle.request.mock.calls.some(([call]) => call.method === "eth_call"),
    ).toBe(false);
  });

  test("omits token prerequisites when allowance covers the deposit", async () => {
    const handle = createMockClient(mainnet);
    mockRead(handle, {
      address: vaultData.asset,
      abi: erc20Abi,
      functionName: "allowance",
      result: params.assets,
    });
    const plan = await prepareVaultV1Deposit(handle.client, {
      ...params,
      supportSignature: true,
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({
      id: "vaultV1Deposit",
      label: "Deposit into vault",
      action: {
        type: "vaultV1Deposit",
        signatureRequestIds: {},
        inputs: {
          assets: params.assets,
          asset: vaultData.asset,
          chainId: params.chainId,
          account: params.account,
        },
      },
    });
    expect(plan.signatureRequests).toEqual([]);
    expect(Object.isFrozen(plan)).toBe(true);
  });
});

describe("vaultV1Deposit plan step", () => {
  const spender = getChainAddress(1, "bundles.vaultBundlesV1");
  const inputs = {
    chainId: 1,
    account: IN_KIND_USER,
    vault: IN_KIND_VAULT,
    asset: IN_KIND_ASSET,
    maxSharePrice: 10n ** 27n,
    assets: 100n,
    deadline: 2_000_000_000n,
    referralFeePct: 0n,
    referralFeeRecipient: zeroAddress,
  };
  const permitArgs = {
    spender,
    amount: inputs.assets,
    deadline: inputs.deadline,
    nonce: 0n,
  };
  const typedData = getPermitTypedData(
    {
      erc20: new Token({ address: IN_KIND_ASSET, name: "Asset" }),
      owner: IN_KIND_USER,
      allowance: permitArgs.amount,
      ...permitArgs,
    },
    1,
  );
  const signature = serializeSignature({
    r: toHex(1n, { size: 32 }),
    s: toHex(2n, { size: 32 }),
    yParity: 0,
  });
  const depositStep = {
    id: "vaultV1Deposit",
    label: "Deposit into vault",
    action: {
      type: "vaultV1Deposit",
      inputs,
      signatureRequestIds: { tokenPermit: "vaultV1Deposit:tokenPermit" },
    },
  } as const satisfies Step;
  const pendingPlan: TransactionPlan = {
    version: 2,
    chainId: 1,
    account: IN_KIND_USER,
    expiresAt: Number(inputs.deadline),
    steps: [depositStep],
    signatureRequests: [
      {
        id: "vaultV1Deposit:tokenPermit",
        kind: "permit",
        typedData,
        args: permitArgs,
      },
    ],
  };
  const completePlan = {
    ...pendingPlan,
    signatureRequests: pendingPlan.signatureRequests.map((request) => ({
      ...request,
      signature,
    })),
  };

  test("default: builds the same transaction as the vaultV1Deposit action", () => {
    const { asset, chainId, account, assets, ...args } = inputs;
    const expected = vaultV1Deposit({
      vault: { chainId, address: IN_KIND_VAULT, asset },
      args: {
        ...args,
        amount: assets,
        userAddress: account,
        requirementSignature: {
          action: { type: "permit", args: permitArgs, typedData },
          args: {
            owner: account,
            asset,
            amount: inputs.assets,
            nonce: 0n,
            deadline: inputs.deadline,
            signature,
          },
        },
      },
    });
    const [built] = buildTransactions(completePlan);
    expect(built?.data).toBe(expected.data);
    expect(built?.to).toBe(expected.to);
    expect(built?.action).toEqual(expected.action);
  });

  test("behavior: a serialized and parsed plan builds the same bytes", () => {
    const withOrigin: TransactionPlan = {
      ...completePlan,
      calldataOrigin: "0xcafe",
    };
    const restored = parseTransactionPlan(serializeTransactionPlan(withOrigin));
    expect(restored).toEqual(withOrigin);
    expect(buildTransactions(restored)).toEqual(buildTransactions(withOrigin));
  });

  test("error: IncompleteTransactionPlanError names an unsigned or absent request", () => {
    expect(() => buildTransactions(pendingPlan)).toThrow(
      new IncompleteTransactionPlanError("vaultV1Deposit:tokenPermit"),
    );
    expect(() =>
      buildTransactions({ ...completePlan, signatureRequests: [] }),
    ).toThrow(new IncompleteTransactionPlanError("vaultV1Deposit:tokenPermit"));
  });
});
