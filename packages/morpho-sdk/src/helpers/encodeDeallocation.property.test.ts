import { fc, test } from "@fast-check/vitest";
import { MarketParams, marketParamsAbi } from "@morpho-org/blue-sdk";
import { vaultV2Abi } from "@morpho-org/blue-sdk-viem";
import { decodeFunctionData, encodeAbiParameters, maxUint256 } from "viem";
import { describe, expect } from "vitest";
import {
  addressArbitrary as address,
  marketParamsArbitrary as marketParams,
} from "../../test/fixtures/properties.js";
import { NonPositiveInputError } from "../types/index.js";
import { encodeForceDeallocateCall } from "./encodeDeallocation.js";

// vault-v2 VaultV2.sol forceDeallocate(adapter, data, assets, onBehalf): MorphoMarketV1AdapterV2
// abi.decodes `data` as MarketParams; the vault then burns assets.mulDivUp(penalty, WAD) from onBehalf.
describe("encodeForceDeallocateCall", () => {
  test.prop(
    [
      fc.record({
        adapter: address,
        params: fc.option(marketParams, { nil: undefined }),
        amount: fc.oneof(
          fc.constantFrom(1n, maxUint256),
          fc.bigInt({ min: 1n, max: maxUint256 }),
        ),
        onBehalf: address,
      }),
    ],
    { numRuns: 200 },
  )(
    "behavior: decodes to the adapter, ABI-encoded market params, exact amount and owner",
    ({ adapter, params, amount, onBehalf }) => {
      const data = encodeForceDeallocateCall(
        {
          adapter,
          amount,
          marketParams: params && new MarketParams(params),
        },
        onBehalf,
      );
      expect(decodeFunctionData({ abi: vaultV2Abi, data })).toEqual({
        functionName: "forceDeallocate",
        args: [
          adapter,
          params ? encodeAbiParameters([marketParamsAbi], [params]) : "0x",
          amount,
          onBehalf,
        ],
      });
      expect(() =>
        encodeForceDeallocateCall({ adapter, amount: 1n - amount }, onBehalf),
      ).toThrow(NonPositiveInputError);
    },
  );
});
