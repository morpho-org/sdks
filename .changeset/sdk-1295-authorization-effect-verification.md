---
"@morpho-org/evm-simulation": major
---

Add optional caller-supplied slippage checks to the v5 simulation pipeline. Each action/subject entry supplies a quote (assets received/paid or shares minted/burned) and a WAD-scaled percentage tolerance. No calldata is decoded and no quotes or tolerances are inferred or defaulted. Results identify the quote and tolerance checked over the whole bundle. Remove separate penalty and refund checks.

Replace the single asset override with separate `assetPaid` and `assetReceived` fields so each leg of a two-asset operation can use its own token.

Keep SDK requirements conversion and preview preparation, without authorization-policy or permission/nonce read-back checks. Preparation and user transaction reverts propagate. Preview success applies to simulated permissions, not future signatures.

Replace the earlier unreleased per-action limits and default-policy constants with SlippageLimits. Remove transaction indices from bundle-wide limit observations. See the v4-to-v5 migration guide for the input and result changes.

Remove the unreleased broad state snapshots/diffs and their public types. Plan only reads required by quotes: ERC-20 balances and Blue position shares, with native amounts taken from transfer traces. Remove vault/market reporting, factory discovery, full entity fetching, and the interest-accrual model. Omitted limits produce no slippage reads. Existing transfer reporting and retention checks remain unchanged.
