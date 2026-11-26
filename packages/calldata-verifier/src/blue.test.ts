import { blueAbi } from "@morpho-org/blue-sdk-viem";
import {
  BundlesPermitKind,
  blueBundlesV1Abi,
  bundlesPermitParameters,
} from "@morpho-org/morpho-sdk/abis";
import { getChainAddresses } from "@morpho-org/morpho-ts";
import { marketParamsAbi } from "@morpho-org/morpho-ts/abis";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  maxUint256,
  zeroAddress,
  zeroHash,
} from "viem";
import { describe, expect, it } from "vitest";
import {
  CalldataAmountError,
  CalldataCallError,
  CalldataDecodeError,
  CalldataFeeError,
  CalldataRecipientError,
  CalldataTargetError,
  verifyCalldata,
} from "./index.js";
import { blueCases } from "./test/blue.fixtures.js";

describe("verifyCalldata on Blue", () => {
  it.each(Object.entries(blueCases))(
    "verifies %s and rejects a different market",
    (_name, { intent, calls }) => {
      expect(verifyCalldata(intent, calls).map(({ call }) => call)).toEqual(
        calls,
      );
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            market: zeroHash,
          },
          calls,
        ),
      ).toThrow(CalldataTargetError);
    },
  );

  it("checks the amount, fees, and allowed approval spender", () => {
    const { intent, calls } = blueCases.supply_approvalRequired;
    const [approval, supply] = calls;
    expect(() =>
      verifyCalldata(
        { ...intent, amount: { ...intent.amount, value: "1" } },
        calls,
      ),
    ).toThrow(CalldataAmountError);
    for (const spender of [
      intent.account,
      getChainAddresses(intent.chain_id).blue,
    ]) {
      expect(() =>
        verifyCalldata(intent, [
          {
            ...approval,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [spender, maxUint256],
            }),
          },
          supply,
        ]),
      ).toThrow(CalldataTargetError);
    }
    expect(() =>
      verifyCalldata(intent, [{ ...approval, to: intent.account }, supply]),
    ).toThrow(CalldataTargetError);
    const approve = (amount: bigint) => ({
      ...approval,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [supply.to, amount],
      }),
    });
    const assets = BigInt(intent.amount.value);
    expect(verifyCalldata(intent, [approve(assets), supply])).toHaveLength(2);
    expect(() =>
      verifyCalldata(intent, [approve(assets - 1n), supply]),
    ).toThrow(CalldataAmountError);
    const fee = blueCases.supply_referralFee;
    expect(() =>
      verifyCalldata({ ...fee.intent, max_fee_bps: 0 }, fee.calls),
    ).toThrow(CalldataFeeError);
  });

  it("rejects a Blue fee above the requested rate but within max_fee_bps", () => {
    const { intent, calls } = blueCases.supply_referralFee;
    expect(() => verifyCalldata(intent, calls)).not.toThrow();
    expect(() =>
      verifyCalldata(
        { ...intent, referral_fee: { ...intent.referral_fee, bps: 0 } },
        calls,
      ),
    ).toThrow(CalldataFeeError);
  });

  it.each([blueCases.borrow_referralFee, blueCases.refinance_referralFee])(
    "rejects a fee over the caller cap on $intent.action",
    ({ intent, calls }) => {
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
      expect(() =>
        verifyCalldata({ ...intent, max_fee_bps: 0 }, calls),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataFeeError,
          field: "max_fee_bps",
        }),
      );
    },
  );

  it("rejects a Blue withdrawal selector for a supply", () => {
    const {
      intent,
      calls: [call],
    } = blueCases.supply_allowanceSufficient;
    const withdrawal = blueCases.withdraw_assets.calls.at(-1);
    if (!withdrawal) throw new Error("Expected withdrawal");
    expect(() =>
      verifyCalldata(intent, [{ ...call, data: withdrawal.data }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "function",
        callId: call.id,
      }),
    );
  });

  it("rejects a non-string Blue market with a typed error", () => {
    const { intent, calls } = blueCases.supply_allowanceSufficient;
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...intent, market: 1 }, calls),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataTargetError,
        field: "market",
      }),
    );
  });

  it("rejects a zero encoded Blue supply even if the requested amount is zero", () => {
    const {
      intent,
      calls: [call],
    } = blueCases.supply_allowanceSufficient;
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Supply")
      throw new Error("Expected supply");
    const [market, , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, 0n, ...rest],
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

  it("rejects unknown units on fixed-asset and position amounts", () => {
    for (const { intent, calls } of [
      blueCases.supply_allowanceSufficient,
      blueCases.withdraw_shares,
    ]) {
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            // @ts-expect-error Test an unvalidated intent.
            amount: { unit: "unknown", value: intent.amount.value },
          },
          calls,
        ),
      ).toThrow(CalldataAmountError);
    }
  });

  it("requires authorization for native Blue supply", () => {
    const {
      intent,
      calls: [call],
    } = blueCases.supply_allowanceSufficient;
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Supply") {
      throw new Error("Expected supply");
    }
    const [params, assets, ...rest] = decoded.args;
    const loanToken = getChainAddresses(intent.chain_id).wNative;
    if (loanToken == null) throw new Error("Expected wrapped native token");
    const marketParams = { ...params, loanToken };
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [marketParams, assets, ...rest],
    });
    const request = {
      ...intent,
      market: keccak256(encodeAbiParameters([marketParamsAbi], [marketParams])),
    };
    const payable = [{ ...call, data, value: assets.toString() }];
    const nativeFunding = {
      type: "native",
      max_native_assets: (assets + 1n).toString(),
    } as const;
    expect(() =>
      verifyCalldata({ ...intent, funding: nativeFunding }, [
        { ...call, value: assets.toString() },
      ]),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata({ ...request, funding: nativeFunding }, [
        { ...call, data, value: nativeFunding.max_native_assets },
      ]),
    ).toThrow(CalldataAmountError);
    expect(() => verifyCalldata(request, payable)).toThrow(CalldataAmountError);
    const funding = { type: "unknown", max_native_assets: assets.toString() };
    expect(() =>
      // @ts-expect-error Test an unvalidated intent.
      verifyCalldata({ ...request, funding }, payable),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(
        {
          ...request,
          funding: { type: "auto", max_native_assets: "1" },
        },
        payable,
      ),
    ).toThrow(CalldataAmountError);
    expect(
      verifyCalldata(
        {
          ...request,
          funding: { type: "native", max_native_assets: assets.toString() },
        },
        payable,
      ),
    ).toHaveLength(1);
  });

  it.each([blueCases.supply_allowanceSufficient, blueCases.withdraw_assets])(
    "rejects a missing amount on $intent.action",
    ({ intent: { amount: _amount, ...intent }, calls }) => {
      expect(() =>
        // @ts-expect-error Test an unvalidated intent.
        verifyCalldata(intent, calls),
      ).toThrow(CalldataAmountError);
    },
  );

  it("rejects native Blue funding with an embedded ERC-2612 permit", () => {
    const {
      intent,
      calls: [call],
    } = blueCases.supply_allowanceSufficient;
    const abi = blueBundlesV1Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (functionName !== "blueBundlesV1Supply") {
      throw new Error("Expected supply");
    }
    const [params, assets, , fee, recipient, deadline] = args;
    const loanToken = getChainAddresses(intent.chain_id).wNative;
    if (loanToken == null) throw new Error("Expected wrapped native token");
    const market = { ...params, loanToken };
    const kind = BundlesPermitKind.ERC2612;
    const scalar = `0x${"11".repeat(32)}` as const;
    const permit = {
      kind,
      data: encodeAbiParameters(bundlesPermitParameters[kind], [
        deadline,
        27,
        scalar,
        scalar,
      ]),
    };
    const data = encodeFunctionData({
      abi,
      functionName,
      args: [market, assets, permit, fee, recipient, deadline],
    });
    const request = {
      ...intent,
      market: keccak256(encodeAbiParameters([marketParamsAbi], [market])),
      funding: { type: "native", max_native_assets: assets.toString() },
    } as const;
    expect(verifyCalldata(request, [{ ...call, data }])).toHaveLength(1);
    expect(() =>
      verifyCalldata(request, [{ ...call, data, value: assets.toString() }]),
    ).toThrow(CalldataAmountError);
  });

  it("rejects unauthorized or duplicated delegation", () => {
    const { intent, calls } = blueCases.borrow_exactAssets;
    const [auth, borrow] = calls;
    expect(() =>
      verifyCalldata(intent, [
        {
          ...auth,
          data: encodeFunctionData({
            abi: blueAbi,
            functionName: "setAuthorization",
            args: [intent.account, true],
          }),
        },
        borrow,
      ]),
    ).toThrow(CalldataTargetError);
    expect(() => verifyCalldata(intent, [auth, auth, borrow])).toThrow(
      CalldataCallError,
    );
  });

  it.each(["value", "disabled", "selector"] as const)(
    "rejects Blue authorization with invalid %s",
    (change) => {
      const {
        intent,
        calls: [auth, borrow],
      } = blueCases.borrow_exactAssets;
      const expected =
        change === "value"
          ? { constructor: CalldataAmountError, field: "value" }
          : { constructor: CalldataCallError, field: "authorization" };
      const abi = blueAbi;
      const data =
        change === "disabled"
          ? encodeFunctionData({
              abi,
              functionName: "setAuthorization",
              args: [borrow.to, false],
            })
          : change === "selector"
            ? encodeFunctionData({
                abi,
                functionName: "isAuthorized",
                args: [intent.account, borrow.to],
              })
            : auth.data;
      expect(() =>
        verifyCalldata(intent, [
          { ...auth, data, value: change === "value" ? "1" : auth.value },
          borrow,
        ]),
      ).toThrow(expect.objectContaining({ ...expected, callId: auth.id }));
    },
  );

  it("requires a zero approval to be followed by a positive approval", () => {
    const { intent, calls } = blueCases.repay_exactAssets;
    const [approval, ...remaining] = calls;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected repay");
    const reset = {
      ...approval,
      id: "reset",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [call.to, 0n],
      }),
    };
    expect(() =>
      verifyCalldata(intent, [reset, approval, ...remaining]),
    ).not.toThrow();
    expect(() => verifyCalldata(intent, [reset, ...remaining])).toThrow(
      CalldataCallError,
    );
    expect(() =>
      verifyCalldata(intent, [approval, approval, ...remaining]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
      }),
    );
    expect(() =>
      verifyCalldata(intent, [reset, approval, approval, ...remaining]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
      }),
    );
    expect(() =>
      verifyCalldata(intent, [
        reset,
        { ...reset, id: "second-reset" },
        approval,
        ...remaining,
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
        callId: "second-reset",
      }),
    );
  });

  it("rejects unnecessary Blue authorization on a repay without collateral changes", () => {
    const { intent, calls } = blueCases.repay_exactAssets;
    const [authorization] = blueCases.borrow_exactAssets.calls;
    expect(() => verifyCalldata(intent, [authorization, ...calls])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "authorization",
        callId: authorization.id,
      }),
    );
  });

  it("rejects an approval when Blue calldata does not pull tokens", () => {
    const { intent, calls } = blueCases.withdraw_assets;
    const [approval] = blueCases.supply_approvalRequired.calls;
    expect(() => verifyCalldata(intent, [approval, ...calls])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "approval",
        callId: approval.id,
      }),
    );
  });

  it("rejects native value when a Blue borrow does not pull collateral", () => {
    const {
      intent,
      calls: [authorization, call],
    } = blueCases.borrow_exactAssets;
    const fundedIntent = {
      ...intent,
      funding: { type: "native", max_native_assets: "1" },
    } as const;
    expect(
      // @ts-expect-error Test funding on a borrow without collateral.
      verifyCalldata(fundedIntent, [authorization, call]),
    ).toHaveLength(2);
    expect(() =>
      // @ts-expect-error Test funding on a borrow without collateral.
      verifyCalldata(fundedIntent, [authorization, { ...call, value: "1" }]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "value",
        callId: call.id,
      }),
    );
  });

  it("rejects zero exact amounts that match the unused calldata slot", () => {
    const repay = blueCases.repay_exactAssets;
    const withdraw = blueCases.withdraw_shares;
    expect(() =>
      verifyCalldata(
        { ...repay.intent, amount: { unit: "shares", value: "0" } },
        repay.calls,
      ),
    ).toThrow(CalldataAmountError);
    expect(() =>
      verifyCalldata(
        { ...withdraw.intent, amount: { unit: "assets", value: "0" } },
        withdraw.calls,
      ),
    ).toThrow(CalldataAmountError);
  });

  it.each([
    { rule: "nonzero unused slot", assets: 1n, shares: 1000n, value: "1000" },
    { rule: "zero exact amount", assets: 0n, shares: 0n, value: "0" },
  ])("rejects an exact withdraw with a $rule", ({ assets, shares, value }) => {
    const {
      intent,
      calls: [authorization, call],
    } = blueCases.withdraw_shares;
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Withdraw") {
      throw new Error("Expected withdraw");
    }
    const [market, , , ...remaining] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, assets, shares, ...remaining],
    });
    expect(() =>
      verifyCalldata({ ...intent, amount: { ...intent.amount, value } }, [
        authorization,
        { ...call, data },
      ]),
    ).toThrow(CalldataAmountError);
  });

  it("distinguishes repay-all from an exact share repay", () => {
    const { intent, calls } = blueCases.repay_allShares;
    expect(() =>
      verifyCalldata(
        { ...intent, amount: { unit: "shares", value: maxUint256.toString() } },
        calls,
      ),
    ).toThrow(CalldataAmountError);
  });

  it("rejects a larger maxRepayAssets on an exact-assets repay", () => {
    const { intent, calls } = blueCases.repay_exactAssets;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected repay");
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
      throw new Error("Expected repay");
    }
    const args: [...typeof decoded.args] = [...decoded.args];
    expect(() => verifyCalldata(intent, calls)).not.toThrow();
    args[3] += 1n;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args,
    });
    expect(() =>
      verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
    ).toThrow(CalldataAmountError);
  });

  it("rounds down the referral fee when checking an exact-assets repay cap", () => {
    const {
      intent,
      calls: [approval, repay],
    } = blueCases.repay_exactAssets;
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: repay.data });
    if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
      throw new Error("Expected repay");
    }
    const [market, , shares, , collateral, ltv, permit, auth, , , deadline] =
      decoded.args;
    const request = {
      ...intent,
      max_fee_bps: 100,
      referral_fee: { bps: 100, recipient: intent.account },
      amount: { unit: "assets", value: "101" },
    } as const;
    const verify = (
      maxRepayAssets: bigint,
      maxFeeBps: number = request.max_fee_bps,
    ) =>
      verifyCalldata({ ...request, max_fee_bps: maxFeeBps }, [
        approval,
        {
          ...repay,
          data: encodeFunctionData({
            abi,
            functionName: decoded.functionName,
            args: [
              market,
              101n,
              shares,
              maxRepayAssets,
              collateral,
              ltv,
              permit,
              auth,
              10n ** 16n,
              intent.account,
              deadline,
            ],
          }),
        },
      ]);
    expect(verify(102n)).toHaveLength(2);
    expect(() => verify(103n)).toThrow(CalldataAmountError);
    expect(() => verify(102n, 0)).toThrow(
      expect.objectContaining({
        constructor: CalldataFeeError,
        field: "max_fee_bps",
      }),
    );
  });

  it("rejects malformed embedded Morpho authorization signatures", () => {
    const { intent, calls } = blueCases.withdraw_assets;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected withdraw");
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Withdraw")
      throw new Error("Expected withdraw");
    const args: [...typeof decoded.args] = [...decoded.args];
    const component = keccak256("0x01");
    const signature = { v: 27, r: component, s: component };
    const verifySignature = (input: typeof signature) => {
      args[3] = { signature: input, nonce: 0n, deadline: 1820000000n };
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args,
      });
      return verifyCalldata(intent, [{ ...call, data }]);
    };
    expect(() => verifySignature(signature)).not.toThrow();
    for (const malformed of [
      { ...signature, v: 0 },
      { ...signature, r: zeroHash },
      { ...signature, s: zeroHash },
    ]) {
      expect(() => verifySignature(malformed)).toThrow(CalldataDecodeError);
    }
  });

  it("rejects a standalone authorization before an embedded authorization", () => {
    const { intent, calls } = blueCases.withdraw_assets;
    const [grant, call] = calls;
    if (!grant || !call) throw new Error("Expected a grant and withdrawal");
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Withdraw")
      throw new Error("Expected withdraw");
    const [market, assets, shares, , ...rest] = decoded.args;
    const component = keccak256("0x01");
    const authorization = {
      signature: { v: 27, r: component, s: component },
      nonce: 0n,
      deadline: 1820000000n,
    };
    const bundle = {
      ...call,
      data: encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args: [market, assets, shares, authorization, ...rest],
      }),
    };
    expect(verifyCalldata(intent, calls)).toHaveLength(2);
    expect(verifyCalldata(intent, [bundle])).toHaveLength(1);
    expect(() => verifyCalldata(intent, [grant, bundle])).toThrow(
      expect.objectContaining({
        constructor: CalldataCallError,
        field: "authorization",
        callId: grant.id,
      }),
    );
  });

  it("rejects an altered refinance destination", () => {
    const { intent, calls } = blueCases.refinance_noFee;
    expect(() =>
      verifyCalldata(
        { ...intent, destination_market: `1:${intent.market}` },
        calls,
      ),
    ).toThrow(CalldataTargetError);
  });

  it.each([
    blueCases.borrow_exactAssets,
    blueCases.collateral_withdraw,
    blueCases.refinance_noFee,
  ])(
    "requires the liquidation buffer for $intent.action",
    ({ intent, calls }) => {
      const call = calls.at(-1);
      if (!call) throw new Error("Expected a final bundle call");
      const abi = blueBundlesV1Abi;
      const { functionName, args } = decodeFunctionData({
        abi,
        data: call.data,
      });
      const data = (() => {
        switch (functionName) {
          case "blueBundlesV1SupplyCollateralAndBorrow":
            return encodeFunctionData({
              abi,
              functionName,
              args: [
                args[0],
                args[1],
                args[2],
                maxUint256,
                args[4],
                args[5],
                args[6],
                args[7],
                args[8],
                args[9],
              ],
            });
          case "blueBundlesV1RepayAndWithdrawCollateral":
            return encodeFunctionData({
              abi,
              functionName,
              args: [
                args[0],
                args[1],
                args[2],
                args[3],
                args[4],
                maxUint256,
                args[6],
                args[7],
                args[8],
                args[9],
                args[10],
              ],
            });
          case "blueBundlesV1MigrateBorrowPosition":
            return encodeFunctionData({
              abi,
              functionName,
              args: [
                args[0],
                args[1],
                maxUint256,
                args[3],
                args[4],
                args[5],
                args[6],
                args[7],
              ],
            });
          default:
            throw new Error("Expected an LTV-protected bundle");
        }
      })();
      expect(() =>
        verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
      ).toThrow(CalldataAmountError);
    },
  );

  it("checks embedded funding permit kinds and ABI payloads", () => {
    const {
      intent,
      calls: [call],
    } = blueCases.supply_allowanceSufficient;
    const abi = blueBundlesV1Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (functionName !== "blueBundlesV1Supply")
      throw new Error("Expected supply");
    const [params, assets, , fee, recipient, deadline] = args;
    const verify = (permit: (typeof args)[2]) =>
      verifyCalldata(intent, [
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [params, assets, permit, fee, recipient, deadline],
          }),
        },
      ]);
    const scalar = `0x${"11".repeat(32)}` as const;
    const data = encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "uint8" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [deadline, 27, scalar, scalar],
    );
    expect(verify({ kind: 1, data })).toHaveLength(1);
    expect(() => verify({ kind: 2, data })).toThrow(CalldataCallError);
    expect(() => verify({ kind: 1, data: "0x" })).toThrow(CalldataDecodeError);
    const parameters = bundlesPermitParameters[BundlesPermitKind.ERC2612];
    for (const malformed of [
      encodeAbiParameters(parameters, [deadline, 29, scalar, scalar]),
      encodeAbiParameters(parameters, [deadline, 27, zeroHash, scalar]),
      encodeAbiParameters(parameters, [deadline, 27, scalar, zeroHash]),
      `${data}00` as const,
    ]) {
      const verifyMalformed = () => verify({ kind: 1, data: malformed });
      expect(verifyMalformed).toThrow(
        expect.objectContaining({
          constructor: CalldataDecodeError,
          field: "permit.data",
        }),
      );
      expect(verifyMalformed).not.toThrow(
        expect.objectContaining({ cause: expect.any(CalldataDecodeError) }),
      );
    }
  });

  it("accepts distinct idle and market sources, and rejects invalid reallocations", () => {
    const {
      intent,
      calls: [auth, call],
    } = blueCases.borrow_exactAssets;
    const abi = blueBundlesV1Abi;
    const { functionName, args } = decodeFunctionData({ abi, data: call.data });
    if (functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
      throw new Error("Expected borrow");
    const [
      marketParams,
      collateral,
      borrow,
      ltv,
      permit,
      authorization,
      ,
      fee,
      recipient,
      deadline,
    ] = args;
    const idle = {
      marketParams,
      sourceMarketParams: marketParams,
      fromIdle: true,
      vault: "0x1000000000000000000000000000000000000002",
      adapter: "0x1000000000000000000000000000000000000003",
      sourceAdapter: zeroAddress,
      penalty: 0n,
      assets: 123n,
    } as const;
    const market = {
      ...idle,
      fromIdle: false,
      sourceAdapter: idle.adapter,
      sourceMarketParams: { ...marketParams, irm: idle.vault },
    };
    const verify = (reallocations: (typeof args)[6]) =>
      verifyCalldata(intent, [
        auth,
        {
          ...call,
          data: encodeFunctionData({
            abi,
            functionName,
            args: [
              marketParams,
              collateral,
              borrow,
              ltv,
              permit,
              authorization,
              reallocations,
              fee,
              recipient,
              deadline,
            ],
          }),
        },
      ]);
    expect(verify([idle, market])).toHaveLength(2);
    expect(() =>
      verify([{ ...idle, marketParams: market.sourceMarketParams }]),
    ).toThrow(CalldataCallError);
    expect(() => verify([idle, idle])).toThrow(CalldataCallError);
    expect(() =>
      verify([
        idle,
        { ...idle, sourceMarketParams: market.sourceMarketParams },
      ]),
    ).toThrow(CalldataCallError);
    expect(() => verify([{ ...idle, penalty: 1n }])).toThrow(CalldataFeeError);
    expect(() => verify([{ ...market, sourceAdapter: zeroAddress }])).toThrow(
      CalldataCallError,
    );
    for (const invalid of [
      { ...idle, assets: 0n },
      { ...idle, vault: zeroAddress },
      { ...idle, adapter: zeroAddress },
      {
        ...idle,
        sourceMarketParams: {
          ...idle.sourceMarketParams,
          loanToken: zeroAddress,
        },
      },
    ]) {
      expect(() => verify([invalid])).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "reallocations",
        }),
      );
    }
  });

  it("checks both legs when a borrow or repay includes collateral", () => {
    const variants = [
      blueCases.borrow_supplyCollateralAndBorrow,
      blueCases.repay_repayAndWithdrawCollateral,
    ];
    for (const { intent, calls } of variants) {
      expect(() =>
        verifyCalldata(
          { ...intent, collateral_amount: { unit: "assets", value: "1" } },
          calls,
        ),
      ).toThrow(CalldataAmountError);
    }
  });

  it.each([
    { changed: "borrow", field: "amount", error: CalldataAmountError },
    { changed: "reallocations", field: "borrow", error: CalldataCallError },
    { changed: "authorization", field: "borrow", error: CalldataCallError },
    { changed: "permit", field: "permit.kind", error: CalldataCallError },
  ])(
    "rejects an unexpected $changed on a Blue collateral supply",
    ({ changed, field, error }) => {
      const {
        intent,
        calls: [approval, call],
      } = blueCases.collateral_supply;
      const abi = blueBundlesV1Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
        throw new Error("Expected collateral supply");
      const args: [...typeof decoded.args] = [...decoded.args];
      const component = keccak256("0x01");
      switch (changed) {
        case "borrow":
          args[2] = 1n;
          break;
        case "reallocations":
          args[6] = [
            {
              marketParams: args[0],
              sourceMarketParams: args[0],
              fromIdle: true,
              vault: intent.account,
              adapter: intent.account,
              sourceAdapter: zeroAddress,
              penalty: 0n,
              assets: 1n,
            },
          ];
          break;
        case "authorization":
          args[5] = {
            ...args[5],
            signature: { v: 27, r: component, s: component },
          };
          break;
        case "permit":
          args[4] = { ...args[4], kind: 255 };
          break;
      }
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args,
      });
      expect(verifyCalldata(intent, [approval, call])).toHaveLength(2);
      expect(() =>
        verifyCalldata(intent, [approval, { ...call, data }]),
      ).toThrow(
        expect.objectContaining({ constructor: error, field, callId: call.id }),
      );
    },
  );

  it.each([
    {
      changed: "collateral",
      error: CalldataAmountError,
      field: "collateral_amount",
    },
    { changed: "permit", error: CalldataCallError, field: "permit" },
  ])(
    "rejects unexpected $changed in a Blue borrow with no supply",
    ({ changed, error, field }) => {
      const {
        intent,
        calls: [authorization, call],
      } = blueCases.borrow_exactAssets;
      const abi = blueBundlesV1Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "blueBundlesV1SupplyCollateralAndBorrow")
        throw new Error("Expected borrow");
      const args: [...typeof decoded.args] = [...decoded.args];
      if (changed === "collateral") args[1] = 1n;
      else args[4] = { ...args[4], kind: 1 };
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args,
      });
      expect(() =>
        verifyCalldata(intent, [authorization, { ...call, data }]),
      ).toThrow(
        expect.objectContaining({ constructor: error, field, callId: call.id }),
      );
    },
  );

  it.each([
    { changed: "permit", error: CalldataCallError, field: "permit.kind" },
    {
      changed: "authorization",
      error: CalldataCallError,
      field: "authorization",
    },
  ])(
    "rejects unexpected $changed in a Blue repay with no withdrawal",
    ({ changed, error, field }) => {
      const {
        intent,
        calls: [approval, call],
      } = blueCases.repay_exactAssets;
      const abi = blueBundlesV1Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral")
        throw new Error("Expected repayment");
      const args: [...typeof decoded.args] = [...decoded.args];
      const component = keccak256("0x01");
      if (changed === "permit") args[6] = { ...args[6], kind: 255 };
      else
        args[7] = {
          ...args[7],
          signature: { v: 27, r: component, s: component },
        };
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args,
      });
      expect(() =>
        verifyCalldata(intent, [approval, { ...call, data }]),
      ).toThrow(
        expect.objectContaining({ constructor: error, field, callId: call.id }),
      );
    },
  );

  it.each([blueCases.withdraw_assets, blueCases.refinance_noFee])(
    "rejects a zero-asset reallocation in $intent.action",
    ({ intent, calls }) => {
      const call = calls.at(-1);
      if (!call) throw new Error("Expected bundle call");
      const abi = blueBundlesV1Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      const reallocation = (marketParams: typeof withdrawalMarket) => ({
        marketParams,
        sourceMarketParams: marketParams,
        fromIdle: true,
        vault: intent.account,
        adapter: intent.account,
        sourceAdapter: zeroAddress,
        penalty: 0n,
        assets: 0n,
      });
      const withdrawalMarket = (() => {
        if (decoded.functionName === "blueBundlesV1Withdraw")
          return decoded.args[0];
        if (decoded.functionName === "blueBundlesV1MigrateBorrowPosition")
          return decoded.args[1];
        throw new Error("Expected withdrawal or refinance");
      })();
      if (
        decoded.functionName !== "blueBundlesV1Withdraw" &&
        decoded.functionName !== "blueBundlesV1MigrateBorrowPosition"
      ) {
        throw new Error("Expected withdrawal or refinance");
      }
      const [first, second, third, auth, , ...rest] = decoded.args;
      const data = encodeFunctionData({
        abi,
        ...(decoded.functionName === "blueBundlesV1Withdraw" &&
        typeof second === "bigint"
          ? {
              functionName: "blueBundlesV1Withdraw",
              args: [
                first,
                second,
                third,
                auth,
                [reallocation(withdrawalMarket)],
                ...rest,
              ],
            }
          : {
              functionName: "blueBundlesV1MigrateBorrowPosition",
              args: [
                first,
                withdrawalMarket,
                third,
                auth,
                [reallocation(withdrawalMarket)],
                ...rest,
              ],
            }),
      });
      expect(() =>
        verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "reallocations",
        }),
      );
    },
  );

  it.each(["assets", "shares", "maximum", "permit"] as const)(
    "rejects encoded repayment %s for a Blue collateral-only withdrawal",
    (field) => {
      const { intent, calls } = blueCases.collateral_withdraw;
      const call = calls.at(-1);
      if (!call) throw new Error("Expected collateral withdrawal");
      const abi = blueBundlesV1Abi;
      const decoded = decodeFunctionData({ abi, data: call.data });
      if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
        throw new Error("Expected repay and withdraw collateral");
      }
      const args: [...typeof decoded.args] = [...decoded.args];
      switch (field) {
        case "assets":
          args[1] = 1n;
          break;
        case "shares":
          args[2] = 1n;
          break;
        case "maximum":
          args[3] = 1n;
          break;
        case "permit":
          args[6] = { ...args[6], kind: 1 };
          break;
      }
      const data = encodeFunctionData({
        abi,
        functionName: decoded.functionName,
        args,
      });
      expect(verifyCalldata(intent, calls)).toHaveLength(calls.length);
      expect(() =>
        verifyCalldata(intent, [...calls.slice(0, -1), { ...call, data }]),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataCallError,
          field: "repay",
          callId: call.id,
        }),
      );
    },
  );

  it("rejects a zero maximum in an all-mode Blue repay", () => {
    const { intent, calls } = blueCases.repay_allShares;
    const call = calls.at(-1);
    if (!call) throw new Error("Expected repayment");
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
      throw new Error("Expected repay");
    }
    const [market, assets, shares, , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [market, assets, shares, 0n, ...rest],
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

  it("does not allow an all-withdrawal fee to pay another account", () => {
    const { intent, calls } = blueCases.withdraw_referralFee;
    expect(() =>
      verifyCalldata({ ...intent, amount: { unit: "all" } }, calls),
    ).toThrow(CalldataRecipientError);
  });

  it("does not allow a repay-only call to withdraw collateral", () => {
    const { intent, calls } = blueCases.repay_exactAssets;
    const [approval, repay] = calls;
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: repay.data });
    if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral")
      throw new Error("Expected repayment");
    const [
      market,
      assets,
      shares,
      max,
      ,
      ltv,
      permit,
      auth,
      fee,
      recipient,
      expiry,
    ] = decoded.args;
    expect(() =>
      verifyCalldata(intent, [
        approval,
        {
          ...repay,
          data: encodeFunctionData({
            abi,
            functionName: decoded.functionName,
            args: [
              market,
              assets,
              shares,
              max,
              1n,
              ltv,
              permit,
              auth,
              fee,
              recipient,
              expiry,
            ],
          }),
        },
      ]),
    ).toThrow(
      expect.objectContaining({
        constructor: CalldataAmountError,
        field: "collateral_amount",
      }),
    );
  });
});
