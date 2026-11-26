import {
  vaultV1Deposit,
  vaultV1Redeem,
  vaultV1Withdraw,
  vaultV2Deposit,
  vaultV2ForceWithdraw,
  vaultV2InKindRedeem,
  vaultV2Withdraw,
} from "@morpho-org/morpho-sdk";
import {
  BundlesPermitKind,
  vaultBundlesV1Abi,
  vaultExitBundlesV1Abi,
} from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  maxUint256,
  serializeSignature,
  toHex,
  zeroHash,
} from "viem";
import { expect, it } from "vitest";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataChainError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataTargetError,
  verifyCalldata,
} from "./index.js";
import { sdkCall } from "./test/sdkCall.js";
import type { CalldataCall, CalldataIntent } from "./types.js";

const account = "0x1000000000000000000000000000000000000001";
const distinct = "0x1000000000000000000000000000000000000002";
const vault = {
  chainId: 1,
  address: "0x2000000000000000000000000000000000000002",
} as const;
const asset = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;
const market = new MarketParams({
  loanToken: asset,
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: distinct,
  irm: distinct,
  lltv: 860000000000000000n,
});
const args = { userAddress: account, deadline: 1820000000n } as const;
const feeArgs = {
  referralFeePct: 5000000000000000n,
  referralFeeRecipient: distinct,
} as const;
const baseIntent = {
  account,
  asset,
  vault: vault.address,
  chain_id: vault.chainId,
  max_fee_bps: 50,
  amount: { unit: "assets", value: "1000000" },
} as const;
const referred = {
  ...baseIntent,
  referral_fee: { bps: 50, recipient: distinct },
} as const;
const deposit = {
  vault: { ...vault, asset },
  args: { ...args, ...feeArgs, amount: 1000000n, maxSharePrice: 10n ** 27n },
};
const withdraw = { vault, args: { ...args, ...feeArgs, amount: 1000000n } };
const funding = { type: "erc20" } as const;

it.each([
  ["vault_v1.deposit", vaultV1Deposit(deposit)],
  ["vault_v2.deposit", vaultV2Deposit(deposit)],
] as const)("binds %s approvals to the requested asset", (action, tx) => {
  const call = sdkCall(tx);
  const intent = { ...referred, action, funding } as const;
  const approval = {
    ...call,
    id: "approval",
    to: asset,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [call.to, maxUint256],
    }),
  };
  expect(verifyCalldata(intent, [approval, call])).toHaveLength(2);
  expect(() =>
    verifyCalldata({ ...intent, asset: distinct }, [approval, call]),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "approval.token",
      callId: approval.id,
    }),
  );
  const nftApproval: CalldataCall = {
    ...approval,
    to: distinct,
    data: encodeFunctionData({
      abi: erc721Abi,
      functionName: "approve",
      args: [call.to, maxUint256],
    }),
  };
  expect(nftApproval.data).toBe(approval.data);
  expect(() => verifyCalldata(intent, [nftApproval, call])).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "approval.token",
      callId: approval.id,
    }),
  );
  const reset = {
    ...approval,
    id: "reset",
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [call.to, 0n],
    }),
  };
  expect(verifyCalldata(intent, [reset, approval, call])).toHaveLength(3);
  expect(() => verifyCalldata(intent, [approval, approval, call])).toThrow(
    expect.objectContaining({
      constructor: CalldataAmountError,
      field: "approval.amount",
    }),
  );
  expect(() =>
    verifyCalldata(intent, [{ ...reset, to: distinct }, approval, call]),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "approval.token",
      callId: reset.id,
    }),
  );
});

function permit({
  token,
  amount,
}: {
  token: typeof asset | typeof vault.address;
  amount: bigint;
}) {
  return {
    action: {
      type: "permit",
      args: {
        spender: getChainAddress(vault.chainId, "bundles.vaultBundlesV1"),
        amount,
        deadline: args.deadline,
      },
    },
    args: {
      owner: account,
      asset: token,
      amount,
      nonce: 0n,
      deadline: args.deadline,
      signature: serializeSignature({
        v: 27n,
        r: toHex(1n, { size: 32 }),
        s: toHex(1n, { size: 32 }),
      }),
    },
  } as const;
}

