import { fc } from "@fast-check/vitest";
import { MathLib, Token } from "@morpho-org/blue-sdk";
import { erc2612Abi } from "@morpho-org/blue-sdk-viem";
import { getChainAddress } from "@morpho-org/morpho-ts";
import {
  createMockClient,
  expectReadCall,
  mockRead,
} from "@morpho-org/test/mock";
import {
  type Address,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { mainnet } from "viem/chains";
import { afterAll, beforeAll, expect, vi } from "vitest";
import { getVaultBundlesSharesRequirements } from "../../src/entities/requirements/getVaultBundlesSharesRequirements.js";
import {
  isRequirementApproval,
  isRequirementSignature,
} from "../../src/types/index.js";

/** Arbitraries shared by the calldata builder property tests. */
export const UINT128_MAX = (1n << 128n) - 1n;
export const propertyDeadline = 1_900_000_000n;

// Fixed wall-clock time (Jan 2027), before `propertyDeadline`.
const propertyNow = 1_800_000_000n;

/**
 * Pins `Date` to `propertyNow` for the calling suite, so vault snapshots, accrual windows and
 * deadline checks depend only on the seed, not on the day the tests run.
 */
export const pinPropertyClock = () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Number(propertyNow) * 1_000);
  });
  afterAll(() => {
    vi.useRealTimers();
  });
};

export const addressArbitrary = fc
  .uint8Array({ minLength: 20, maxLength: 20 })
  .map((bytes) => getAddress(toHex(bytes)))
  .filter((value) => value !== zeroAddress);

// Morpho market and vault amounts are uint128 onchain.
export const amountArbitrary = fc.oneof(
  fc.constantFrom(1n, 2n, 10n ** 6n, UINT128_MAX),
  fc.bigInt({ min: 1n, max: UINT128_MAX }),
);

// Bundles reject referral fees >= WAD.
export const referralFeeArbitrary = fc.oneof(
  fc.constantFrom(0n, 1n, MathLib.WAD - 1n),
  fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
);

/** Blue MarketParams with non-zero addresses and LLTV in [0, WAD), edge-biased. */
// morpho-blue Morpho.sol createMarket: require(isLltvEnabled[lltv]); enabled LLTVs are < WAD.
export const marketParamsArbitrary = fc.record({
  loanToken: addressArbitrary,
  collateralToken: addressArbitrary,
  oracle: addressArbitrary,
  irm: addressArbitrary,
  lltv: fc.oneof(
    fc.constantFrom(0n, MathLib.WAD - 1n),
    fc.bigInt({ min: 0n, max: MathLib.WAD - 1n }),
  ),
});

export const emptySharesPermit = {
  value: 0n,
  nonce: 0n,
  deadline: propertyDeadline,
  v: 0,
  r: zeroHash,
  s: zeroHash,
};

/** Live share allowance and nonce read by the share-requirements resolver. */
export const shareAllowanceStateArbitrary = fc.record({
  allowanceEdge: fc.constantFrom(
    "zero",
    "belowCap",
    "cap",
    "ceiling",
    "aboveCeiling",
    "random",
  ),
  randomAllowance: fc.bigInt({ min: 0n, max: UINT128_MAX }),
  nonce: fc.bigInt({ min: 0n, max: UINT128_MAX }),
  supportSignature: fc.boolean(),
});

/**
 * Resolves share requirements through the resolver the vault entities use for asset-mode exits
 * and checks that only VaultBundlesV1 is authorized, for exactly `cap` shares.
 */
export const expectVaultBundlesShareRequirements = async (params: {
  readonly vault: Address;
  readonly version: "vaultV1" | "vaultV2";
  readonly owner: Address;
  readonly cap: bigint;
  readonly ceiling: bigint;
  readonly state: typeof shareAllowanceStateArbitrary extends fc.Arbitrary<
    infer T
  >
    ? T
    : never;
}) => {
  const { vault, version, owner, cap, ceiling, state } = params;
  const spender = getChainAddress(mainnet.id, "bundles.vaultBundlesV1");
  const allowance = {
    zero: 0n,
    belowCap: cap - 1n,
    cap,
    ceiling,
    aboveCeiling: ceiling + 1n,
    random: state.randomAllowance,
  }[state.allowanceEdge];
  const handle = createMockClient(mainnet);
  mockRead(handle, {
    address: vault,
    abi: erc20Abi,
    functionName: "allowance",
    result: allowance,
  });
  mockRead(handle, {
    address: vault,
    abi: erc2612Abi,
    functionName: "nonces",
    result: state.nonce,
  });
  const requirements = await getVaultBundlesSharesRequirements(handle.client, {
    vaultData: new Token({ address: vault, name: "Vault" }),
    version,
    owner,
    chainId: mainnet.id,
    requiredShareAllowance: cap,
    maxShareAllowance: ceiling,
    deadline: propertyDeadline,
    supportSignature: state.supportSignature,
  });
  const allowanceReads = expectReadCall(handle, {
    address: vault,
    abi: erc20Abi,
    functionName: "allowance",
  });
  expect(allowanceReads.length).toBeGreaterThan(0);
  for (const read of allowanceReads)
    expect(read.args).toEqual([owner, spender]);
  const nonceReads = expectReadCall(handle, {
    address: vault,
    abi: erc2612Abi,
    functionName: "nonces",
  });
  for (const read of nonceReads) expect(read.args).toEqual([owner]);
  if (allowance >= cap && allowance <= ceiling) {
    expect(requirements).toEqual([]);
    return;
  }
  expect(requirements).toHaveLength(1);
  const [requirement] = requirements;
  if (allowance < cap && state.supportSignature) {
    if (!isRequirementSignature(requirement)) {
      throw new TypeError("Expected a share permit requirement");
    }
    expect(nonceReads.length).toBeGreaterThan(0);
    expect(requirement.action.typedData.domain).toMatchObject({
      chainId: mainnet.id,
      verifyingContract: vault,
    });
    expect(requirement.action.typedData.message).toMatchObject({
      owner,
      spender,
      value: cap,
      nonce: state.nonce,
      deadline: propertyDeadline,
    });
    return;
  }
  if (!isRequirementApproval(requirement)) {
    throw new TypeError("Expected a share approval requirement");
  }
  expect(requirement.to).toBe(vault);
  expect(decodeFunctionData({ abi: erc20Abi, data: requirement.data })).toEqual(
    { functionName: "approve", args: [spender, cap] },
  );
};
