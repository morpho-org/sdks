import { readdirSync, readFileSync } from "node:fs";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { vaultV1Deposit, vaultV2ForceRedeem } from "@morpho-org/morpho-sdk";
import { vaultBundlesV1Abi } from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import {
  getChainAddresses,
  UnsupportedChainIdError,
} from "@morpho-org/morpho-ts";
import {
  type Address,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CalldataAmountError,
  type CalldataCall,
  CalldataCallError,
  CalldataChainError,
  CalldataDecodeError,
  CalldataFeeError,
  type CalldataIntent,
  CalldataRecipientError,
  CalldataTargetError,
  verifyCalldata,
} from "./index.js";
import { sdkCall } from "./test/sdkCall.js";
import { vaultCases } from "./test/vault.fixtures.js";

const otherAccount = "0x3000000000000000000000000000000000000003";

describe("verifyCalldata", () => {
  const cases = Object.entries(vaultCases);
  it.each(cases)(
    "verifies %s and rejects another vault",
    (_name, { intent, calls }) => {
      const decoded = verifyCalldata(intent, calls);
      expect(decoded.map(({ call }) => call)).toEqual(calls);
      expect(() =>
        verifyCalldata({ ...intent, vault: otherAccount }, calls),
      ).toThrow(CalldataTargetError);
    },
  );

  const { intent: depositIntent, calls: depositCalls } = vaultCases.v1Deposit;

  it.each([
    { action: ["vault_v1.deposit"] },
    { action: { toString: null, valueOf: null } },
  ])("rejects non-string action $action without coercing it", ({ action }) => {
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...depositIntent, action }, depositCalls),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "action",
      }),
    );
  });

  it.each([
    vaultCases.v1Deposit,
    vaultCases.v2Deposit,
    vaultCases.v2Force,
    vaultCases.v2InKind,
  ])(
    "rejects a non-asset unit on $intent.action even when the value matches",
    ({ intent, calls }) => {
      expect(() =>
        verifyCalldata(
          // @ts-expect-error Test an unvalidated intent.
          { ...intent, amount: { ...intent.amount, unit: "shares" } },
          calls,
        ),
      ).toThrow(CalldataAmountError);
    },
  );

  it.each([{ id: 123 }, { id: undefined }, { kind: 123 }, { kind: undefined }])(
    "rejects invalid call metadata %o",
    (metadata) => {
      expect(() =>
        // @ts-expect-error Test an unvalidated API response.
        verifyCalldata(depositIntent, [{ ...depositCalls[0], ...metadata }]),
      ).toThrow(CalldataCallError);
    },
  );

  it.each([null, undefined, {}, "not an array"])(
    "rejects a non-array call list %s",
    (calls) => {
      expect(() =>
        // @ts-expect-error Test an unvalidated API response.
        verifyCalldata(depositIntent, calls),
      ).toThrow(CalldataCallError);
    },
  );

  it.each([{}, { unit: "al" }])(
    "rejects invalid withdrawal amount %o",
    (amount) => {
      const { intent, calls } = vaultCases.v1All;
      expect(() =>
        // @ts-expect-error Test an unvalidated intent.
        verifyCalldata({ ...intent, amount }, calls),
      ).toThrow(CalldataAmountError);
    },
  );

  it.each([null, undefined, 0, "not a call"])(
    "rejects malformed call entry %s with a typed error",
    (entry) => {
      expect(() =>
        verifyCalldata(depositIntent, [
          depositCalls[0],
          // @ts-expect-error Unvalidated API data can contain invalid entries.
          entry,
        ]),
      ).toThrow(CalldataCallError);
    },
  );

  it("resolves the contract on the intended chain", () => {
    expect(() =>
      verifyCalldata({ ...depositIntent, chain_id: 8453 }, depositCalls),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata({ ...depositIntent, chain_id: 0 }, depositCalls),
    ).toThrow(CalldataChainError);
    expect(() =>
      verifyCalldata(depositIntent, [{ ...depositCalls[0], to: otherAccount }]),
    ).toThrow(CalldataTargetError);
  });

  it.each([
    { chain_id: 1.5, unsupported: false },
    { chain_id: Number.MAX_SAFE_INTEGER, unsupported: true },
  ])(
    "rejects invalid or unsupported chain ID $chain_id",
    ({ chain_id, unsupported }) => {
      expect.hasAssertions();
      try {
        verifyCalldata({ ...depositIntent, chain_id }, depositCalls);
      } catch (error) {
        expect(error).toBeInstanceOf(CalldataChainError);
        expect(error).toHaveProperty("field", "chain_id");
        expect((error as Error).cause).toEqual(
          unsupported ? expect.any(UnsupportedChainIdError) : undefined,
        );
      }
    },
  );

  it.each(["0x1", zeroAddress] as const)(
    "rejects a malformed or zero account: %s",
    (address) => {
      expect(() =>
        verifyCalldata({ ...depositIntent, account: address }, depositCalls),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataRecipientError,
          field: "account",
        }),
      );
    },
  );

  it.each(["0x1", zeroAddress] as const)(
    "rejects a malformed or zero approval address: %s",
    (address) => {
      const [approval, deposit] = vaultCases.v1DepositApproval.calls;
      expect(() =>
        verifyCalldata(depositIntent, [{ ...approval, to: address }, deposit]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataTargetError,
          field: "to",
          callId: approval.id,
        }),
      );
    },
  );

  it("rejects a malformed vault before checking the call list", () => {
    expect(() =>
      verifyCalldata({ ...depositIntent, vault: "0x1" }, []),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "vault",
      }),
    );
  });

  it("rejects zero vault even when the intent and calldata agree", () => {
    const call = sdkCall(
      vaultV1Deposit({
        vault: {
          address: zeroAddress,
          chainId: depositIntent.chain_id,
          asset: depositIntent.asset,
        },
        args: {
          userAddress: depositIntent.account,
          amount: BigInt(depositIntent.amount.value),
          maxSharePrice: 10n ** 27n,
          deadline: 1820000000n,
        },
      }),
    );
    expect(() =>
      verifyCalldata({ ...depositIntent, vault: zeroAddress }, [call]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "vault",
      }),
    );
  });

  it.each([0.5, -1, 10_001])(
    "rejects an invalid fee cap before checking the call list: %s",
    (max_fee_bps) => {
      expect(() =>
        verifyCalldata({ ...depositIntent, max_fee_bps }, []),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataFeeError,
          field: "max_fee_bps",
        }),
      );
    },
  );

  it("checks the calldata rather than kind", () => {
    expect(
      verifyCalldata(depositIntent, [{ ...depositCalls[0], kind: "other" }])[0]
        ?.functionName,
    ).toBe("vaultBundlesV1Deposit");
    expect(() =>
      verifyCalldata(depositIntent, [
        { ...depositCalls[0], data: "0xdeadbeef" },
      ]),
    ).toThrow(CalldataDecodeError);
    expect(() =>
      verifyCalldata(depositIntent, [
        { ...depositCalls[0], data: `${depositCalls[0].data}0` },
      ]),
    ).toThrow(CalldataDecodeError);
    expect(() =>
      verifyCalldata(depositIntent, [
        ...depositCalls,
        ...depositCalls,
        ...depositCalls,
        ...depositCalls,
      ]),
    ).toThrow(CalldataCallError);
    expect(() => verifyCalldata(depositIntent, [])).toThrow(CalldataCallError);
  });

  it("checks the assets and native value", () => {
    expect(() =>
      verifyCalldata(
        { ...depositIntent, amount: { unit: "assets", value: "2" } },
        depositCalls,
      ),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(depositIntent, [{ ...depositCalls[0], value: "1000001" }]),
    ).toThrow(CalldataAmountError);
  });

  it("requires the original request to authorize the full native deposit value", () => {
    const value = depositIntent.amount.value;
    const payable = [{ ...depositCalls[0], value }];
    expect(() => verifyCalldata(depositIntent, payable)).toThrow(
      CalldataAmountError,
    );
    expect(() =>
      verifyCalldata(
        {
          ...depositIntent,
          funding: { type: "auto", max_native_assets: "1" },
        },
        payable,
      ),
    ).toThrow(CalldataAmountError);
    for (const type of ["unknown", undefined]) {
      const funding = { type, max_native_assets: value };
      expect(() =>
        // @ts-expect-error Test an unvalidated intent.
        verifyCalldata({ ...depositIntent, funding }, payable),
      ).toThrow(CalldataAmountError);
    }
    const asset = getChainAddresses(depositIntent.chain_id).wNative;
    if (!asset) throw new Error("Expected wrapped native token");
    const funding = { type: "native", max_native_assets: value } as const;
    expect(() =>
      verifyCalldata({ ...depositIntent, funding }, payable),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "asset",
        callId: payable[0]?.id,
      }),
    );
    expect(
      verifyCalldata(
        {
          ...depositIntent,
          asset,
          funding,
        },
        payable,
      )[0]?.call.value,
    ).toBe(value);
  });

  it("rejects a partial native value below the authorized full amount", () => {
    const call = depositCalls[0];
    const assets = depositIntent.amount.value;
    const asset = getChainAddresses(depositIntent.chain_id).wNative;
    if (asset == null) throw new Error("Expected wrapped native token");
    const intent = {
      ...depositIntent,
      asset,
      funding: { type: "native", max_native_assets: assets },
    } as const;
    expect(verifyCalldata(intent, [{ ...call, value: assets }])).toHaveLength(
      1,
    );
    expect(() =>
      verifyCalldata(intent, [
        { ...call, value: (BigInt(assets) - 1n).toString() },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
      }),
    );
  });

  it("checks the embedded deposit permit encoding without verifying the signature", () => {
    const [call] = depositCalls;
    const abi = vaultBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "vaultBundlesV1Deposit") {
      throw new Error("Expected deposit");
    }
    const [vault, assets, price, , ...rest] = decoded.args;
    const verifyPermit = (permit: (typeof decoded.args)[3]) =>
      verifyCalldata(depositIntent, [
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName: decoded.functionName,
            args: [vault, assets, price, permit, ...rest],
          }),
        },
      ]);
    const erc2612 = encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [123n, 27, zeroHash, zeroHash],
    );
    const permit2 = encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }],
      [1n, 123n, "0x1234"],
    );
    expect(() => verifyPermit({ kind: 1, data: erc2612 })).not.toThrow();
    expect(() => verifyPermit({ kind: 2, data: permit2 })).not.toThrow();
    const asset = getChainAddresses(depositIntent.chain_id).wNative;
    if (asset == null) throw new Error("Expected wrapped native token");
    const value = assets.toString();
    const native = {
      ...depositIntent,
      asset,
      funding: { type: "native", max_native_assets: value },
    } as const;
    const permitData = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [vault, assets, price, { kind: 1, data: erc2612 }, ...rest],
    });
    expect(() =>
      verifyCalldata(native, [{ ...call, value, data: permitData }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "permit",
      }),
    );
    const approval = {
      ...call,
      id: "approval",
      to: asset,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [call.to, assets],
      }),
    };
    expect(
      verifyCalldata({ ...depositIntent, asset }, [approval, call]),
    ).toHaveLength(2);
    for (const [intent, deposit] of [
      [
        { ...depositIntent, asset },
        { ...call, data: permitData },
      ],
      [native, { ...call, value }],
    ] as const) {
      expect(() => verifyCalldata(intent, [approval, deposit])).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "approval",
          callId: approval.id,
        }),
      );
    }
    expect(() => verifyPermit({ kind: 1, data: `${erc2612}00` })).toThrow(
      expect.objectContaining({
        constructor: CalldataDecodeError,
        field: "permit.data",
      }),
    );
    for (const kind of [1, 2]) {
      expect(() => verifyPermit({ kind, data: "0x" })).toThrow(
        CalldataDecodeError,
      );
    }
    expect(() => verifyPermit({ kind: 0, data: "0x12" })).toThrow(
      CalldataDecodeError,
    );
    expect(() => verifyPermit({ kind: 3, data: erc2612 })).toThrow(
      CalldataCallError,
    );
  });

  it("rejects the contract's invalid 100% referral fee even at the maximum caller cap", () => {
    const call = depositCalls[0];
    const abi = vaultBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "vaultBundlesV1Deposit")
      throw new Error("Expected deposit");
    const [vault, assets, price, permit, , , deadline] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [vault, assets, price, permit, 10n ** 18n, otherAccount, deadline],
    });
    expect(() =>
      verifyCalldata(
        {
          ...depositIntent,
          max_fee_bps: 10_000,
          referral_fee: { bps: 10_000, recipient: otherAccount },
        },
        [{ ...call, data }],
      ),
    ).toThrow(CalldataFeeError);
  });

  it("caps the referral fee and checks its destination", () => {
    const { intent, calls } = vaultCases.v2WithdrawFee;
    expect(() =>
      verifyCalldata({ ...intent, max_fee_bps: intent.max_fee_bps - 1 }, calls),
    ).toThrow(CalldataFeeError);
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          referral_fee: { ...intent.referral_fee, recipient: intent.account },
        },
        calls,
      ),
    ).toThrow(CalldataFeeError);
  });

  it("requires an approval to the deposit bundle that covers the deposit", () => {
    const { intent, calls } = vaultCases.v1DepositApproval;
    const [approval, deposit] = calls;
    expect(verifyCalldata(intent, calls)[0]?.args).toEqual([
      deposit.to,
      maxUint256,
    ]);
    const withApproval = (
      spender: Address,
      amount: bigint,
    ): readonly CalldataCall[] => [
      {
        ...approval,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, amount],
        }),
      },
      deposit,
    ];
    expect(
      verifyCalldata(intent, withApproval(deposit.to, 1_000_000n)),
    ).toHaveLength(2);
    expect(() =>
      verifyCalldata(intent, withApproval(deposit.to, 999_999n)),
    ).toThrow(CalldataAmountError);
    const chain = getChainAddresses(intent.chain_id);
    expect(() => verifyCalldata(intent, withApproval(deposit.to, 0n))).toThrow(
      CalldataCallError,
    );
    expect(() => verifyCalldata(intent, withApproval(chain.blue, 0n))).toThrow(
      CalldataTargetError,
    );
    expect(() =>
      verifyCalldata(intent, withApproval(otherAccount, maxUint256)),
    ).toThrow(CalldataTargetError);
  });

  it("checks both legs of a deposit approval reset", () => {
    const {
      intent,
      calls: [approval, deposit],
    } = vaultCases.v1DepositApproval;
    const reset = {
      ...approval,
      id: "reset",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [deposit.to, 0n],
      }),
    };
    expect(
      verifyCalldata(intent, [reset, approval, deposit]).map(
        ({ call }) => call,
      ),
    ).toEqual([reset, approval, deposit]);
    expect(() => verifyCalldata(intent, [approval, reset, deposit])).toThrow(
      CalldataCallError,
    );
    expect(() => verifyCalldata(intent, [reset, reset, deposit])).toThrow(
      CalldataCallError,
    );
    expect(() =>
      verifyCalldata(intent, [
        { ...reset, to: otherAccount },
        approval,
        deposit,
      ]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata(intent, [
        {
          ...reset,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [otherAccount, 0n],
          }),
        },
        approval,
        deposit,
      ]),
    ).toThrow(CalldataTargetError);
  });

  it.each([vaultCases.v1Withdraw, vaultCases.v2Force, vaultCases.v2InKind])(
    "binds the approval to the vault share token and the exit target for $intent.action",
    ({ intent, calls }) => {
      const exit = calls.at(-1);
      if (exit == null) throw new Error("Expected a vault exit call");
      const approval = (to: Address, spender: Address) => ({
        id: "approval",
        kind: "approval",
        to,
        value: "0",
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, maxUint256],
        }),
      });
      expect(
        verifyCalldata(intent, [approval(intent.vault, exit.to), exit]),
      ).toHaveLength(2);
      expect(() =>
        verifyCalldata(intent, [approval(otherAccount, exit.to), exit]),
      ).toThrow(CalldataTargetError);
      expect(() =>
        verifyCalldata(intent, [
          approval(intent.vault, getChainAddresses(intent.chain_id).blue),
          exit,
        ]),
      ).toThrow(CalldataTargetError);
    },
  );

  it("requires the account to receive any referral fee on an all withdrawal", () => {
    const { intent, calls } = vaultCases.v2WithdrawFee;
    const [call] = calls;
    const abi = vaultBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "vaultBundlesV1Withdraw")
      throw new Error("Expected bundle withdrawal");
    const [vault, , , permit, fee, , expiry] = decoded.args;
    const verify = (recipient: Address) =>
      verifyCalldata(
        {
          ...intent,
          amount: { unit: "all" },
          referral_fee: { ...intent.referral_fee, recipient },
        },
        [
          {
            ...call,
            data: encodeFunctionData({
              abi,
              functionName: decoded.functionName,
              args: [vault, 0n, 123n, permit, fee, recipient, expiry],
            }),
          },
        ],
      );
    expect(verify(intent.account)).toHaveLength(1);
    expect(() => verify(otherAccount)).toThrow(CalldataRecipientError);
  });

  it("checks recipients for nested calls without comparing an all-mode share count", () => {
    const { intent, calls } = vaultCases.v2ForceAll;
    const [call] = calls;
    const decoded = decodeFunctionData({ abi: vaultV2Abi, data: call.data });
    if (decoded.functionName !== "multicall")
      throw new Error("Expected multicall");
    const build = (
      receiver: Address,
      { owner, shares = 123n }: { owner: Address; shares?: bigint },
    ) => {
      const redeem = encodeFunctionData({
        abi: vaultV2Abi,
        functionName: "redeem",
        args: [shares, receiver, owner],
      });
      return [
        {
          ...call,
          data: encodeFunctionData({
            abi: vaultV2Abi,
            functionName: "multicall",
            args: [[...decoded.args[0].slice(0, -1), redeem]],
          }),
        },
      ];
    };
    expect(
      verifyCalldata(
        intent,
        build(intent.account, { owner: intent.account }),
      )[0]?.calls,
    ).toHaveLength(2);
    expect(() =>
      verifyCalldata(intent, build(otherAccount, { owner: intent.account })),
    ).toThrow(CalldataRecipientError);
    expect(() =>
      verifyCalldata(intent, build(intent.account, { owner: otherAccount })),
    ).toThrow(CalldataRecipientError);
    expect(() =>
      verifyCalldata(
        intent,
        build(intent.account, { owner: intent.account, shares: 0n }),
      ),
    ).toThrow(CalldataAmountError);
  });

  it("verifies SDK-built mixed adapter data and rejects a repeated empty route", () => {
    const {
      intent,
      calls: [fixture],
    } = vaultCases.v2ForceAll;
    const empty = { adapter: otherAccount, amount: 7n } as const;
    const market = {
      adapter: "0x0000000000000000000000000000000000001a02",
      amount: 13n,
      marketParams: new MarketParams({
        loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        oracle: otherAccount,
        irm: otherAccount,
        lltv: 860000000000000000n,
      }),
    } as const;
    const build = (
      deallocations: readonly (typeof empty | typeof market)[],
    ) => {
      const { data } = vaultV2ForceRedeem({
        vault: { address: intent.vault },
        args: {
          deallocations,
          redeem: { shares: 20n, recipient: intent.account },
          onBehalf: intent.account,
        },
      });
      return [{ ...fixture, data }];
    };
    const [decoded] = verifyCalldata(intent, build([empty, market]));
    expect(decoded?.calls?.map(({ functionName }) => functionName)).toEqual([
      "forceDeallocate",
      "forceDeallocate",
      "redeem",
    ]);
    expect(decoded?.calls?.[0]?.args[1]).toBe("0x");
    expect(decoded?.calls?.[1]?.args[1]).not.toBe("0x");
    expect(() =>
      verifyCalldata(
        { ...intent, asset: otherAccount },
        build([empty, market]),
      ),
    ).toThrow(CalldataTargetError);
    expect(verifyCalldata(intent, build([empty]))[0]?.calls).toHaveLength(2);
    expect(() => verifyCalldata(intent, build([empty, market, empty]))).toThrow(
      CalldataCallError,
    );
  });

  it("rejects a force-redeem leg on behalf of a different account", () => {
    const { intent } = vaultCases.v2ForceAll;
    const call = sdkCall(
      vaultV2ForceRedeem({
        vault: { address: intent.vault },
        args: {
          deallocations: [
            { adapter: otherAccount, amount: 7n },
            {
              adapter: "0x0000000000000000000000000000000000001a02",
              amount: 13n,
            },
          ],
          redeem: { shares: 20n, recipient: intent.account },
          onBehalf: intent.account,
        },
      }),
    );
    const abi = vaultV2Abi;
    const [decoded] = verifyCalldata(intent, [call]);
    expect(decoded?.calls).toHaveLength(3);
    const bundle = decodeFunctionData({ abi, data: call.data });
    if (bundle.functionName !== "multicall") {
      throw new Error(`Unexpected function: ${bundle.functionName}`);
    }
    const [leg, ...rest] = bundle.args[0];
    if (leg === undefined) throw new Error("Missing force-deallocation leg");
    const deallocation = decodeFunctionData({ abi, data: leg });
    if (deallocation.functionName !== "forceDeallocate") {
      throw new Error(`Unexpected function: ${deallocation.functionName}`);
    }
    const [adapter, adapterData, amount] = deallocation.args;
    const changedLeg = encodeFunctionData({
      abi,
      functionName: deallocation.functionName,
      args: [adapter, adapterData, amount, otherAccount],
    });
    const data = encodeFunctionData({
      abi,
      functionName: bundle.functionName,
      args: [[changedLeg, ...rest]],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataRecipientError,
        field: "onBehalf",
        callId: `${call.id}.0`,
      }),
    );
  });

  it("rejects a native value on a force redemption", () => {
    const {
      intent,
      calls: [call],
    } = vaultCases.v2ForceAll;
    expect(() => verifyCalldata(intent, [{ ...call, value: "1" }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
      }),
    );
  });

  it("rejects a force-redemption multicall without a deallocation", () => {
    const {
      intent,
      calls: [call],
    } = vaultCases.v2ForceAll;
    const abi = vaultV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "multicall")
      throw new Error("Expected multicall");
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [decoded.args[0].slice(-1)],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
        callId: call.id,
      }),
    );
  });

  it.each(["outer", "redeem", "deallocate"] as const)(
    "rejects a force redemption with the wrong %s selector",
    (change) => {
      const {
        intent,
        calls: [call],
      } = vaultCases.v2ForceAll;
      const abi = vaultV2Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "multicall")
        throw new Error("Expected multicall");
      const entries = decoded.args[0];
      const first = entries[0];
      const last = entries.at(-1);
      if (first == null || last == null)
        throw new Error("Expected nested calls");
      const index = change === "redeem" ? entries.length - 1 : 0;
      const data =
        change === "outer"
          ? last
          : encodeFunctionData({
              abi,
              functionName: decoded.functionName,
              args: [
                entries.map((leg, i) =>
                  i !== index ? leg : change === "redeem" ? first : last,
                ),
              ],
            });
      expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "function",
          callId: change === "outer" ? call.id : `${call.id}.${index}`,
        }),
      );
    },
  );

  it.each(["amount", "adapterData", "adapterData suffix"] as const)(
    "rejects invalid force-deallocation %s",
    (field) => {
      const {
        intent,
        calls: [call],
      } = vaultCases.v2ForceAll;
      const abi = vaultV2Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "multicall")
        throw new Error("Expected multicall");
      const [leg, ...rest] = decoded.args[0];
      if (leg === undefined) throw new Error("Expected deallocation");
      const part = decodeFunctionData({ abi, data: leg });
      if (part.functionName !== "forceDeallocate")
        throw new Error("Expected forceDeallocate");
      const [adapter, adapterData, amount, owner] = part.args;
      const modified = encodeFunctionData({
        abi,
        functionName: part.functionName,
        args: [
          adapter,
          field === "adapterData"
            ? "0x01"
            : field === "adapterData suffix"
              ? `${adapterData}00`
              : adapterData,
          field === "amount" ? 0n : amount,
          owner,
        ],
      });
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: [[modified, ...rest]],
      });
      const verify = () => verifyCalldata(intent, [{ ...call, data }]);
      expect(verify).toThrow(
        expect.objectContaining({
          constructor:
            field === "amount" ? CalldataAmountError : CalldataDecodeError,
          field: field === "amount" ? field : "adapterData",
          callId: `${call.id}.0`,
        }),
      );
      expect(verify).not.toThrow(
        expect.objectContaining({ cause: expect.any(CalldataDecodeError) }),
      );
    },
  );

  it("checks the market in an in-kind redemption", () => {
    const { intent, calls } = vaultCases.v2InKind;
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          market: `8453:${intent.market.slice(2) as `0x${string}`}`,
        },
        calls,
      ),
    ).toThrow(CalldataTargetError);
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...intent, market: 1 }, calls),
    ).toThrow(CalldataTargetError);
  });

  it("reports a missing withdrawal amount as an amount.unit error", () => {
    const {
      intent: { amount: _amount, ...intent },
      calls,
    } = vaultCases.v1Withdraw;
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata(intent, calls),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount.unit",
        callId: calls[1].id,
      }),
    );
  });

  it("requires the action-specific intent fields", () => {
    expectTypeOf<
      Extract<CalldataIntent, { action: "vault_v1.deposit" }>["funding"]
    >().not.toBeUndefined();
    expectTypeOf<{
      action: "vault_v1.deposit";
    }>().not.toExtend<CalldataIntent>();
  });
});

it("imports morpho-sdk through the ABI subpath only", () => {
  const src = new URL("./", import.meta.url);
  const imports = readdirSync(src, { encoding: "utf8", recursive: true })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .flatMap((file) => [
      ...readFileSync(new URL(file, src), "utf8").matchAll(
        /["'](@morpho-org\/morpho-sdk[^"']*)["']/g,
      ),
    ])
    .map((match) => match[1]);
  expect(imports.length).toBeGreaterThan(0);
  expect(new Set(imports)).toEqual(new Set(["@morpho-org/morpho-sdk/abis"]));
});