it("verifies a vault deposit with an SDK-encoded ERC-2612 permit", () => {
  const call = sdkCall(
    vaultV1Deposit({
      ...deposit,
      args: {
        ...deposit.args,
        requirementSignature: permit({
          token: asset,
          amount: deposit.args.amount,
        }),
      },
    }),
  );
  expect(
    verifyCalldata({ ...referred, action: "vault_v1.deposit", funding }, [
      call,
    ])[0]?.args?.[3],
  ).toMatchObject({ kind: BundlesPermitKind.ERC2612 });
});

it.each(["shares", "all"] as const)(
  "checks that a %s vault redemption's permit or approval covers the encoded shares",
  (unit) => {
    const shares = 100n;
    const intent = {
      ...baseIntent,
      action: "vault_v1.withdraw",
      amount: unit === "all" ? { unit } : { unit, value: shares.toString() },
    } as const;
    const call = sdkCall(
      vaultV1Redeem({
        vault,
        args: {
          ...args,
          shares,
          requirementSignature: permit({
            token: vault.address,
            amount: shares,
          }),
        },
      }),
    );
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
    const decoded = decodeFunctionData({
      abi: vaultBundlesV1Abi,
      data: call.data,
    });
    if (decoded.functionName !== "vaultBundlesV1Withdraw") {
      throw new Error("Expected a share withdrawal");
    }
    const [target, assets, encodedShares, sharesPermit, ...rest] = decoded.args;
    const verifyAmounts = (changedAssets: bigint, changedShares: bigint) =>
      verifyCalldata(intent, [
        {
          ...call,
          data: encodeFunctionData({
            abi: vaultBundlesV1Abi,
            functionName: decoded.functionName,
            args: [target, changedAssets, changedShares, sharesPermit, ...rest],
          }),
        },
      ]);
    expect(() => verifyAmounts(1n, encodedShares)).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
      }),
    );
    expect(() =>
      verifyAmounts(assets, unit === "all" ? 0n : encodedShares - 1n),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
      }),
    );
    expect(() =>
      verifyCalldata(intent, [
        {
          ...call,
          data: encodeFunctionData({
            abi: vaultBundlesV1Abi,
            functionName: decoded.functionName,
            args: [
              target,
              assets,
              encodedShares,
              { ...sharesPermit, value: shares - 1n },
              ...rest,
            ],
          }),
        },
      ]),
    ).toThrow(CalldataAmountError);

    const redeem = sdkCall(vaultV1Redeem({ vault, args: { ...args, shares } }));
    const approve = (amount: bigint) => ({
      ...redeem,
      id: "approval",
      to: vault.address,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [redeem.to, amount],
      }),
    });
    expect(verifyCalldata(intent, [approve(shares), redeem])).toHaveLength(2);
    expect(() =>
      verifyCalldata(intent, [approve(shares - 1n), redeem]),
    ).toThrow(CalldataAmountError);
  },
);

const cases = [
  {
    intent: { ...referred, action: "vault_v1.deposit", funding },
    tx: vaultV1Deposit(deposit),
  },
  {
    intent: { ...referred, action: "vault_v2.deposit", funding },
    tx: vaultV2Deposit(deposit),
  },
  {
    intent: { ...referred, action: "vault_v1.withdraw" },
    tx: vaultV1Withdraw(withdraw),
  },
  {
    intent: { ...referred, action: "vault_v2.withdraw" },
    tx: vaultV2Withdraw(withdraw),
  },
  {
    intent: { ...referred, action: "vault_v2.force_withdraw" },
    tx: vaultV2ForceWithdraw({
      vault,
      args: {
        ...args,
        ...feeArgs,
        adapter: distinct,
        exitAssets: 1000000n,
        minSharePriceE27: 10n ** 27n,
      },
    }),
  },
  {
    intent: {
      ...baseIntent,
      action: "vault_v2.redeem_in_kind",
      market: `1:${market.id as `0x${string}`}`,
    },
    tx: vaultV2InKindRedeem({
      vault,
      args: {
        ...args,
        adapter: distinct,
        amount: 1000000n,
        marketParamsList: [market],
      },
    }),
  },
] as const satisfies readonly {
  intent: CalldataIntent;
  tx: Parameters<typeof sdkCall>[0];
}[];

