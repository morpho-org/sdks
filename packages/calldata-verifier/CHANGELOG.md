# @morpho-org/calldata-verifier

## 0.3.0

### Minor Changes

- Verify `midnight.make_lend`, `midnight.make_borrow`, `midnight.make_repay` and `midnight.make_withdraw` calldata. The verifier decompresses the published offer payload, checks that it rebuilds the activated root, and checks every offer against the request. `midnight.make_lend` funded from a variable-rate market is verified too: the Blue market, the parked amount, the callback salt, and each offer's `BlueBuyCallback` address and data.

### Patch Changes

- Updated dependencies
  - @morpho-org/morpho-sdk@10.4.0
  - @morpho-org/midnight-sdk@2.10.0

## 0.2.0

### Minor Changes

- Support native funding (`funding` and `MidnightBundlesV2.midnightBundlesV2CancelAndMake`) on `midnight.supply_collateral` while preserving direct Midnight core `supplyCollateral` verification.

### Patch Changes

- Updated dependencies
  - @morpho-org/morpho-ts@4.5.1
  - @morpho-org/midnight-sdk@2.9.1
  - @morpho-org/morpho-sdk@10.3.1

## 0.1.0

### Minor Changes

- Optionally authenticate Morpho Actions API proofs and bind the signed calls and chain ID to static calldata verification. Proof verification requires a caller-supplied current time in Unix seconds. Existing two-argument verification remains synchronous and does not require a proof.
- Verify Morpho Blue market actions, including compound collateral flows and refinancing. Verify native funding, the liquidation buffer, and the shape of embedded ERC-2612 permits.

  Reject unknown units in Blue action amounts.

  Reject malformed embedded Morpho authorization signatures.

  Reject duplicate idle reallocations regardless of unused source market parameters.

  Require an included Blue approval to cover the encoded token pull. Existing onchain allowance is not checked.

  Reject zero exact position amounts and require the unused amount slot to be zero.

- Verify Midnight market borrow, lend, repay, withdraw and collateral calls, including explicit minimum and maximum amount guards. Reject rate guards that cannot be verified from calldata.

  Reject unsupported units in Midnight collateral and repayment requests.

  Check direct repayment minimum units, reject approvals on collateral-only repays, and enforce explicit amount guards on primary bundle targets and direct core withdrawals.

  Require explicit native-capable funding, and return typed errors for missing amounts and malformed collateral requests.

  A Midnight approval, if included, must cover the encoded token pull.

  Reject Midnight amount guards that do not match the action side, and reject unknown guard types.

  Reject zero exact Midnight amounts, except a zero direct repayment that withdraws collateral.

  Reject zero encoded withdrawals in Midnight `"all"` mode without comparing the amount to a live balance.

  Accept a zero collateral receiver on a repay with no collateral withdrawals.

- Verify Midnight offer takes, cancellations, and funding withdrawals. Reject maker actions and takes of reduce-only offers with a typed unsupported error.
- Add `verifyCalldata` to check Vault V1 and V2 action calldata against user intent before signing, including that approval spenders match the bundle target.

  Require a trusted underlying `asset` address for Vault intents. Check it against deposit approval targets, the chain's wrapped native token for native deposits, and underlying tokens encoded in Vault V2 exit markets.

  Malformed non-object call entries throw `CalldataCallError`.

  Reject non-array call inputs and unknown withdrawal units. Accept SDK-generated empty adapter data on Vault V2 forced redemptions and a same-token zero-reset approval before a positive deposit approval.

  Reject wrong units on fixed-asset routes, malformed call metadata, and unpaired zero approvals.

  Require explicit native-capable funding for nonzero value, validate embedded deposit permit encoding, and report malformed withdrawal amounts and in-kind markets with typed errors.

  Check explicit deposit approvals against the encoded assets. For share-unit and `"all"` withdrawals, check explicit approvals and share permits against the encoded shares.

### Patch Changes

- Updated dependencies
  - @morpho-org/morpho-sdk@10.3.0
