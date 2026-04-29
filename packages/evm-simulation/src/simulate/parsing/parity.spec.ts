/**
 * Integration fixtures for parseTransfers, modeled after realistic Morpho
 * transaction flows (bundler3 vault deposit, WETH wrap/unwrap,
 * supply-collateral+borrow). When changing `parseTransfers`, these must stay
 * green.
 */
import { type Address, type Hex, getAddress } from "viem";

import type { RawLog } from "../../types.js";

import {
  encodeUint256 as enc256,
  padAddress as padAddr,
} from "../../test-helpers/index.js";
import {
  DEPOSIT_TOPIC,
  TRANSFER_TOPIC,
  WITHDRAWAL_TOPIC,
  parseTransfers,
} from "./transfers.js";

describe("integration: vault V2 deposit", () => {
  const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const bbqUSDC: Address = "0xBeEf01735c132AdA46Aa9AA9cE6ecaEB5Deb0136";
  const USER: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
  const ADAPTER: Address = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";

  // Realistic log sequence for a bundler3 vault deposit:
  // 1. USDC Transfer: user → adapter (erc20TransferFrom)
  // 2. USDC Transfer: adapter → vault (deposit)
  // 3. bbqUSDC Transfer: zero → user (mint shares)
  const depositLogs: RawLog[] = [
    {
      address: USDC,
      topics: [TRANSFER_TOPIC, padAddr(USER), padAddr(ADAPTER)],
      data: enc256(1_000_000n), // 1 USDC
    },
    {
      address: USDC,
      topics: [TRANSFER_TOPIC, padAddr(ADAPTER), padAddr(bbqUSDC)],
      data: enc256(1_000_000n),
    },
    {
      address: bbqUSDC,
      topics: [TRANSFER_TOPIC, `0x${"0".repeat(64)}` as Hex, padAddr(USER)],
      data: enc256(950_000_000_000_000_000n), // shares minted
    },
  ];

  it("emits three transfers with the expected token/from/to/amount triples", () => {
    const transfers = parseTransfers(depositLogs);
    expect(transfers).toHaveLength(3);

    const byRole = {
      userToAdapter: transfers.find(
        (t) =>
          t.token === getAddress(USDC) &&
          t.from === getAddress(USER) &&
          t.to === getAddress(ADAPTER),
      ),
      adapterToVault: transfers.find(
        (t) =>
          t.token === getAddress(USDC) &&
          t.from === getAddress(ADAPTER) &&
          t.to === getAddress(bbqUSDC),
      ),
      sharesToUser: transfers.find(
        (t) => t.token === getAddress(bbqUSDC) && t.to === getAddress(USER),
      ),
    };

    expect(byRole.userToAdapter?.amount).toBe(1_000_000n);
    expect(byRole.adapterToVault?.amount).toBe(1_000_000n);
    expect(byRole.sharesToUser?.amount).toBe(950_000_000_000_000_000n);
  });
});

describe("integration: WETH wrap/unwrap", () => {
  const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USER: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";

  it("WETH deposit deduplicates mint Transfer (net +amount to user)", () => {
    const amount = 1_000_000_000_000_000_000n; // 1 ETH
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [DEPOSIT_TOPIC, padAddr(USER)],
        data: enc256(amount),
      },
      {
        address: WETH,
        topics: [TRANSFER_TOPIC, `0x${"0".repeat(64)}` as Hex, padAddr(USER)],
        data: enc256(amount),
      },
    ];

    const transfers = parseTransfers(logs);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]!.to).toBe(getAddress(USER));
    expect(transfers[0]!.amount).toBe(amount);
  });

  it("WETH withdrawal deduplicates burn Transfer (net -amount from user)", () => {
    const amount = 500_000_000_000_000_000n; // 0.5 ETH
    const logs: RawLog[] = [
      {
        address: WETH,
        topics: [WITHDRAWAL_TOPIC, padAddr(USER)],
        data: enc256(amount),
      },
      {
        address: WETH,
        topics: [TRANSFER_TOPIC, padAddr(USER), `0x${"0".repeat(64)}` as Hex],
        data: enc256(amount),
      },
    ];

    const transfers = parseTransfers(logs);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]!.from).toBe(getAddress(USER));
    expect(transfers[0]!.amount).toBe(amount);
  });
});

describe("integration: multi-token market operation", () => {
  const WETH: Address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const USER: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
  const MORPHO: Address = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";

  it("emits both collateral-in and borrow-out transfers with correct amounts", () => {
    const logs: RawLog[] = [
      // WETH: user → Morpho (supply collateral)
      {
        address: WETH,
        topics: [TRANSFER_TOPIC, padAddr(USER), padAddr(MORPHO)],
        data: enc256(1_000_000_000_000_000_000n), // 1 WETH
      },
      // USDC: Morpho → user (borrow)
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddr(MORPHO), padAddr(USER)],
        data: enc256(2_000_000_000n), // 2000 USDC
      },
    ];

    const transfers = parseTransfers(logs);
    expect(transfers).toHaveLength(2);

    const wethIn = transfers.find((t) => t.token === getAddress(WETH));
    expect(wethIn?.from).toBe(getAddress(USER));
    expect(wethIn?.to).toBe(getAddress(MORPHO));
    expect(wethIn?.amount).toBe(1_000_000_000_000_000_000n);

    const usdcOut = transfers.find((t) => t.token === getAddress(USDC));
    expect(usdcOut?.from).toBe(getAddress(MORPHO));
    expect(usdcOut?.to).toBe(getAddress(USER));
    expect(usdcOut?.amount).toBe(2_000_000_000n);
  });
});

describe("integration: determinism", () => {
  it("parseTransfers output is canonically sorted", () => {
    const USDC: Address = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    const DAI: Address = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
    const USER: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
    const VAULT: Address = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";

    // Provide logs in reverse alphabetical order
    const logs: RawLog[] = [
      {
        address: USDC,
        topics: [TRANSFER_TOPIC, padAddr(USER), padAddr(VAULT)],
        data: enc256(1000n),
      },
      {
        address: DAI,
        topics: [TRANSFER_TOPIC, padAddr(USER), padAddr(VAULT)],
        data: enc256(2000n),
      },
    ];

    const result = parseTransfers(logs);
    expect(result).toHaveLength(2);
    // DAI (0x6B) sorts before USDC (0xA0) in canonical order.
    expect(result[0]!.token.toLowerCase()).toBe(DAI.toLowerCase());
    expect(result[1]!.token.toLowerCase()).toBe(USDC.toLowerCase());
  });

  it("same logs produce same output regardless of input order", () => {
    const A: Address = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa";
    const B: Address = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB";
    const C: Address = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC";

    const log1: RawLog = {
      address: A,
      topics: [TRANSFER_TOPIC, padAddr(B), padAddr(C)],
      data: enc256(100n),
    };
    const log2: RawLog = {
      address: C,
      topics: [TRANSFER_TOPIC, padAddr(A), padAddr(B)],
      data: enc256(200n),
    };

    expect(parseTransfers([log1, log2])).toEqual(parseTransfers([log2, log1]));
  });
});
