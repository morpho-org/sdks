import type { FetchParameters as RawBlueFetchParameters } from "@morpho-org/morpho-sdk/blue/types";
import type { MidnightFetchParams } from "@morpho-org/morpho-sdk/midnight/types";
import type {
  BlueFetchParameters,
  BlockNumberOrTag as FacadeBlockNumberOrTag,
} from "@morpho-org/morpho-sdk/types";
import { toBlockParameters } from "@morpho-org/morpho-sdk/utils";
import type { BlockNumberOrTag } from "@morpho-org/morpho-ts";
import { expect, expectTypeOf, test } from "vitest";
import type { BlockNumberOrTag as RootBlockNumberOrTag } from "../index.js";
import type { FetchParameters } from "./data.js";

test("block selector is shared across root, protocol facades, and entities", () => {
  expectTypeOf<RootBlockNumberOrTag>().toEqualTypeOf<BlockNumberOrTag>();
  expectTypeOf<FacadeBlockNumberOrTag>().toEqualTypeOf<BlockNumberOrTag>();
  expectTypeOf<FetchParameters["block"]>().toEqualTypeOf<
    BlockNumberOrTag | undefined
  >();
  expectTypeOf<BlueFetchParameters["block"]>().toEqualTypeOf<
    BlockNumberOrTag | undefined
  >();
  expectTypeOf<RawBlueFetchParameters["block"]>().toEqualTypeOf<
    BlockNumberOrTag | undefined
  >();
  expectTypeOf<MidnightFetchParams["block"]>().toEqualTypeOf<
    BlockNumberOrTag | undefined
  >();
  expectTypeOf<
    Extract<keyof FetchParameters, "blockNumber" | "blockTag">
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<keyof RawBlueFetchParameters, "blockNumber" | "blockTag">
  >().toEqualTypeOf<never>();
  expectTypeOf<
    Extract<keyof MidnightFetchParams, "blockNumber" | "blockTag">
  >().toEqualTypeOf<never>();
  expect(toBlockParameters({ type: "tag", value: "safe" })).toEqual({
    blockTag: "safe",
  });
});