it("rejects a nonzero share amount on an exact-asset Vault withdrawal", () => {
  const { intent, tx } = cases[2];
  const call = sdkCall(tx);
  const abi = vaultBundlesV1Abi;
  const decoded = decodeFunctionData({ abi, data: call.data });
  if (decoded.functionName !== "vaultBundlesV1Withdraw") {
    throw new Error("Expected withdraw");
  }
  const [target, assets, , ...rest] = decoded.args;
  const data = encodeFunctionData({
    abi,
    functionName: decoded.functionName,
    args: [target, assets, 1n, ...rest],
  });
  expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
    expect.objectContaining({
      constructor: CalldataAmountError,
      field: "amount",
    }),
  );
});

it.each(["assets", "shares"] as const)(
  "rejects a zero requested Vault withdrawal in %s using the opposite slot",
  (unit) => {
    const { intent, tx } = cases[2];
    const call = sdkCall(tx);
    const abi = vaultBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "vaultBundlesV1Withdraw") {
      throw new Error("Expected withdraw");
    }
    const [target, , , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [
        target,
        unit === "shares" ? 1n : 0n,
        unit === "assets" ? 1n : 0n,
        ...rest,
      ],
    });
    const request =
      unit === "assets"
        ? ({ ...intent, amount: { unit: "assets", value: "0" } } as const)
        : ({ ...intent, amount: { unit: "shares", value: "0" } } as const);
    expect(() => verifyCalldata(request, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
      }),
    );
  },
);

it.each(["assets", "shares"] as const)(
  "rejects a zero requested Vault withdrawal in %s with both encoded amounts zero",
  (unit) => {
    const value = withdraw.args.amount;
    const tx =
      unit === "assets"
        ? vaultV1Withdraw(withdraw)
        : vaultV1Redeem({
            vault,
            args: { ...args, ...feeArgs, shares: value },
          });
    const call = sdkCall(tx);
    const intent = { ...referred, action: "vault_v1.withdraw" } as const;
    const request = (amount: bigint) =>
      unit === "assets"
        ? ({
            ...intent,
            amount: { unit: "assets", value: amount.toString() },
          } as const)
        : ({
            ...intent,
            amount: { unit: "shares", value: amount.toString() },
          } as const);
    expect(verifyCalldata(request(value), [call])).toHaveLength(1);
    const abi = vaultBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "vaultBundlesV1Withdraw") {
      throw new Error("Expected withdraw");
    }
    const [target, , , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [target, 0n, 0n, ...rest],
    });
    expect(() => verifyCalldata(request(0n), [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
        callId: call.id,
      }),
    );
  },
);

it("rejects a deposit whose requested and encoded assets are both zero", () => {
  const { intent, tx } = cases[0];
  const call = sdkCall(tx);
  const abi = vaultBundlesV1Abi;
  const decoded = decodeFunctionData({ abi, data: call.data });
  if (decoded.functionName !== "vaultBundlesV1Deposit") {
    throw new Error("Expected deposit");
  }
  const [target, , ...rest] = decoded.args;
  const data = encodeFunctionData({
    abi,
    functionName: decoded.functionName,
    args: [target, 0n, ...rest],
  });
  expect(() =>
    verifyCalldata({ ...intent, amount: { unit: "assets", value: "0" } }, [
      { ...call, data },
    ]),
  ).toThrow(
    expect.objectContaining({
      constructor: CalldataAmountError,
      field: "amount",
    }),
  );
});

it.each([cases[4], cases[5]])(
  "rejects a signed zero share permit for $intent.action",
  ({ intent, tx }) => {
    const call = sdkCall(tx);
    const abi = vaultExitBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    const data = (() => {
      switch (decoded.functionName) {
        case "vaultExitBundlesV1ForceWithdrawVaultV2": {
          const [target, adapter, assets, price, sharePermit, ...rest] =
            decoded.args;
          return encodeFunctionData({
            abi,
            functionName: decoded.functionName,
            args: [
              target,
              adapter,
              assets,
              price,
              { ...sharePermit, v: 27 },
              ...rest,
            ],
          });
        }
        case "vaultExitBundlesV1InKindRedemptionVaultV2": {
          const [target, adapter, markets, assets, sharePermit, ...rest] =
            decoded.args;
          return encodeFunctionData({
            abi,
            functionName: decoded.functionName,
            args: [
              target,
              adapter,
              markets,
              assets,
              { ...sharePermit, v: 27 },
              ...rest,
            ],
          });
        }
        default:
          throw new Error("Expected Vault exit");
      }
    })();
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "permit.value",
      }),
    );
  },
);

