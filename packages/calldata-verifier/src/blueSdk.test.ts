import {
  blueBorrow,
  blueRefinance,
  blueRepay,
  blueSupply,
  blueSupplyCollateral,
  blueWithdraw,
  blueWithdrawCollateral,
} from "@morpho-org/morpho-sdk";
import { blueBundlesV1Abi } from "@morpho-org/morpho-sdk/abis";
import { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
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
  CalldataTargetError,
  verifyCalldata,
} from "./index.js";
import { sdkCall } from "./test/sdkCall.js";
import type { CalldataIntent } from "./types.js";

const account = "0x1000000000000000000000000000000000000001";
const other = "0x2000000000000000000000000000000000000002";
const params = {
  loanToken: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  collateralToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  oracle: other,
  irm: other,
  lltv: 860000000000000000n,
} as const;
const marketParams = new MarketParams(params);
const destinationMarketParams = new MarketParams({
  ...params,
  lltv: 770000000000000000n,
});
const market = { chainId: 1, marketParams };
const base = {
  chain_id: market.chainId,
  account,
  market: marketParams.id as Hex,
  max_fee_bps: 0,
} as const;
const args = { userAddress: account, deadline: 1820000000n } as const;
const funded = {
  amount: { unit: "assets", value: "100" },
  funding: { type: "erc20" },
} as const;

it("requires the Base bundle for a Base Blue supply", () => {
  const chainId = 8453;
  const call = sdkCall(
    blueSupply({
      market: { chainId, marketParams },
      args: { ...args, assets: 100n },
    }),
  );
  const intent = {
    ...base,
    ...funded,
    chain_id: chainId,
    action: "blue.supply",
  } as const;
  expect(call.to).toBe(getChainAddress(chainId, "bundles.blueBundlesV1"));
  expect(verifyCalldata(intent, [call])).toHaveLength(1);
  const to = getChainAddress(1, "bundles.blueBundlesV1");
  expect(() => verifyCalldata(intent, [{ ...call, to }])).toThrow(
    expect.objectContaining({ constructor: CalldataTargetError, field: "to" }),
  );
});

it("verifies an ERC-2612 permit encoded by the Blue supply builder", () => {
  const spender = getChainAddress(market.chainId, "bundles.blueBundlesV1");
  const amount = 100n;
  const tx = blueSupply({
    market,
    args: {
      ...args,
      assets: amount,
      requirementSignature: {
        action: {
          type: "permit",
          args: { spender, amount, deadline: args.deadline },
        },
        args: {
          owner: account,
          asset: params.loanToken,
          amount,
          nonce: 0n,
          deadline: args.deadline,
          signature: serializeSignature({
            v: 27n,
            r: toHex(1n, { size: 32 }),
            s: toHex(1n, { size: 32 }),
          }),
        },
      },
    },
  });
  const [decoded] = verifyCalldata(
    { ...base, ...funded, action: "blue.supply" },
    [sdkCall(tx)],
  );
  expect(decoded?.args[2]).toMatchObject({ kind: 1 });
});

const invalidAllAmounts = [
  { pair: "both zero", assets: 0n, withdrawShares: 0n, repayShares: 0n },
  {
    pair: "both nonzero",
    assets: 1n,
    withdrawShares: 100n,
    repayShares: maxUint256,
  },
] as const;

it.each(invalidAllAmounts)(
  "verifies an SDK-built Blue withdraw in all mode and rejects $pair",
  ({ assets, withdrawShares }) => {
    const tx = blueWithdraw({
      market,
      args: { ...args, withdrawAssets: 0n, withdrawShares: 100n },
    });
    const call = sdkCall(tx);
    const intent = {
      ...base,
      amount: { unit: "all" },
      action: "blue.withdraw",
    } as const;
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1Withdraw") {
      throw new Error("Expected withdraw");
    }
    const [encodedMarket, , , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [encodedMarket, assets, withdrawShares, ...rest],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      CalldataAmountError,
    );
  },
);

it.each([
  ...invalidAllAmounts,
  { pair: "finite shares", assets: 0n, repayShares: 100n },
])(
  "verifies an SDK-built Blue repay in all mode and rejects $pair",
  ({ assets, repayShares }) => {
    const call = sdkCall(
      blueRepay({
        market,
        args: {
          ...args,
          repayAssets: 0n,
          repayShares: maxUint256,
          maxRepayAssets: 101n,
        },
      }),
    );
    const intent = {
      ...base,
      ...funded,
      amount: { unit: "all" },
      action: "blue.repay",
    } as const;
    expect(verifyCalldata(intent, [call])).toHaveLength(1);
    const abi = blueBundlesV1Abi;
    const decoded = decodeFunctionData({ abi, data: call.data });
    if (decoded.functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
      throw new Error("Expected repay");
    }
    const [encodedMarket, , , ...rest] = decoded.args;
    const data = encodeFunctionData({
      abi,
      functionName: decoded.functionName,
      args: [encodedMarket, assets, repayShares, ...rest],
    });
    expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
      CalldataAmountError,
    );
  },
);

