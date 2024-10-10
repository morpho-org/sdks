# @morpho-org/liquidation-sdk-ethers

A package containing all useful utilities to help build efficient and competitive liquidation bots on Morpho Blue.

## Getting Started

```bash
npm install @morpho-org/liquidation-sdk-ethers
```

```bash
yarn add @morpho-org/liquidation-sdk-ethers
```

---

## Examples

An example liquidation bot currently used in production is available under [examples/](./examples/).

This bot, provided a list of whitelisted markets to monitor, automatically:

1. Fetches liquidatable positions from the API
2. Finds the largest available liquidity for a swap of the collateral for the debt via 1inch
3. Redeems collateral MetaMorpho shares for the underlying assets when applicable
4. Only submit profitable liquidations (wrt to the gas cost & the swap's slippage)
