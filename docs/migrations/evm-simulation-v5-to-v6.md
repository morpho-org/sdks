# EVM simulation v5 → v6

## Declare the chain on every transaction

`SimulationTransaction.chainId` is now required. Add the intended chain ID to each transaction; it must equal `SimulateParams.chainId`:

```ts
import type { SimulateParams } from "@morpho-org/evm-simulation";

const params = {
  chainId: 1,
  transactions: [{
    chainId: 1,
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    data: "0x",
    value: 0n,
  }],
} satisfies SimulateParams;
```

Missing, non-positive, non-integer, unsafe-integer or mismatched transaction chain IDs throw `SimulationValidationError` before any RPC work. Transactions returned in `simulationTxs` retain their chain IDs.

The backend sends `chainId` as a hex quantity on every `eth_simulateV1` call, including generated authorization preparations and state reads. Geth checks this field against its configured chain ID even with `validation: false`. This does not require EIP-1559 fees or signatures and does not add an `eth_chainId` request. Other endpoints must support and enforce the call field to provide the same node-side protection.