it("rejects a second encoded market on an in-kind redemption", () => {
  const { intent, tx } = cases[5];
  const call = sdkCall(tx);
  const abi = vaultExitBundlesV1Abi;
  const decoded = decodeFunctionData({ abi, data: call.data });
  if (decoded.functionName !== "vaultExitBundlesV1InKindRedemptionVaultV2") {
    throw new Error("Expected in-kind redemption");
  }
  const [target, adapter, markets, ...rest] = decoded.args;
  const data = encodeFunctionData({
    abi,
    functionName: decoded.functionName,
    args: [target, adapter, [...markets, ...markets], ...rest],
  });
  expect(verifyCalldata(intent, [call])).toHaveLength(1);
  expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
    expect.objectContaining({
      constructor: CalldataTargetError,
      field: "market",
    }),
  );
});

it("rejects an unsigned nonzero share permit alongside a Vault approval", () => {
  const { intent, tx } = cases[2];
  const call = sdkCall(tx);
  const abi = vaultBundlesV1Abi;
  const decoded = decodeFunctionData({ abi, data: call.data });
  if (decoded.functionName !== "vaultBundlesV1Withdraw") {
    throw new Error("Expected withdraw");
  }
  const [target, assets, shares, sharePermit, ...rest] = decoded.args;
  const approval = {
    ...call,
    id: "approval",
    to: target,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [call.to, maxUint256],
    }),
  };
  const data = encodeFunctionData({
    abi,
    functionName: decoded.functionName,
    args: [target, assets, shares, { ...sharePermit, value: 1n }, ...rest],
  });
  expect(verifyCalldata(intent, [approval, call])).toHaveLength(2);
  expect(() => verifyCalldata(intent, [approval, { ...call, data }])).toThrow(
    expect.objectContaining({
      constructor: CalldataCallError,
      field: "approval",
      callId: approval.id,
    }),
  );
});

it.each([
  { current: cases[0], different: cases[2] },
  { current: cases[2], different: cases[0] },
  { current: cases[4], different: cases[5] },
  { current: cases[5], different: cases[4] },
])(
  "rejects the wrong Vault bundle selector for $current.intent.action",
  ({ current, different }) => {
    const call = sdkCall(current.tx);
    expect(() =>
      verifyCalldata(current.intent, [
        { ...call, data: sdkCall(different.tx).data },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
      }),
    );
  },
);

it.each([cases[0], cases[1]])(
  "rejects disabled share-price ceilings for $intent.action",
  ({ intent, tx }) => {
    const call = sdkCall(tx);
    const abi = vaultBundlesV1Abi;
    const { functionName, args: decoded } = decodeFunctionData({
      abi,
      data: call.data,
    });
    if (functionName !== "vaultBundlesV1Deposit") {
      throw new Error("Expected a deposit");
    }
    const [target, assets, , ...rest] = decoded;
    for (const request of [intent, { ...intent, slippage_bps: 0 }]) {
      expect(verifyCalldata(request, [call])).toHaveLength(1);
      for (const ceiling of [0n, maxUint256]) {
        const data = encodeFunctionData({
          abi,
          functionName,
          args: [target, assets, ceiling, ...rest],
        });
        expect(() => verifyCalldata(request, [{ ...call, data }])).toThrow(
          expect.objectContaining({
            constructor: CalldataAmountError,
            field: "max_share_price",
            callId: call.id,
          }),
        );
      }
    }
  },
);

it("rejects a zero share-price floor for exact-asset force-withdraw", () => {
  const { intent, tx } = cases[4];
  const call = sdkCall(tx);
  const abi = vaultExitBundlesV1Abi;
  const { functionName, args: decoded } = decodeFunctionData({
    abi,
    data: call.data,
  });
  if (functionName !== "vaultExitBundlesV1ForceWithdrawVaultV2") {
    throw new Error("Expected an exact-asset force-withdraw");
  }
  const [target, adapter, assets, , ...rest] = decoded;
  const data = encodeFunctionData({
    abi,
    functionName,
    args: [target, adapter, assets, 0n, ...rest],
  });
  for (const request of [intent, { ...intent, slippage_bps: 0 }]) {
    expect(verifyCalldata(request, [call])).toHaveLength(1);
    expect(() => verifyCalldata(request, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "min_share_price",
        callId: call.id,
      }),
    );
  }
});

