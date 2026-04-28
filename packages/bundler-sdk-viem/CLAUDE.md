# bundler-sdk-viem Conventions

- Convert simulation operations into bundler actions before encoding transactions.
- Keep action encoders pure where possible: `BundlerAction.encode(chainId, action)`.
- Throw `BundlerErrors.MissingSignature` when a signature-required action lacks a signature.
- Track native value only for transfers into bundler adapter addresses.
- Prefer infinite approvals used elsewhere, e.g. `MathLib.MAX_UINT_160`, when Permit2 flow requires it.
- Return both planned operations and the encoded bundle from setup helpers.
