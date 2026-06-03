---
"@morpho-org/morpho-sdk": major
---

Remove the deprecated `MorphoClient` class. The only supported entry point is now the viem extension `morphoViemExtension()`, which adds a stateless `morpho` namespace to a viem client.

Migrate by extending your viem client instead of wrapping it:

```ts
// Before
import { MorphoClient } from "@morpho-org/morpho-sdk";
const morpho = new MorphoClient(client, { supportSignature: true });
const vault = morpho.vaultV1(vaultAddress, 1);

// After
import { morphoViemExtension } from "@morpho-org/morpho-sdk";
const extended = client.extend(morphoViemExtension({ supportSignature: true }));
const vault = extended.morpho.vaultV1(vaultAddress, 1);
```

The entity factories (`vaultV1`, `vaultV2`, `marketV1`), their signatures, and the `MorphoClientType` structural type are unchanged — they now live under `client.morpho`.
