---
"@morpho-org/midnight-sdk": minor
"@morpho-org/morpho-sdk": minor
---

Reuse Merkle tree layers across proofs in `ratify()`; add `TreeUtils.buildProofs`. `TreeUtils.buildProof` and `TreeUtils.buildProofs` now throw `InvalidTreeError` for non-power-of-two leaf sets and `InvalidTreeHeightError` for trees above height 20.
