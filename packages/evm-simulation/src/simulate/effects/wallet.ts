import { UnsupportedChainIdError } from "@morpho-org/blue-sdk";
import { getChainAddresses } from "@morpho-org/morpho-sdk/addresses";
import { _try } from "@morpho-org/morpho-ts";
import { type Address, ethAddress } from "viem";
import type { VerificationDiff, WalletBalance } from "../../domain/evidence.js";
import type { DecodedBundle } from "../../domain/stages.js";
import {
  AssetChangeMismatchError,
  SlippageLimitExceededError,
  UnsupportedChainError,
} from "../../errors.js";
import type { SimulationLogger, Transfer } from "../../types.js";
import { assertNoBundlesRetention } from "../pipeline/bundles-retention.js";

/**
 * Verify wallet-level effects against the decoded bundle (design §12).
 *
 * Owner debits must exactly match decoded funding amounts (erc20 funding
 * assets, native `tx.value` via the native-balance probe). Receiver credits
 * are checked for non-negativity; any net change on an account outside the
 * known set (owner, receivers, referral recipients, bundles, morpho, vaults)
 * is unexplained. Restricted bundle contracts must retain nothing, enforced
 * through the existing {@link assertNoBundlesRetention} guard.
 *
 * @throws {AssetChangeMismatchError} on an unexplained or mismatched balance
 *   change.
 * @throws {SlippageLimitExceededError} when a receiver credit falls below the
 *   decoded output bound.
 * @internal
 */
export function verifyWallet(params: {
  readonly bundle: DecodedBundle;
  readonly totalDiff: VerificationDiff;
  readonly actionDiff: VerificationDiff;
  readonly transfers: readonly Transfer[];
  readonly logger?: SimulationLogger;
  /**
   * Expected owner debit overrides keyed `account:token` (lowercased) for ops
   * whose funding amount is a cap refunded at execution — repay legs pull
   * `maxRepayAssets` and return the excess, so the net debit is the accrued
   * paid amount, not the encoded cap.
   */
  readonly fundingDebitOverrides?: ReadonlyMap<string, bigint>;
}): {
  readonly assetChanges: readonly WalletBalance[];
  readonly retention: "passed";
} {
  const { bundle, actionDiff, transfers, logger, fundingDebitOverrides } =
    params;
  const owner = bundle.owner;
  const chainId = bundle.request.chainId;

  const addresses = _try(
    () => getChainAddresses(chainId),
    UnsupportedChainIdError,
  );
  if (addresses == null) throw new UnsupportedChainError(chainId);

  // Accounts allowed to carry balance changes.
  const knownAccounts = new Set<string>([owner.toLowerCase()]);
  const knownTokens = new Set<string>();
  if (addresses.bundles) {
    for (const value of Object.values(addresses.bundles)) {
      if (value != null) knownAccounts.add(value.toLowerCase());
    }
  }
  if (addresses.midnightBundles != null)
    knownAccounts.add(addresses.midnightBundles.toLowerCase());
  knownAccounts.add(addresses.blue.toLowerCase());

  const expectedDebits = new Map<string, bigint>();
  const expectedCredits = new Map<string, bigint>();

  // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
  const addDebit = (account: Address, token: Address, assets: bigint) =>
    expectedDebits.set(
      `${account.toLowerCase()}:${token.toLowerCase()}`,
      (expectedDebits.get(`${account.toLowerCase()}:${token.toLowerCase()}`) ??
        0n) + assets,
    );
  // biome-ignore lint/complexity/useMaxParams: lookup helpers read clearest with positional arguments
  const addCredit = (account: Address, token: Address, assets: bigint) =>
    expectedCredits.set(
      `${account.toLowerCase()}:${token.toLowerCase()}`,
      (expectedCredits.get(`${account.toLowerCase()}:${token.toLowerCase()}`) ??
        0n) + assets,
    );

  for (const op of bundle.operations) {
    if ("receiver" in op) knownAccounts.add(op.receiver.toLowerCase());
    if ("referralFee" in op && op.referralFee != null)
      knownAccounts.add(op.referralFee.recipient.toLowerCase());
    if ("vault" in op && typeof op.vault === "string")
      knownAccounts.add(op.vault.toLowerCase());
    if ("sourceVault" in op && typeof op.sourceVault === "string")
      knownAccounts.add(op.sourceVault.toLowerCase());
    if ("targetVault" in op && typeof op.targetVault === "string")
      knownAccounts.add(op.targetVault.toLowerCase());
    if ("asset" in op && typeof op.asset === "string")
      knownTokens.add(op.asset.toLowerCase());

    if ("funding" in op && op.funding != null) {
      if (op.funding.type === "erc20") {
        const override = fundingDebitOverrides?.get(
          `${owner.toLowerCase()}:${op.funding.token.toLowerCase()}`,
        );
        addDebit(owner, op.funding.token, override ?? op.funding.assets);
        knownTokens.add(op.funding.token.toLowerCase());
      } else if (op.funding.type === "native") {
        // Native funding is a tx.value pull — debited from the owner's
        // native balance, surfaced through the native-balance probe.
        const override = fundingDebitOverrides?.get(
          `${owner.toLowerCase()}:${ethAddress}`,
        );
        addDebit(owner, ethAddress, override ?? op.funding.assets);
        knownTokens.add(op.funding.wrappedToken.toLowerCase());
      }
    }
    if (
      op.type === "vaultV1Withdraw" ||
      op.type === "vaultV2Withdraw" ||
      op.type === "vaultV2ForceWithdraw"
    ) {
      const assets =
        "assets" in op && typeof op.assets === "bigint"
          ? op.assets
          : "exitAssets" in op
            ? op.exitAssets
            : 0n;
      addCredit(op.receiver, op.asset, assets);
    }
    // Share-burn ops (redeem, forceRedeem, in-kind redeem) debit the owner's
    // vault-share balance; the exact burn — exit shares plus penalty shares —
    // is asserted by the route verifier, so no debit expectation is set here.
  }

  for (const change of actionDiff.wallet) {
    const key = `${change.account.toLowerCase()}:${change.token.toLowerCase()}`;
    if (!knownAccounts.has(change.account.toLowerCase())) {
      throw new AssetChangeMismatchError(
        `Unexplained balance change on account "${change.account}" token "${change.token}": "${change.assets}". Only the owner, receivers, referral recipients, bundles, morpho and bound vaults may move.`,
        { stage: "verification" },
      );
    }
    const expected = expectedDebits.get(key);
    if (expected != null) {
      if (change.assets !== -expected) {
        throw new AssetChangeMismatchError(
          `Owner debit on "${change.token}" was "${-change.assets}", expected exactly "${expected}"`,
          { stage: "verification" },
        );
      }
      expectedDebits.delete(key);
      continue;
    }
    const credit = expectedCredits.get(key);
    if (credit != null) {
      if (change.assets < credit) {
        throw new SlippageLimitExceededError(
          `Receiver credit on "${change.token}" was "${change.assets}", below the expected "${credit}"`,
          { stage: "verification" },
        );
      }
      expectedCredits.delete(key);
    }
  }
  for (const [key, expected] of expectedDebits) {
    const [account, token] = key.split(":");
    throw new AssetChangeMismatchError(
      `Expected owner debit of "${expected}" on token "${token}" for account "${account}" was not observed in the action diff`,
      { stage: "verification" },
    );
  }

  const assetChanges = actionDiff.wallet;

  assertNoBundlesRetention({
    chainId,
    transfers: transfers as Transfer[],
    assetChanges: [],
    logger,
  });

  return { assetChanges, retention: "passed" };
}
