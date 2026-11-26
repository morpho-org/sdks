import {
  MarketUtils,
  midnightAbi,
  midnightBundlesV2Abi,
} from "@morpho-org/midnight-sdk";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  CalldataAmountError,
  type CalldataCall,
  CalldataCallError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataRecipientError,
  CalldataTargetError,
  CalldataUnsupportedError,
  verifyCalldata,
} from "./index.js";
import { midnightCases } from "./test/midnight.fixtures.js";

const otherAddress = "0x2000000000000000000000000000000000000002" as const;

function lastCall(calls: readonly CalldataCall[]) {
  const call = calls.at(-1);
  if (!call) throw new Error("Expected final call");
  return call;
}

describe("verifyCalldata on Midnight markets", () => {
  it("rejects all mode and unknown units on collateral supplies", () => {
    const { intent, calls } = midnightCases.borrow_directSupply;
    for (const unit of ["all", "unknown"]) {
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            // @ts-expect-error Test an unvalidated intent.
            amount: { ...intent.amount, unit },
          },
          calls,
        ),
      ).toThrow(CalldataAmountError);
    }
  });
  it.each(Object.entries(midnightCases))(
    "verifies %s and rejects another market",
    (_name, { intent, calls }) => {
      expect(verifyCalldata(intent, calls).map(({ call }) => call)).toEqual(
        calls,
      );
      expect(() =>
        verifyCalldata({ ...intent, market: zeroHash }, calls),
      ).toThrow(CalldataTargetError);
    },
  );

  it("rejects different amounts and fees", () => {
    const { intent, calls } = midnightCases.borrow_exactAssets;
    expect(() =>
      verifyCalldata(
        { ...intent, amount: { unit: "assets", value: "1" } },
        calls,
      ),
    ).toThrow(CalldataAmountError);
    expect(() => verifyCalldata({ ...intent, max_fee_bps: 0 }, calls)).toThrow(
      CalldataFeeError,
    );
  });

  it.each([
    {
      fixture: midnightCases.repay_partialErc20,
      type: "market",
    },
    {
      fixture: midnightCases.market_repay_exactAssets,
      type: "direct",
    },
  ])(
    "rejects $fixture.intent.action with the wrong repay type",
    ({ fixture, type }) => {
      const { intent, calls } = fixture;
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
      expect(() =>
        // @ts-expect-error Test an unvalidated intent.
        verifyCalldata({ ...intent, type }, calls),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "type",
          callId: lastCall(calls).id,
        }),
      );
    },
  );

  it.each([0n, maxUint256])(
    "rejects a full direct repay with asset cap %s",
    (cap) => {
      const {
        intent,
        calls: [, authorization, call],
      } = midnightCases.repay_completeErc20;
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
        "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
      ) {
        throw new Error("Expected full direct repay");
      }
      expect(() => verifyCalldata(intent, [authorization, call])).not.toThrow();
      const [market, target, , ...rest] = args;
      const data = encodeFunctionData({
        abi,
        functionName,
        args: [market, target, cap, ...rest],
      });
      expect(() =>
        verifyCalldata(intent, [authorization, { ...call, data }]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "max_assets",
          callId: call.id,
        }),
      );
    },
  );

  it("rejects a Midnight fee above the requested rate but within max_fee_bps", () => {
    const { intent, calls } = midnightCases.borrow_exactAssets;
    expect(() => verifyCalldata(intent, calls)).not.toThrow();
    expect(() =>
      verifyCalldata(
        { ...intent, referral_fee: { ...intent.referral_fee, bps: 99 } },
        calls,
      ),
    ).toThrow(CalldataFeeError);
  });

  it.each([
    midnightCases.borrow_exactAssets,
    midnightCases.lend_exactAssets,
    midnightCases.market_repay_exactAssets,
  ])("accepts no guard on $intent.action", ({ intent, calls }) => {
    const { guard: _guard, ...unguarded } = intent;
    expect(() => verifyCalldata(unguarded, calls)).not.toThrow();
  });

  it("checks approval tokens and authorization spender, owner, uniqueness and route", () => {
    const { intent, calls } = midnightCases.lend_exactAssets;
    const [approval, authorization, bundle] = calls;
    const decoded = decodeFunctionData({
      abi: midnightAbi,
      data: authorization.data,
    });
    if (decoded.functionName !== "setIsAuthorized")
      throw new Error("Expected authorization");
    const [spender, enabled, owner] = decoded.args;
    const authorize = (args: typeof decoded.args) => ({
      ...authorization,
      data: encodeFunctionData({
        abi: midnightAbi,
        functionName: decoded.functionName,
        args,
      }),
    });
    expect(() =>
      verifyCalldata(intent, [
        { ...approval, to: otherAddress },
        authorization,
        bundle,
      ]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata(intent, [
        approval,
        authorize([otherAddress, enabled, owner]),
        bundle,
      ]),
    ).toThrow(CalldataTargetError);
    expect(() =>
      verifyCalldata(intent, [
        approval,
        authorize([spender, enabled, otherAddress]),
        bundle,
      ]),
    ).toThrow(CalldataRecipientError);
    expect(() =>
      verifyCalldata(intent, [approval, authorization, authorization, bundle]),
    ).toThrow(CalldataCallError);
    expect(() =>
      verifyCalldata(intent, [approval, approval, authorization, bundle]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
      }),
    );
    const direct = midnightCases.borrow_directSupply;
    expect(() =>
      verifyCalldata(direct.intent, [authorization, ...direct.calls]),
    ).toThrow(CalldataCallError);
  });

  it("rejects a registered spender that is not the Midnight call target", () => {
    const bundle = midnightCases.lend_exactAssets;
    const core = midnightCases.borrow_directSupply;
    for (const [route, spender] of [
      [bundle, lastCall(core.calls).to],
      [core, lastCall(bundle.calls).to],
    ] as const) {
      const [approval, ...remaining] = route.calls;
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      expect(() =>
        verifyCalldata(route.intent, [{ ...approval, data }, ...remaining]),
      ).toThrow(CalldataTargetError);
    }
  });

  it.each([midnightCases.lend_exactAssets, midnightCases.borrow_directSupply])(
    "requires an approval to cover the encoded pull on $intent.action",
    ({ intent, calls: [approval, ...remaining] }) => {
      const assets = BigInt(intent.amount.value);
      const spender = lastCall(remaining).to;
      const approve = (amount: bigint) => ({
        ...approval,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, amount],
        }),
      });
      expect(
        verifyCalldata(intent, [approve(assets), ...remaining]),
      ).toHaveLength(remaining.length + 1);
      expect(() =>
        verifyCalldata(intent, [approve(assets - 1n), ...remaining]),
      ).toThrow(CalldataAmountError);
    },
  );

  it("requires a zero approval to be immediately followed by a positive approval", () => {
    const { intent, calls } = midnightCases.lend_exactAssets;
    const [approval, authorization, bundle] = calls;
    const reset = {
      ...approval,
      id: "reset",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [bundle.to, 0n],
      }),
    };
    expect(() =>
      verifyCalldata(intent, [reset, approval, authorization, bundle]),
    ).not.toThrow();
    expect(() => verifyCalldata(intent, [reset, bundle])).toThrow(
      CalldataCallError,
    );
    expect(() =>
      verifyCalldata(intent, [reset, authorization, approval, bundle]),
    ).toThrow(CalldataCallError);
    expect(() =>
      verifyCalldata(intent, [
        reset,
        { ...reset, id: "second-reset" },
        approval,
        authorization,
        bundle,
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
        callId: "second-reset",
      }),
    );
  });

  it.each(["disabled", "wrong selector"] as const)(
    "rejects a Midnight prerequisite with %s authorization",
    (mode) => {
      const {
        intent,
        calls: [approval, authorization, bundle],
      } = midnightCases.lend_exactAssets;
      const abi = midnightAbi;
      const decoded = decodeFunctionData({ abi, data: authorization.data });
      if (decoded.functionName !== "setIsAuthorized")
        throw new Error("Expected authorization");
      const [spender, , owner] = decoded.args;
      const data =
        mode === "disabled"
          ? encodeFunctionData({
              abi,
              functionName: "setIsAuthorized",
              args: [spender, false, owner],
            })
          : encodeFunctionData({
              abi,
              functionName: "setConsumed",
              args: [zeroHash, 1n, owner],
            });
      expect(() =>
        verifyCalldata(intent, [approval, { ...authorization, data }, bundle]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "authorization",
          callId: authorization.id,
        }),
      );
    },
  );

  it("checks the side, units, maker, and receiver of a borrow", () => {
    const { intent, calls } = midnightCases.borrow_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
    )
      throw new Error("Expected borrow");
    const [
      market,
      target,
      bound,
      reduceOnly,
      receiver,
      supplies,
      fills,
      ...rest
    ] = args;
    const fill = fills[0];
    if (!fill) throw new Error("Expected a fill");
    const verify = ({
      entries = fills,
      to = receiver,
    }: {
      entries?: typeof fills;
      to?: typeof receiver;
    }) =>
      verifyCalldata(intent, [
        ...calls.slice(0, -1),
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [
              market,
              target,
              bound,
              reduceOnly,
              to,
              supplies,
              entries,
              ...rest,
            ],
          }),
        },
      ]);
    for (const entry of [
      { ...fill, offer: { ...fill.offer, buy: false } },
      { ...fill, units: 0n },
      { ...fill, offer: { ...fill.offer, maker: intent.account } },
    ]) {
      expect(() => verify({ entries: [entry, ...fills.slice(1)] })).toThrow(
        CalldataCallError,
      );
    }
    expect(() => verify({ to: otherAddress })).toThrow(CalldataRecipientError);
  });

  it.each([
    {
      change: "empty market collateral list",
      field: "market",
      error: CalldataTargetError,
    },
    { change: "different market", field: "market", error: CalldataTargetError },
    { change: "no fills", field: "offers", error: CalldataCallError },
    {
      change: "market fee at 100%",
      field: "referral_fee",
      error: CalldataFeeError,
    },
  ])("rejects a Midnight borrow with $change", ({ change, field, error }) => {
    const { intent, calls } = midnightCases.borrow_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
    )
      throw new Error("Expected borrow");
    const args: [...typeof decoded.args] = [...decoded.args];
    switch (change) {
      case "empty market collateral list":
        args[0] = { ...args[0], collateralParams: [] };
        break;
      case "different market":
        args[0] = { ...args[0], maturity: args[0].maturity + 1n };
        break;
      case "no fills":
        args[6] = [];
        break;
      case "market fee at 100%":
        args[7] = 10n ** 18n;
        break;
    }
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args,
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({ constructor: error, field, callId: call.id }),
    );
  });

  it.each([
    {
      change: "a short collateral list",
      field: "collateral",
      error: CalldataCallError,
    },
    {
      change: "a duplicate collateral",
      field: "collateral",
      error: CalldataTargetError,
    },
  ])("rejects a Midnight borrow with $change", ({ change, field, error }) => {
    const { intent, calls } = midnightCases.borrow_multiCollateralNative;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
    )
      throw new Error("Expected borrow");
    const [market, target, bound, reduceOnly, receiver, supplies, ...rest] =
      decoded.args;
    const [first] = supplies;
    if (!first || supplies.length !== 2)
      throw new Error("Expected two collateral transfers");
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [
        market,
        target,
        bound,
        reduceOnly,
        receiver,
        change === "a short collateral list" ? [first] : [first, first],
        ...rest,
      ],
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({ constructor: error, field, callId: call.id }),
    );
  });

  it.each([
    {
      change: "wrong offer side",
      field: "offer_fills",
      error: CalldataCallError,
    },
    {
      change: "an unrequested fee",
      field: "max_fee_bps",
      error: CalldataFeeError,
    },
  ])("rejects a Midnight lend with $change", ({ change, field, error }) => {
    const { intent, calls } = midnightCases.lend_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    )
      throw new Error("Expected lend");
    const args: [...typeof decoded.args] = [...decoded.args];
    const [fill, ...remaining] = args[5];
    if (!fill) throw new Error("Expected a fill");
    if (change === "wrong offer side")
      args[5] = [
        { ...fill, offer: { ...fill.offer, buy: true } },
        ...remaining,
      ];
    else args[8] = 1n;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args,
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({ constructor: error, field, callId: call.id }),
    );
  });

  it("rejects a direct repay with tampered flags, fills or collateral receiver", () => {
    const { intent, calls } = midnightCases.repay_partialErc20;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    )
      throw new Error("Expected direct repay");
    const lend = decodeFunctionData({
      abi,
      data: lastCall(midnightCases.lend_exactAssets.calls).data,
    });
    if (lend.functionName !== functionName)
      throw new Error("Expected assets-target lend");
    const [
      market,
      target,
      bound,
      reduceOnly,
      repayEnabled,
      fills,
      withdrawals,
      receiver,
      ...rest
    ] = args;
    const verify = ({
      reduce = reduceOnly,
      repay = repayEnabled,
      entries = fills,
      to = receiver,
      minUnits = bound,
    }: {
      reduce?: boolean;
      repay?: boolean;
      entries?: typeof fills;
      to?: typeof receiver;
      minUnits?: bigint;
    }) =>
      verifyCalldata(intent, [
        ...calls.slice(0, -1),
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [
              market,
              target,
              minUnits,
              reduce,
              repay,
              entries,
              withdrawals,
              to,
              ...rest,
            ],
          }),
        },
      ]);
    expect(() => verify({ reduce: false })).toThrow(CalldataCallError);
    expect(() => verify({ repay: false })).toThrow(CalldataCallError);
    expect(() => verify({ entries: lend.args[5] })).toThrow(CalldataCallError);
    expect(() => verify({ to: otherAddress })).toThrow(CalldataRecipientError);
    expect(() => verify({})).not.toThrow();
    expect(() => verify({ minUnits: bound - 1n })).toThrow(CalldataAmountError);
    const lendCase = midnightCases.lend_exactAssets;
    const lendCall = lastCall(lendCase.calls);
    const [
      lendMarket,
      lendTarget,
      lendBound,
      lendReduce,
      lendRepay,
      ,
      ...lendRest
    ] = lend.args;
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [
        lendMarket,
        lendTarget,
        lendBound,
        lendReduce,
        lendRepay,
        [],
        ...lendRest,
      ],
    });
    expect(() =>
      verifyCalldata(lendCase.intent, [
        ...lendCase.calls.slice(0, -1),
        { ...lendCall, data },
      ]),
    ).toThrow(CalldataCallError);
  });

  it.each([
    ["direct", midnightCases.repay_mixedCompound],
    ["market", midnightCases.market_repay_exactAssets],
  ] as const)(
    "rejects a zero collateral receiver on a %s repay with a withdrawal",
    (_mode, { intent, calls }) => {
      const call = lastCall(calls);
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
        "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
      )
        throw new Error("Expected an assets-target repay");
      const [
        market,
        target,
        bound,
        reduceOnly,
        repay,
        fills,
        ,
        receiver,
        ...tail
      ] = args;
      const token = market.collateralParams[0]?.token;
      if (!token) throw new Error("Expected collateral");
      const withdrawals = [{ collateralIndex: 0n, assets: 100000n }];
      const request = {
        ...intent,
        collateral_withdrawals: [
          {
            collateral: { address: token },
            amount: { unit: "assets", value: "100000" },
          },
        ],
      } as const;
      const verify = (to: typeof receiver) =>
        verifyCalldata(request, [
          ...calls.slice(0, -1),
          {
            ...call,
            data: encodeFunctionData({
              abi,
              functionName,
              args: [
                market,
                target,
                bound,
                reduceOnly,
                repay,
                fills,
                withdrawals,
                to,
                ...tail,
              ],
            }),
          },
        ]);
      expect(verify(receiver)).toHaveLength(calls.length);
      expect(() => verify(zeroAddress)).toThrow(
        expect.objectContaining({
          constructor: CalldataRecipientError,
          field: "collateral_receiver",
          callId: call.id,
        }),
      );
    },
  );

  it("rejects loan-token approval when direct repay only withdraws collateral", () => {
    const { intent, calls } = midnightCases.repay_partialErc20;
    const [approve, ...rest] = calls;
    const call = lastCall(rest);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    ) {
      throw new Error("Expected direct repay");
    }
    const [market, , , reduceOnly, repayEnabled, fills, , ...tail] = args;
    const collateralWithdrawal = { collateralIndex: 0n, assets: 1n };
    const token = market.collateralParams[0]?.token;
    if (!token) throw new Error("Expected collateral");
    const withdrawal = {
      collateral: { address: token },
      amount: { unit: "assets", value: "1" },
    } as const;
    const collateralOnly = {
      ...intent,
      amount: { unit: "assets", value: "0" },
      collateral_withdrawals: [withdrawal],
    } as const;
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [
        market,
        0n,
        0n,
        reduceOnly,
        repayEnabled,
        fills,
        [collateralWithdrawal],
        ...tail,
      ],
    });
    const base = [...rest.slice(0, -1), { ...call, data }];
    expect(() => verifyCalldata(collateralOnly, base)).not.toThrow();
    expect(() => verifyCalldata(collateralOnly, [approve, ...base])).toThrow(
      CalldataTargetError,
    );
    const empty = {
      ...call,
      data: encodeFunctionData({
        abi,
        functionName,
        args: [market, 0n, 0n, reduceOnly, repayEnabled, fills, [], ...tail],
      }),
    };
    expect(() =>
      verifyCalldata({ ...collateralOnly, collateral_withdrawals: [] }, [
        ...rest.slice(0, -1),
        empty,
      ]),
    ).toThrow(CalldataAmountError);
  });

  it.each([
    midnightCases.repay_partialErc20,
    midnightCases.market_repay_exactAssets,
    midnightCases.repay_completeErc20,
    midnightCases.market_repay_exactUnits,
  ])(
    "checks zero and whole-balance collateral withdrawals on $intent.action ($intent.amount.unit)",
    ({ intent, calls }) => {
      const call = lastCall(calls);
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
          "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral" &&
        functionName !==
          "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
      ) {
        throw new Error("Expected repay");
      }
      const [
        market,
        target,
        bound,
        reduceOnly,
        repayEnabled,
        fills,
        ,
        ,
        ...tail
      ] = args;
      const token = market.collateralParams[0]?.token;
      if (!token) throw new Error("Expected collateral");
      const collateralOnly =
        intent.action === "midnight.repay" && intent.amount.unit === "assets";
      const request = {
        ...(collateralOnly
          ? { ...intent, amount: { unit: "assets" as const, value: "0" } }
          : intent),
        collateral_withdrawals: [
          { collateral: { address: token }, amount: { unit: "all" } },
        ],
      } as const;
      const build = (assets: bigint) => [
        ...calls.slice(collateralOnly ? 1 : 0, -1),
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [
              market,
              collateralOnly ? 0n : target,
              collateralOnly ? 0n : bound,
              reduceOnly,
              repayEnabled,
              fills,
              [{ collateralIndex: 0n, assets }],
              intent.account,
              ...tail,
            ],
          }),
        },
      ];
      expect(() => verifyCalldata(request, build(1n))).not.toThrow();
      expect(() => verifyCalldata(request, build(maxUint256))).not.toThrow();
      expect(() => verifyCalldata(request, build(0n))).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "collateral.amount",
          callId: call.id,
        }),
      );
      const exact = (assets: bigint) => ({
        ...request,
        collateral_withdrawals: [
          {
            collateral: { address: token },
            amount: { unit: "assets" as const, value: assets.toString() },
          },
        ],
      });
      expect(() => verifyCalldata(exact(1n), build(1n))).not.toThrow();
      expect(() =>
        verifyCalldata(exact(maxUint256), build(maxUint256)),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "collateral.amount",
          callId: call.id,
        }),
      );
    },
  );

  it.each([
    midnightCases.repay_partialErc20,
    midnightCases.market_repay_exactAssets,
  ])(
    "accepts a zero collateral receiver on repay-only $intent.action",
    ({ intent, calls }) => {
      const call = lastCall(calls);
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
        "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
      ) {
        throw new Error("Expected assets-target repay");
      }
      expect(args[6]).toHaveLength(0);
      const [
        market,
        target,
        bound,
        reduceOnly,
        repayEnabled,
        fills,
        withdrawals,
        ,
        ...tail
      ] = args;
      const data = encodeFunctionData({
        abi,
        functionName,
        args: [
          market,
          target,
          bound,
          reduceOnly,
          repayEnabled,
          fills,
          withdrawals,
          zeroAddress,
          ...tail,
        ],
      });
      expect(
        verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
      ).toHaveLength(calls.length);
    },
  );

  it("rejects a zero exact buy target", () => {
    const { intent, calls } = midnightCases.lend_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    ) {
      throw new Error("Expected assets-target lend");
    }
    const [market, , ...rest] = args;
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [market, 0n, ...rest],
    });
    expect(() =>
      verifyCalldata({ ...intent, amount: { unit: "assets", value: "0" } }, [
        ...calls.slice(0, -1),
        { ...call, data },
      ]),
    ).toThrow(CalldataAmountError);
  });

  it("rejects a finite units target for a full direct repay", () => {
    const { intent, calls } = midnightCases.repay_completeErc20;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
    ) {
      throw new Error("Expected units-target repay");
    }
    const [market, , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, 1n, ...rest],
    });
    expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
        callId: call.id,
      }),
    );
  });

  it("rejects an assets selector for a full direct repay even with a maximum target", () => {
    const { intent, calls } = midnightCases.repay_completeErc20;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
    )
      throw new Error("Expected units-target repay");
    const data = encodeFunctionData({
      abi,
      functionName: "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral",
      args: decoded.args,
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "amount",
        callId: call.id,
      }),
    );
  });

  it.each([
    { unit: "all", field: "amount.unit" },
    { unit: "units", field: "amount" },
  ] as const)(
    "rejects a market repay with a maximum target in $unit mode",
    ({ unit, field }) => {
      const { intent, calls } = midnightCases.market_repay_exactUnits;
      const call = lastCall(calls);
      const abi = midnightBundlesV2Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (
        decoded.functionName !==
        "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
      )
        throw new Error("Expected units-target repay");
      const [market, , ...rest] = decoded.args;
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: [market, maxUint256, ...rest],
      });
      const amount =
        unit === "all" ? { unit } : { unit, value: maxUint256.toString() };
      expect(() =>
        verifyCalldata(
          // @ts-expect-error Test an invalid unvalidated "all" market repay.
          { ...intent, amount },
          [...calls.slice(0, -1), { ...call, data }],
        ),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field,
          callId: call.id,
        }),
      );
    },
  );

  it("rejects an all-mode Midnight withdrawal via a units-target sell bundle", () => {
    const { calls } = midnightCases.borrow_exactUnits;
    const { intent } = midnightCases.withdraw_all;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
    )
      throw new Error("Expected units-target sell");
    const [market, , bound, , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, maxUint256, bound, true, ...rest],
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "offers",
        callId: call.id,
      }),
    );
  });

  it("rejects a decoded Midnight offer-publication selector as a market action", () => {
    const { intent, calls } = midnightCases.borrow_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithAssetsTarget"
    )
      throw new Error("Expected sell bundle");
    const [market] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: "midnightBundlesV2CancelAndMake",
      args: [
        {
          loanToken: zeroAddress,
          collateralToken: zeroAddress,
          oracle: zeroAddress,
          irm: zeroAddress,
          lltv: 0n,
        },
        0n,
        zeroHash,
        market,
        [],
        zeroAddress,
        zeroHash,
        0n,
        0n,
        0n,
        0,
        zeroHash,
        zeroHash,
        [],
        "0x",
        0n,
        zeroAddress,
      ],
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
        callId: call.id,
      }),
    );
  });

  it.each([
    {
      requested: midnightCases.lend_exactAssets,
      wrong: midnightCases.borrow_exactAssets,
    },
    {
      requested: midnightCases.borrow_exactAssets,
      wrong: midnightCases.lend_exactAssets,
    },
    {
      requested: midnightCases.withdraw_all,
      wrong: midnightCases.borrow_directSupply,
    },
  ])(
    "rejects a selector for $wrong.intent.action when verifying $requested.intent.action",
    ({ requested, wrong }) => {
      const call = lastCall(requested.calls);
      const { data } = lastCall(wrong.calls);
      expect(() =>
        verifyCalldata(requested.intent, [
          ...requested.calls.slice(0, -1),
          { ...call, data },
        ]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "function",
          callId: call.id,
        }),
      );
    },
  );

  it("rejects zero exact core withdrawal and collateral amounts", () => {
    const redeem = midnightCases.redeem_exactUnits;
    const supply = midnightCases.borrow_directSupply;
    const abi = midnightAbi;
    const withdraw = decodeFunctionData({
      abi,
      data: lastCall(redeem.calls).data,
    });
    const collateral = decodeFunctionData({
      abi,
      data: lastCall(supply.calls).data,
    });
    if (
      withdraw.functionName !== "withdraw" ||
      collateral.functionName !== "supplyCollateral"
    ) {
      throw new Error("Expected core withdrawal and supply");
    }
    for (const [route, data] of [
      [
        redeem,
        encodeFunctionData({
          abi,
          functionName: "withdraw",
          args: [withdraw.args[0], 0n, withdraw.args[2], withdraw.args[3]],
        }),
      ],
      [
        supply,
        encodeFunctionData({
          abi,
          functionName: "supplyCollateral",
          args: [
            collateral.args[0],
            collateral.args[1],
            0n,
            collateral.args[3],
          ],
        }),
      ],
    ] as const) {
      expect(() =>
        verifyCalldata(
          { ...route.intent, amount: { ...route.intent.amount, value: "0" } },
          [...route.calls.slice(0, -1), { ...lastCall(route.calls), data }],
        ),
      ).toThrow(CalldataAmountError);
    }
  });

  it("checks native value against the pull and verifies wrapped native token", () => {
    const { intent, calls } = midnightCases.repay_native;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    )
      throw new Error("Expected assets-target native repay");
    const [
      market,
      target,
      bound,
      reduce,
      repay,
      fills,
      withdrawals,
      receiver,
      pct,
      recipient,
      cap,
      deadline,
      wNative,
    ] = args;
    expect(wNative).not.toBe(zeroAddress);
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, value: "0" }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
        callId: call.id,
      }),
    );
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          funding: {
            type: "native",
            max_native_assets: (BigInt(call.value) - 1n).toString(),
          },
        },
        calls,
      ),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
        callId: call.id,
      }),
    );
    const funding = { type: "unknown", max_native_assets: call.value };
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...intent, funding }, calls),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          funding: {
            type: "native",
            max_native_assets: (target + 1n).toString(),
          },
        },
        [...calls.slice(0, -1), { ...call, value: (target + 1n).toString() }],
      ),
    ).toThrow(CalldataAmountError);
    const marketWithOtherLoanToken = { ...market, loanToken: otherAddress };
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [
        marketWithOtherLoanToken,
        target,
        bound,
        reduce,
        repay,
        fills,
        withdrawals,
        receiver,
        pct,
        recipient,
        cap,
        deadline,
        otherAddress,
      ],
    });
    expect(() =>
      verifyCalldata(
        { ...intent, market: MarketUtils.toId(marketWithOtherLoanToken) },
        [
          ...calls
            .slice(0, -1)
            .map<CalldataCall>((item) =>
              item.kind === "approval" ? { ...item, to: otherAddress } : item,
            ),
          { ...call, data },
        ],
      ),
    ).toThrow(CalldataAmountError);
  });

  it("rejects rate guards that cannot be verified from calldata", () => {
    const lend = midnightCases.lend_exactAssets;
    const borrow = midnightCases.borrow_exactAssets;
    expect(() =>
      verifyCalldata(
        { ...lend.intent, guard: { type: "min_rate", value: "1" } },
        lend.calls,
      ),
    ).toThrow(CalldataUnsupportedError);
    expect(() =>
      verifyCalldata(
        { ...borrow.intent, guard: { type: "max_rate", value: "1" } },
        borrow.calls,
      ),
    ).toThrow(CalldataUnsupportedError);
  });

  it.each([
    [midnightCases.lend_exactAssets, "max_units"],
    [midnightCases.market_repay_exactAssets, "min_assets"],
    [midnightCases.borrow_exactAssets, "min_units"],
    [midnightCases.withdraw_exactAssets, "max_assets"],
  ] as const)(
    "rejects wrong-side and unknown guards on %o",
    (route, wrongSide) => {
      for (const type of [wrongSide, "unknown"] as const) {
        expect(() =>
          verifyCalldata(
            // @ts-expect-error Test an unvalidated intent.
            { ...route.intent, guard: { type, value: "1" } },
            route.calls,
          ),
        ).toThrow(CalldataUnsupportedError);
      }
    },
  );

  it.each([
    midnightCases.withdraw_exactAssets,
    midnightCases.lend_exactAssets,
    midnightCases.borrow_exactAssets,
  ])(
    "rejects a missing amount on $intent.action",
    ({ intent: { amount: _amount, ...intent }, calls }) => {
      expect(() =>
        // @ts-expect-error Test an unvalidated intent.
        verifyCalldata(intent, calls),
      ).toThrow(CalldataAmountError);
    },
  );

  it("rejects malformed collateral withdrawal requests with typed errors", () => {
    const { intent, calls } = midnightCases.repay_collateralOnlyMultiple;
    const { collateral_withdrawals: withdrawals, ...missing } = intent;
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata(missing, calls),
    ).toThrow(CalldataCallError);
    expect(() =>
      verifyCalldata(
        // @ts-expect-error Test an unvalidated intent.
        { ...intent, collateral_withdrawals: [null, ...withdrawals.slice(1)] },
        calls,
      ),
    ).toThrow(CalldataTargetError);
    const [{ amount: _amount, ...first }, ...rest] = withdrawals;
    expect(() =>
      verifyCalldata(
        // @ts-expect-error Test an unvalidated intent.
        { ...intent, collateral_withdrawals: [first, ...rest] },
        calls,
      ),
    ).toThrow(CalldataAmountError);
  });

  it("rejects collateral withdrawals on a lend that carries a leftover list", () => {
    const { intent, calls } = midnightCases.lend_exactAssets;
    const call = lastCall(calls);
    const abi = midnightBundlesV2Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (
      functionName !==
      "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
    )
      throw new Error("Expected an assets-target lend");
    const [market, target, bound, reduceOnly, repay, fills, , ...tail] = args;
    const token = market.collateralParams[0]?.token;
    if (!token) throw new Error("Expected collateral");
    const request = {
      ...intent,
      collateral_withdrawals: [
        {
          collateral: { address: token },
          amount: { unit: "assets", value: "100000" },
        },
      ],
    } as const;
    expect(() =>
      verifyCalldata(request, [
        ...calls.slice(0, -1),
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [
              market,
              target,
              bound,
              reduceOnly,
              repay,
              fills,
              [{ collateralIndex: 0n, assets: 100000n }],
              ...tail,
            ],
          }),
        },
      ]),
    ).toThrow(CalldataCallError);
  });

  it.each([
    midnightCases.market_repay_exactAssets,
    midnightCases.repay_partialErc20,
  ])(
    "rejects a fee on $intent.action that carries a leftover referral fee",
    ({ intent, calls }) => {
      const call = lastCall(calls);
      const abi = midnightBundlesV2Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      if (
        functionName !==
        "midnightBundlesV2BuyWithAssetsTargetAndWithdrawCollateral"
      )
        throw new Error("Expected an assets-target repay");
      const request = {
        ...intent,
        max_fee_bps: 100,
        referral_fee: { bps: 100, recipient: otherAddress },
      } as const;
      expect(() =>
        verifyCalldata(request, [
          ...calls.slice(0, -1),
          {
            ...call,
            data: encodeFunctionData({
              abi,
              functionName,
              args: [
                ...args.slice(0, 8),
                10n ** 16n,
                otherAddress,
                ...args.slice(10),
              ] as unknown as typeof args,
            }),
          },
        ]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataFeeError,
          field: "referral_fee.recipient",
        }),
      );
    },
  );

  it("rejects null collateral lists instead of treating them as omitted", () => {
    const repay = midnightCases.repay_partialErc20;
    expect(() =>
      verifyCalldata(
        // @ts-expect-error Test an unvalidated intent.
        { ...repay.intent, collateral_withdrawals: null },
        repay.calls,
      ),
    ).toThrow(CalldataCallError);
    const borrow = midnightCases.borrow_exactAssets;
    expect(() =>
      verifyCalldata(
        // @ts-expect-error Test an unvalidated intent.
        { ...borrow.intent, collateral_supplies: null },
        borrow.calls,
      ),
    ).toThrow(CalldataCallError);
  });

  it("rejects non-asset and non-unit amounts on direct withdraw", () => {
    const { intent, calls } = midnightCases.withdraw_exactAssets;
    const amount = {
      ...intent.amount,
      unit: "shares",
    } as unknown as typeof intent.amount;
    expect(() => verifyCalldata({ ...intent, amount }, calls)).toThrow(
      CalldataAmountError,
    );
  });

  it.each([
    midnightCases.lend_exactUnits,
    midnightCases.borrow_exactAssets,
    midnightCases.withdraw_exactAssets,
  ])(
    "checks explicit guards against the primary target for $intent.action",
    ({ intent, calls }) => {
      const exact = BigInt(intent.amount.value);
      const verify = (bound: bigint) =>
        verifyCalldata(
          intent.action === "midnight.lend"
            ? {
                ...intent,
                guard: { type: "min_units", value: bound.toString() },
              }
            : {
                ...intent,
                guard: { type: "min_assets", value: bound.toString() },
              },
          calls,
        );
      expect(() => verify(exact)).not.toThrow();
      expect(() => verify(exact + 1n)).toThrow(CalldataAmountError);
    },
  );

  it("rejects a lend whose pull exceeds the request's maximum assets", () => {
    const { intent, calls } = midnightCases.lend_exactUnits;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected final lend call");
    const abi = midnightBundlesV2Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (
      decoded.functionName !==
      "midnightBundlesV2BuyWithUnitsTargetAndWithdrawCollateral"
    ) {
      throw new Error("Expected units-target lend");
    }
    const [market, units, , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, units, BigInt(intent.guard.value) + 1n, ...rest],
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(CalldataAmountError);
  });

  it("rejects a units-target borrow that weakens a caller-specified minimum receipt", () => {
    const { intent, calls } = midnightCases.borrow_exactUnits;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected final borrow call");
    const decoded = decodeFunctionData({
      abi: midnightBundlesV2Abi,
      data: call.data,
    });
    if (
      decoded.functionName !==
      "midnightBundlesV2SupplyCollateralAndSellWithUnitsTarget"
    ) {
      throw new Error("Expected units-target borrow");
    }
    const bound = decoded.args[2];
    expect(
      verifyCalldata(
        {
          ...intent,
          guard: { type: "min_assets", value: bound.toString() },
        },
        calls,
      ),
    ).toHaveLength(calls.length);
    expect(() =>
      verifyCalldata(
        {
          ...intent,
          guard: { type: "min_assets", value: (bound + 1n).toString() },
        },
        calls,
      ),
    ).toThrow(CalldataAmountError);
  });

  it("requires the owner and receiver even for all withdrawals", () => {
    const {
      intent,
      calls: [call],
    } = midnightCases.withdraw_all;
    const abi = midnightAbi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "withdraw")
      throw new Error("Expected withdrawal");
    const [market, units, owner, receiver] = decoded.args;
    const [approval] = midnightCases.lend_exactAssets.calls;
    expect(() => verifyCalldata(intent, [approval, call])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "calls",
      }),
    );
    const other = "0x2000000000000000000000000000000000000002";
    for (const args of [
      [market, units, owner, other],
      [market, units, other, receiver],
    ] as const) {
      const data = encodeFunctionData({ abi, functionName: "withdraw", args });
      expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
        CalldataRecipientError,
      );
    }
  });

  it.each([midnightCases.withdraw_all, midnightCases.redeem_all])(
    "rejects zero encoded units for all-mode $intent.action",
    ({ intent, calls: [call] }) => {
      const abi = midnightAbi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "withdraw") {
        throw new Error("Expected withdrawal");
      }
      const [market, , owner, receiver] = decoded.args;
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: [market, 0n, owner, receiver],
      });
      expect(() => verifyCalldata(intent, [call])).not.toThrow();
      expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
        expect.objectContaining({
          constructor: CalldataAmountError,
          field: "amount",
          callId: call.id,
        }),
      );
    },
  );

  it("rejects a zero all-mode leg in a core collateral withdrawal", () => {
    const {
      intent,
      calls: [call],
    } = midnightCases.repay_collateralOnlyMultiple;
    const abi = midnightAbi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "multicall") {
      throw new Error("Expected collateral withdrawal batch");
    }
    const legs = decoded.args[0].map((legData) => {
      const leg = decodeFunctionData({ abi, data: legData });
      if (leg.functionName !== "withdrawCollateral") {
        throw new Error("Expected collateral withdrawal leg");
      }
      const [market, index, , owner, receiver] = leg.args;
      const token = market.collateralParams[Number(index)]?.token;
      return token?.toLowerCase() ===
        intent.collateral_withdrawals[0].collateral.address.toLowerCase()
        ? encodeFunctionData({
            abi,
            functionName: leg.functionName,
            args: [market, index, 0n, owner, receiver],
          })
        : legData;
    });
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [legs],
    });
    expect(() => verifyCalldata(intent, [call])).not.toThrow();
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "collateral.amount",
        callId: call.id,
      }),
    );
  });

  it("rejects a reordered collateral list when checking the market hash", () => {
    const {
      intent,
      calls: [call],
    } = midnightCases.withdraw_all;
    const abi = midnightAbi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "withdraw")
      throw new Error("Expected withdrawal");
    const [market, units, owner, receiver] = decoded.args;
    expect(market.collateralParams.length).toBeGreaterThan(1);
    const data = encodeFunctionData({
      abi,
      functionName: "withdraw",
      args: [
        { ...market, collateralParams: [...market.collateralParams].reverse() },
        units,
        owner,
        receiver,
      ],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      CalldataTargetError,
    );
  });

  it("decodes all multicall legs and rejects a malformed leg", () => {
    const {
      intent,
      calls: [call],
    } = midnightCases.repay_collateralOnlyMultiple;
    expect(verifyCalldata(intent, [call])[0]?.calls).toHaveLength(2);
    const data = encodeFunctionData({
      abi: midnightAbi,
      functionName: "multicall",
      args: [["0x12345678"]],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      CalldataDecodeError,
    );
  });

  it.each([
    { change: "owner", error: CalldataRecipientError, field: "on_behalf" },
    { change: "receiver", error: CalldataRecipientError, field: "receiver" },
    { change: "selector", error: CalldataCallError, field: "function" },
    { change: "empty legs", error: CalldataCallError, field: "collateral" },
  ] as const)(
    "rejects a core collateral withdrawal with invalid $change",
    ({ change, error, field }) => {
      const {
        intent,
        calls: [call],
      } = midnightCases.repay_collateralOnlyMultiple;
      const abi = midnightAbi;
      const outer = decodeFunctionData({ abi, data: call.data });
      if (outer.functionName !== "multicall")
        throw new Error("Expected multicall");
      const [first, ...rest] = outer.args[0];
      if (!first) throw new Error("Expected a leg");
      const inner = decodeFunctionData({ abi, data: first });
      if (inner.functionName !== "withdrawCollateral")
        throw new Error("Expected collateral withdrawal");
      const [market, index, assets, owner, receiver] = inner.args;
      const modified =
        change === "selector"
          ? encodeFunctionData({
              abi,
              functionName: "supplyCollateral",
              args: [market, index, assets, owner],
            })
          : encodeFunctionData({
              abi,
              functionName: inner.functionName,
              args: [
                market,
                index,
                assets,
                change === "owner" ? otherAddress : owner,
                change === "receiver" ? otherAddress : receiver,
              ],
            });
      const data = encodeFunctionData({
        abi,
        functionName: outer.functionName,
        args: [change === "empty legs" ? [] : [modified, ...rest]],
      });
      expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
        expect.objectContaining({ constructor: error, field }),
      );
    },
  );
});
