import { type Address, ethAddress, zeroAddress } from "viem";
import { groupAssetChanges } from "./asset-changes.js";

const USER: Address = "0x1111111111111111111111111111111111111111";
const VAULT: Address = "0x2222222222222222222222222222222222222222";
const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

describe("groupAssetChanges", () => {
  test("default", () => {
    // One USDC transfer: sender debited, receiver credited.
    const result = groupAssetChanges([
      { account: USER, token: USDC, diff: -100n },
      { account: VAULT, token: USDC, diff: 100n },
    ]);

    // Sorted by account: USER (0x111…) before VAULT (0x222…).
    expect(result).toEqual([
      { account: USER, changes: [{ token: USDC, diff: -100n }] },
      { account: VAULT, changes: [{ token: USDC, diff: 100n }] },
    ]);
  });

  test("behavior: nets contributions for the same account and token", () => {
    const result = groupAssetChanges([
      { account: USER, token: USDC, diff: 100n },
      { account: USER, token: USDC, diff: -30n },
    ]);

    expect(result).toEqual([
      { account: USER, changes: [{ token: USDC, diff: 70n }] },
    ]);
  });

  test("behavior: drops tokens and accounts that net to zero", () => {
    const result = groupAssetChanges([
      { account: USER, token: USDC, diff: 5n },
      { account: USER, token: USDC, diff: -5n },
    ]);

    expect(result).toEqual([]);
  });

  test("behavior: keeps the zero address for mints and burns", () => {
    const result = groupAssetChanges([
      { account: zeroAddress, token: USDC, diff: -5n },
      { account: USER, token: USDC, diff: 5n },
    ]);

    // Zero address sorts first (0x000…).
    expect(result).toEqual([
      { account: zeroAddress, changes: [{ token: USDC, diff: -5n }] },
      { account: USER, changes: [{ token: USDC, diff: 5n }] },
    ]);
  });

  test("behavior: sorts an account's changes by token address", () => {
    const result = groupAssetChanges([
      { account: USER, token: ethAddress, diff: -1n },
      { account: USER, token: USDC, diff: -2n },
    ]);

    // USDC (0xa0b8…) sorts before the eth sentinel (0xeeee…).
    expect(result).toEqual([
      {
        account: USER,
        changes: [
          { token: USDC, diff: -2n },
          { token: ethAddress, diff: -1n },
        ],
      },
    ]);
  });

  test("behavior: carries the first-seen symbol and decimals", () => {
    const result = groupAssetChanges([
      { account: USER, token: USDC, diff: 1n, symbol: "USDC", decimals: 6 },
      { account: USER, token: USDC, diff: 1n },
    ]);

    expect(result).toEqual([
      {
        account: USER,
        changes: [{ token: USDC, symbol: "USDC", decimals: 6, diff: 2n }],
      },
    ]);
  });

  test("behavior: merges one account regardless of input casing", () => {
    // USDC's checksummed address reused here purely as a mixed-case account.
    const result = groupAssetChanges([
      { account: USDC, token: ethAddress, diff: 1n },
      { account: USDC.toLowerCase() as Address, token: ethAddress, diff: 2n },
    ]);

    // Both casings key to the same checksummed account; 1 + 2 = 3.
    expect(result).toEqual([
      { account: USDC, changes: [{ token: ethAddress, diff: 3n }] },
    ]);
  });

  test("behavior: returns empty for no entries", () => {
    expect(groupAssetChanges([])).toEqual([]);
  });
});
