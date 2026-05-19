import { describe, expect, test } from "vitest";
import {
  _try,
  BlueErrors,
  InvalidMarketParamsError,
  UnknownDataError,
  UnknownFactory,
  UnknownMarketParamsError,
  UnknownOfFactory,
  UnknownTokenError,
  UnknownTokenPriceError,
  UnknownVaultConfigError,
  UnsupportedChainIdError,
  UnsupportedPreLiquidationParamsError,
  UnsupportedVaultV2AdapterError,
  VaultV2Errors,
} from "./errors.js";
import type { Address, MarketId } from "./types.js";

const ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const MARKET_ID = "0x123456" as MarketId;

describe("error classes", () => {
  test("InvalidMarketParamsError preserves data and is an Error", () => {
    const err = new InvalidMarketParamsError("0xabcd");
    expect(err).toBeInstanceOf(Error);
    expect(err.data).toBe("0xabcd");
    expect(err.message).toContain("0xabcd");
  });

  test("UnknownTokenError extends UnknownDataError", () => {
    const err = new UnknownTokenError(ADDRESS);
    expect(err).toBeInstanceOf(UnknownDataError);
    expect(err.address).toBe(ADDRESS);
    expect(err.message).toContain(ADDRESS);
  });

  test("UnknownTokenPriceError extends UnknownDataError", () => {
    const err = new UnknownTokenPriceError(ADDRESS);
    expect(err).toBeInstanceOf(UnknownDataError);
    expect(err.address).toBe(ADDRESS);
  });

  test("UnknownMarketParamsError extends UnknownDataError", () => {
    const err = new UnknownMarketParamsError(MARKET_ID);
    expect(err).toBeInstanceOf(UnknownDataError);
    expect(err.marketId).toBe(MARKET_ID);
  });

  test("UnknownVaultConfigError extends UnknownDataError", () => {
    const err = new UnknownVaultConfigError(ADDRESS);
    expect(err).toBeInstanceOf(UnknownDataError);
    expect(err.vault).toBe(ADDRESS);
  });

  test("UnsupportedChainIdError preserves chainId", () => {
    const err = new UnsupportedChainIdError(999);
    expect(err.chainId).toBe(999);
    expect(err.message).toContain("999");
  });

  test("UnsupportedPreLiquidationParamsError formats lltv", () => {
    const err = new UnsupportedPreLiquidationParamsError(
      9_000_000_000_000_000_000n, // 90 * 1e16 = 90% in 16-decimal scale (per formatUnits)
    );
    expect(err.lltv).toBe(9_000_000_000_000_000_000n);
    expect(err.message).toContain("%");
  });

  test("UnsupportedVaultV2AdapterError preserves address", () => {
    const err = new UnsupportedVaultV2AdapterError(ADDRESS);
    expect(err.address).toBe(ADDRESS);
  });

  test("UnknownFactory has no fields", () => {
    const err = new UnknownFactory();
    expect(err.message).toContain("unknown factory");
  });

  test("UnknownOfFactory preserves factory and address", () => {
    const factory: Address = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
    const err = new UnknownOfFactory(factory, ADDRESS);
    expect(err.factory).toBe(factory);
    expect(err.address).toBe(ADDRESS);
    expect(err.message).toContain(ADDRESS);
    expect(err.message).toContain(factory);
  });
});

describe("BlueErrors namespace", () => {
  test("AlreadySet preserves name and value", () => {
    const err = new BlueErrors.AlreadySet("price", "100");
    expect(err.name).toBe("price");
    expect(err.value).toBe("100");
  });

  test("InvalidInterestAccrual preserves all fields", () => {
    const err = new BlueErrors.InvalidInterestAccrual(MARKET_ID, 100n, 200n);
    expect(err.marketId).toBe(MARKET_ID);
    expect(err.timestamp).toBe(100n);
    expect(err.lastUpdate).toBe(200n);
  });

  test("InconsistentInput preserves assets and shares", () => {
    const err = new BlueErrors.InconsistentInput(10n, 100n);
    expect(err.assets).toBe(10n);
    expect(err.shares).toBe(100n);
  });

  test("InsufficientLiquidity preserves marketId", () => {
    const err = new BlueErrors.InsufficientLiquidity(MARKET_ID);
    expect(err.marketId).toBe(MARKET_ID);
  });

  test("UnknownOraclePrice preserves marketId", () => {
    const err = new BlueErrors.UnknownOraclePrice(MARKET_ID);
    expect(err.marketId).toBe(MARKET_ID);
  });

  test("InsufficientPosition preserves user and marketId", () => {
    const err = new BlueErrors.InsufficientPosition(ADDRESS, MARKET_ID);
    expect(err.user).toBe(ADDRESS);
    expect(err.marketId).toBe(MARKET_ID);
  });

  test("InsufficientCollateral preserves user and marketId", () => {
    const err = new BlueErrors.InsufficientCollateral(ADDRESS, MARKET_ID);
    expect(err.user).toBe(ADDRESS);
    expect(err.marketId).toBe(MARKET_ID);
  });

  test("ExpiredSignature preserves deadline", () => {
    const err = new BlueErrors.ExpiredSignature(123n);
    expect(err.deadline).toBe(123n);
  });
});

describe("VaultV2Errors namespace", () => {
  test("InvalidInterestAccrual preserves vault, timestamp, lastUpdate", () => {
    const err = new VaultV2Errors.InvalidInterestAccrual(ADDRESS, 100n, 200n);
    expect(err.vault).toBe(ADDRESS);
    expect(err.timestamp).toBe(100n);
    expect(err.lastUpdate).toBe(200n);
  });

  test("UnsupportedLiquidityAdapter preserves address", () => {
    const err = new VaultV2Errors.UnsupportedLiquidityAdapter(ADDRESS);
    expect(err.address).toBe(ADDRESS);
  });
});

describe("_try", () => {
  test("returns the value when sync accessor succeeds", () => {
    expect(_try(() => 42)).toBe(42);
  });

  test("returns undefined when sync accessor throws and no error class given", () => {
    expect(
      _try(() => {
        throw new Error("oops");
      }),
    ).toBe(undefined);
  });

  test("returns undefined for matching error class", () => {
    expect(
      _try(() => {
        throw new UnknownTokenError(ADDRESS);
      }, UnknownTokenError),
    ).toBe(undefined);
  });

  test("re-throws when error class does not match", () => {
    expect(() =>
      _try(() => {
        throw new TypeError("not me");
      }, UnknownTokenError),
    ).toThrow(TypeError);
  });

  test("matches subclasses (instanceof check)", () => {
    expect(
      _try(() => {
        throw new UnknownTokenError(ADDRESS);
      }, UnknownDataError),
    ).toBe(undefined);
  });

  test("returns the resolved value for async accessor success", async () => {
    expect(await _try(async () => "ok")).toBe("ok");
  });

  test("returns undefined for async rejection on matching error class", async () => {
    expect(
      await _try(async () => {
        throw new UnknownTokenError(ADDRESS);
      }, UnknownTokenError),
    ).toBe(undefined);
  });

  test("re-throws on async rejection when no class matches", async () => {
    await expect(
      _try(async () => {
        throw new TypeError("nope");
      }, UnknownTokenError),
    ).rejects.toThrow(TypeError);
  });
});