it("rejects changing only the shares on an SDK-built exact-share repay", () => {
  const call = sdkCall(
    blueRepay({
      market,
      args: {
        ...args,
        repayAssets: 0n,
        repayShares: 100n,
        maxRepayAssets: 101n,
      },
    }),
  );
  const intent = {
    ...base,
    ...funded,
    amount: { unit: "shares", value: "100" },
    action: "blue.repay",
  } as const;
  expect(() => verifyCalldata(intent, [call])).not.toThrow();
  const abi = blueBundlesV1Abi;
  const { functionName, args: decoded } = decodeFunctionData({
    abi,
    data: call.data,
  });
  if (functionName !== "blueBundlesV1RepayAndWithdrawCollateral") {
    throw new Error("Expected repay");
  }
  const [encodedMarket, assets, shares, ...rest] = decoded;
  const data = encodeFunctionData({
    abi,
    functionName,
    args: [encodedMarket, assets, shares + 1n, ...rest],
  });
  expect(() => verifyCalldata(intent, [{ ...call, data }])).toThrow(
    CalldataAmountError,
  );
});

const cases = [
  {
    intent: { ...base, ...funded, action: "blue.supply" },
    tx: blueSupply({ market, args: { ...args, assets: 100n } }),
  },
  {
    intent: { ...base, amount: funded.amount, action: "blue.withdraw" },
    tx: blueWithdraw({
      market,
      args: { ...args, withdrawAssets: 100n, withdrawShares: 0n },
    }),
  },
  {
    intent: { ...base, ...funded, action: "blue.supply_collateral" },
    tx: blueSupplyCollateral({
      market,
      args: { ...args, collateralAssets: 100n },
    }),
  },
  {
    intent: {
      ...base,
      amount: funded.amount,
      action: "blue.withdraw_collateral",
    },
    tx: blueWithdrawCollateral({
      market,
      args: { ...args, collateralAssets: 100n, maxLtv: 855000000000000000n },
    }),
  },
  {
    intent: { ...base, amount: funded.amount, action: "blue.borrow" },
    tx: blueBorrow({
      market,
      args: { ...args, borrowAssets: 100n, maxLtv: 855000000000000000n },
    }),
  },
  {
    intent: { ...base, ...funded, action: "blue.repay" },
    tx: blueRepay({
      market,
      args: {
        ...args,
        repayAssets: 100n,
        repayShares: 0n,
        maxRepayAssets: 100n,
      },
    }),
  },
  {
    intent: {
      ...base,
      action: "blue.refinance",
      destination_market: `1:${destinationMarketParams.id as Hex}`,
    },
    tx: blueRefinance({
      market: {
        chainId: market.chainId,
        sourceMarketParams: marketParams,
        destinationMarketParams,
      },
      args: { ...args, maxLtv: 765000000000000000n },
    }),
  },
] as const satisfies readonly {
  intent: CalldataIntent;
  tx: Parameters<typeof sdkCall>[0];
}[];

it.each(cases)(
  "verifies SDK-built $intent.action and rejects modified parameters",
  ({ intent, tx }) => {
    const call = sdkCall(tx);
    expect(
      verifyCalldata(intent, [call]).map((decoded) => decoded.call),
    ).toEqual([call]);
    expect(() => verifyCalldata({ ...intent, chain_id: 0 }, [call])).toThrow(
      CalldataChainError,
    );
    expect(() =>
      verifyCalldata({ ...intent, market: zeroHash }, [call]),
    ).toThrow(CalldataTargetError);
    expect(() => verifyCalldata(intent, [{ ...call, to: other }])).toThrow(
      CalldataTargetError,
    );
    expect(() =>
      verifyCalldata(intent, [{ ...call, data: "0xdeadbeef" }]),
    ).toThrow(CalldataDecodeError);
    expect(() => verifyCalldata(intent, [{ ...call, value: "1" }])).toThrow(
      CalldataAmountError,
    );
    expect(() => verifyCalldata(intent, [])).toThrow(CalldataCallError);
    if ("amount" in intent) {
      expect(() =>
        verifyCalldata(
          { ...intent, amount: { ...intent.amount, value: "99" } },
          [call],
        ),
      ).toThrow(CalldataAmountError);
    } else {
      expect(() =>
        verifyCalldata({ ...intent, destination_market: `1:${zeroHash}` }, [
          call,
        ]),
      ).toThrow(CalldataTargetError);
      expect(() =>
        verifyCalldata(
          {
            ...intent,
            destination_market: `8453:${destinationMarketParams.id as Hex}`,
          },
          [call],
        ),
      ).toThrow(
        expect.objectContaining({
          constructor: CalldataTargetError,
          field: "destination_market",
        }),
      );
    }
  },
);
