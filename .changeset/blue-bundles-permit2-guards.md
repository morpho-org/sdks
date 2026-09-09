---
"@morpho-org/morpho-sdk": minor
---

Harden the direct BlueBundlesV1 Permit2 SignatureTransfer path and add a nonce helper.

- `encodeErc20Permit2TransferFrom` now rejects a chain with no registered canonical Permit2 — its
  EIP-712 domain builds `verifyingContract` from `getChainAddresses(chainId).permit2`, so on a chain
  that registers BlueBundlesV1 but no Permit2 the wallet would otherwise sign a domain-less
  separator Permit2 can never accept — and rejects an already-expired `deadline`. Both guards match
  what the sibling `encodeErc20Permit` and the `getBlueBundlesV1TokenRequirements` resolver already
  enforce, so a direct caller that bypasses the resolver is protected too.
- Add `getUnusedPermit2Nonce(client, { owner, chainId, startNonce? })`, which scans the Permit2
  nonce bitmap and returns the lowest unused unordered nonce, so integrators no longer reimplement
  the scan before requesting a SignatureTransfer signature. Adds the `NoUnusedPermit2NonceError`
  typed error.
- Route the repeated uint256 bound checks in the Blue write builders through a shared
  `validateUint256Field` helper and give the BlueBundlesV1 token-permit `kind` discriminator named
  members; no behavior change from those internal cleanups.
