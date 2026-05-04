import {
  AccrualPosition,
  AccrualVault,
  Holding,
  Market,
  MarketParams,
  Position,
  Token,
  User,
  Vault,
  VaultConfig,
  VaultMarketAllocation,
  VaultMarketConfig,
  VaultMarketPublicAllocatorConfig,
  VaultUser,
} from "@morpho-org/blue-sdk";
import { describe, expect, test } from "vitest";
import {
  fetchAccrualPosition,
  fetchAccrualVault,
  fetchHolding,
  fetchMarket,
  fetchMarketParams,
  fetchPosition,
  fetchPreLiquidationPosition,
  fetchToken,
  fetchUser,
  fetchVault,
  fetchVaultConfig,
  fetchVaultMarketAllocation,
  fetchVaultMarketConfig,
  fetchVaultMarketPublicAllocatorConfig,
  fetchVaultUser,
} from "../fetch/index.js";

// Importing this barrel triggers the static augmentation of every blue-sdk class.
import "./index.js";

describe("blue-sdk augmentations", () => {
  // Identity assertions (`.toBe(...)`) so a regression that wired the static
  // method to a different function (or a no-op stub) is caught — a
  // `typeof X.fetch === "function"` check would not.
  //
  // Each row runs as its own test so a single broken wiring does not mask
  // failures on the rest. Object form keeps the `test.each` callback at one
  // param (per biome `useMaxParams` rule).
  interface Wiring {
    label: string;
    get: () => unknown;
    expected: unknown;
  }
  const wirings: ReadonlyArray<Wiring> = [
    { label: "Market.fetch", get: () => Market.fetch, expected: fetchMarket },
    {
      label: "MarketParams.fetch",
      get: () => MarketParams.fetch,
      expected: fetchMarketParams,
    },
    { label: "Token.fetch", get: () => Token.fetch, expected: fetchToken },
    {
      label: "Position.fetch",
      get: () => Position.fetch,
      expected: fetchPosition,
    },
    {
      label: "Holding.fetch",
      get: () => Holding.fetch,
      expected: fetchHolding,
    },
    { label: "User.fetch", get: () => User.fetch, expected: fetchUser },
    { label: "Vault.fetch", get: () => Vault.fetch, expected: fetchVault },
    {
      label: "VaultConfig.fetch",
      get: () => VaultConfig.fetch,
      expected: fetchVaultConfig,
    },
    {
      label: "VaultMarketAllocation.fetch",
      get: () => VaultMarketAllocation.fetch,
      expected: fetchVaultMarketAllocation,
    },
    {
      label: "VaultMarketConfig.fetch",
      get: () => VaultMarketConfig.fetch,
      expected: fetchVaultMarketConfig,
    },
    {
      label: "VaultMarketPublicAllocatorConfig.fetch",
      get: () => VaultMarketPublicAllocatorConfig.fetch,
      expected: fetchVaultMarketPublicAllocatorConfig,
    },
    {
      label: "VaultUser.fetch",
      get: () => VaultUser.fetch,
      expected: fetchVaultUser,
    },
    {
      label: "AccrualPosition.fetch",
      get: () => AccrualPosition.fetch,
      expected: fetchAccrualPosition,
    },
    {
      label: "AccrualPosition.fetchPreLiquidation",
      get: () => AccrualPosition.fetchPreLiquidation,
      expected: fetchPreLiquidationPosition,
    },
    {
      label: "AccrualVault.fetch",
      get: () => AccrualVault.fetch,
      expected: fetchAccrualVault,
    },
  ];

  test.each(wirings)("$label is wired to its fetch function", ({
    get,
    expected,
  }) => {
    expect(get()).toBe(expected);
  });
});
