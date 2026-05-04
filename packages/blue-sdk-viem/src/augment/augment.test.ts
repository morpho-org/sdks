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

// Importing this barrel triggers the static augmentation of every blue-sdk class.
import "./index.js";

describe("blue-sdk augmentations", () => {
  test("Market.fetch is wired", () => {
    expect(typeof Market.fetch).toBe("function");
  });
  test("MarketParams.fetch is wired", () => {
    expect(typeof MarketParams.fetch).toBe("function");
  });
  test("Token.fetch is wired", () => {
    expect(typeof Token.fetch).toBe("function");
  });
  test("Position.fetch is wired", () => {
    expect(typeof Position.fetch).toBe("function");
  });
  test("Holding.fetch is wired", () => {
    expect(typeof Holding.fetch).toBe("function");
  });
  test("User.fetch is wired", () => {
    expect(typeof User.fetch).toBe("function");
  });
  test("Vault.fetch is wired", () => {
    expect(typeof Vault.fetch).toBe("function");
  });
  test("VaultConfig.fetch is wired", () => {
    expect(typeof VaultConfig.fetch).toBe("function");
  });
  test("VaultMarketAllocation.fetch is wired", () => {
    expect(typeof VaultMarketAllocation.fetch).toBe("function");
  });
  test("VaultMarketConfig.fetch is wired", () => {
    expect(typeof VaultMarketConfig.fetch).toBe("function");
  });
  test("VaultMarketPublicAllocatorConfig.fetch is wired", () => {
    expect(typeof VaultMarketPublicAllocatorConfig.fetch).toBe("function");
  });
  test("VaultUser.fetch is wired", () => {
    expect(typeof VaultUser.fetch).toBe("function");
  });
});
