import {
  blueMarketParamsAbi,
  midnightEcrecoverRatifierAbi,
} from "@morpho-org/morpho-sdk/abis";
import { addresses } from "@morpho-org/morpho-sdk/addresses";
import { marketParamsAbi as rawBlueMarketParamsAbi } from "@morpho-org/morpho-sdk/blue/abis";
import { addresses as rawBlueAddresses } from "@morpho-org/morpho-sdk/blue/addresses";
import { LIQUIDATION_CURSOR as rawBlueLiquidationCursor } from "@morpho-org/morpho-sdk/blue/constants";
import { Market as RawBlueMarket } from "@morpho-org/morpho-sdk/blue/entities";
import { InvalidMarketParamsError as RawBlueInvalidMarketParamsError } from "@morpho-org/morpho-sdk/blue/errors";
import { fetchPosition as rawFetchBluePosition } from "@morpho-org/morpho-sdk/blue/fetch";
import type { MarketId as RawBlueMarketId } from "@morpho-org/morpho-sdk/blue/types";
import { MarketUtils as RawBlueMarketUtils } from "@morpho-org/morpho-sdk/blue/utils";
import {
  BLUE_LIQUIDATION_CURSOR,
  MIDNIGHT_CBP,
} from "@morpho-org/morpho-sdk/constants";
import {
  BlueMarket,
  Market as LegacyBlueMarket,
  MidnightMarket,
} from "@morpho-org/morpho-sdk/entities";
import {
  InvalidBlueMarketParamsError,
  InvalidMidnightOfferGroupError,
} from "@morpho-org/morpho-sdk/errors";
import {
  fetchBluePosition,
  fetchMidnightPosition,
} from "@morpho-org/morpho-sdk/fetch";
import { ecrecoverRatifierAbi as rawMidnightEcrecoverRatifierAbi } from "@morpho-org/morpho-sdk/midnight/abis";
import { CBP as rawMidnightCbp } from "@morpho-org/morpho-sdk/midnight/constants";
import { Market as RawMidnightMarket } from "@morpho-org/morpho-sdk/midnight/entities";
import { InvalidOfferGroupError as RawMidnightInvalidOfferGroupError } from "@morpho-org/morpho-sdk/midnight/errors";
import { fetchPosition as rawFetchMidnightPosition } from "@morpho-org/morpho-sdk/midnight/fetch";
import type { RatifierInfo as RawMidnightRatifierInfo } from "@morpho-org/morpho-sdk/midnight/types";
import { MarketUtils as RawMidnightMarketUtils } from "@morpho-org/morpho-sdk/midnight/utils";
import type {
  BlueMarketId,
  MidnightRatifierInfo,
} from "@morpho-org/morpho-sdk/types";
import {
  BlueMarketUtils,
  MidnightMarketUtils,
} from "@morpho-org/morpho-sdk/utils";
import { describe, expect, test } from "vitest";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

describe("protocol facades", () => {
  test.each([
    [blueMarketParamsAbi, rawBlueMarketParamsAbi],
    [addresses, rawBlueAddresses],
    [BLUE_LIQUIDATION_CURSOR, rawBlueLiquidationCursor],
    [BlueMarket, RawBlueMarket],
    [LegacyBlueMarket, RawBlueMarket],
    [InvalidBlueMarketParamsError, RawBlueInvalidMarketParamsError],
    [fetchBluePosition, rawFetchBluePosition],
    [BlueMarketUtils, RawBlueMarketUtils],
    [midnightEcrecoverRatifierAbi, rawMidnightEcrecoverRatifierAbi],
    [MIDNIGHT_CBP, rawMidnightCbp],
    [MidnightMarket, RawMidnightMarket],
    [InvalidMidnightOfferGroupError, RawMidnightInvalidOfferGroupError],
    [fetchMidnightPosition, rawFetchMidnightPosition],
    [MidnightMarketUtils, RawMidnightMarketUtils],
  ])("preserves runtime identity", (facade, raw) => {
    expect(facade).toBe(raw);
  });

  test("preserves type identities", () => {
    const blue: Equal<BlueMarketId, RawBlueMarketId> = true;
    const midnight: Equal<MidnightRatifierInfo, RawMidnightRatifierInfo> = true;

    expect({ blue, midnight }).toEqual({ blue: true, midnight: true });
  });
});