it.each([
  { mode: "with an approval", withApproval: true, error: CalldataCallError },
  {
    mode: "without an approval",
    withApproval: false,
    error: CalldataAmountError,
  },
])("rejects a signed zero share permit $mode", ({ withApproval, error }) => {
  const shares = 100n;
  const call = sdkCall(
    vaultV1Withdraw({
      ...withdraw,
      args: {
        ...withdraw.args,
        requirementSignature: permit({ token: vault.address, amount: shares }),
      },
    }),
  );
  const abi = vaultBundlesV1Abi;
  const decoded = decodeFunctionData({ abi, data: call.data });
  if (decoded.functionName !== "vaultBundlesV1Withdraw")
    throw new Error("Expected withdraw");
  const [target, assets, encodedShares, signature, ...rest] = decoded.args;
  const approval = {
    ...call,
    id: "approval",
    to: vault.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [call.to, maxUint256],
    }),
  };
  const intent = {
    ...referred,
    action: "vault_v1.withdraw",
  } as const;
  if (!withApproval) {
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
  }
  expect(() =>
    verifyCalldata(intent, [
      ...(withApproval ? [approval] : []),
      {
        ...call,
        data: encodeFunctionData({
          abi,
          functionName: decoded.functionName,
          args: [
            target,
            assets,
            encodedShares,
            { ...signature, value: 0n },
            ...rest,
          ],
        }),
      },
    ]),
  ).toThrow(error);
});

it("rejects a deposit fee above the requested rate but within max_fee_bps", () => {
  const intent = { ...referred, action: "vault_v1.deposit", funding } as const;
  const call = sdkCall(vaultV1Deposit(deposit));
  expect(() => verifyCalldata(intent, [call])).not.toThrow();
  expect(() =>
    verifyCalldata(
      { ...intent, referral_fee: { ...intent.referral_fee, bps: 49 } },
      [call],
    ),
  ).toThrow(CalldataFeeError);
});

it.each(cases)(
  "verifies SDK-built $intent.action and rejects modified parameters",
  ({ intent, tx }) => {
    const call = sdkCall(tx);
    expect(
      verifyCalldata(intent, [call]).map((decoded) => decoded.call),
    ).toEqual([call]);
    const { asset: _asset, ...missingAsset } = intent;
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata(missingAsset, [call]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "asset",
        callId: call.id,
      }),
    );
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...intent, asset: "0x123" as string }, [call]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "asset",
        callId: call.id,
      }),
    );
    expect(() => verifyCalldata({ ...intent, chain_id: 0 }, [call])).toThrow(
      CalldataChainError,
    );
    expect(() =>
      verifyCalldata({ ...intent, vault: distinct }, [call]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata({ ...intent, amount: { ...intent.amount, value: "1" } }, [
        call,
      ]),
    ).toThrow(CalldataAmountError);
    expect(() => verifyCalldata(intent, [{ ...call, to: distinct }])).toThrow(
      CalldataTargetError,
    );
    expect(() =>
      verifyCalldata(intent, [{ ...call, data: "0xdeadbeef" }]),
    ).toThrow(CalldataDecodeError);
    expect(() => verifyCalldata(intent, [{ ...call, value: "1" }])).toThrow(
      CalldataAmountError,
    );
    expect(() => verifyCalldata(intent, [])).toThrow(CalldataCallError);
    if ("referral_fee" in intent) {
      expect(() =>
        verifyCalldata({ ...intent, max_fee_bps: 49 }, [call]),
      ).toThrow(CalldataFeeError);
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            referral_fee: { ...intent.referral_fee, recipient: account },
          },
          [call],
        ),
      ).toThrow(CalldataFeeError);
    }
    if (intent.action === "vault_v2.redeem_in_kind") {
      expect(() =>
        verifyCalldata({ ...intent, asset: distinct }, [call]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataTargetError,
          field: "asset",
          callId: call.id,
        }),
      );
      expect(() =>
        verifyCalldata({ ...intent, market: `1:${zeroHash}` }, [call]),
      ).toThrow(CalldataTargetError);
    }
  },
);
