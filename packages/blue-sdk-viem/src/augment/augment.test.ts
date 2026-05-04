import {
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
  fetchHolding,
  fetchMarket,
  fetchMarketParams,
  fetchPosition,
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
  test("every augmented blue-sdk class is wired to its fetch function", () => {
    expect(Market.fetch).toBe(fetchMarket);
    expect(MarketParams.fetch).toBe(fetchMarketParams);
    expect(Token.fetch).toBe(fetchToken);
    expect(Position.fetch).toBe(fetchPosition);
    expect(Holding.fetch).toBe(fetchHolding);
    expect(User.fetch).toBe(fetchUser);
    expect(Vault.fetch).toBe(fetchVault);
    expect(VaultConfig.fetch).toBe(fetchVaultConfig);
    expect(VaultMarketAllocation.fetch).toBe(fetchVaultMarketAllocation);
    expect(VaultMarketConfig.fetch).toBe(fetchVaultMarketConfig);
    expect(VaultMarketPublicAllocatorConfig.fetch).toBe(
      fetchVaultMarketPublicAllocatorConfig,
    );
    expect(VaultUser.fetch).toBe(fetchVaultUser);
  });
});
