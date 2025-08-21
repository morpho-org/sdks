// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IVaultV2} from "./interfaces/IVaultV2.sol";

struct Token {
    address asset;
    string symbol;
    string name;
    uint256 decimals;
}

struct VaultV2Response {
    Token token;
    uint256 totalSupply;
    uint128 totalAssets;
    address asset;
    uint96 performanceFee;
    uint96 managementFee;
    uint64 maxRate;
    uint256 virtualShares;
    uint64 lastUpdate;
    address liquidityAdapter;
    address[] adapters;
    address performanceFeeRecipient;
    address managementFeeRecipient;
}

contract GetVaultV2 {
    function query(IVaultV2 vault)
        external
        view
        returns (VaultV2Response memory res)
    {
        res.token = Token({
            asset: vault.asset(),
            symbol: vault.symbol(),
            name: vault.name(),
            decimals: vault.decimals()
        });
        res.totalSupply = vault.totalSupply();
        res.totalAssets = vault._totalAssets();
        res.asset = vault.asset();
        res.performanceFee = vault.performanceFee();
        res.managementFee = vault.managementFee();
        res.maxRate = vault.maxRate();
        res.virtualShares = vault.virtualShares();
        res.lastUpdate = vault.lastUpdate();
        res.liquidityAdapter = vault.liquidityAdapter();
        res.performanceFeeRecipient = vault.performanceFeeRecipient();
        res.managementFeeRecipient = vault.managementFeeRecipient();

        uint256 adaptersLength = vault.adaptersLength();
        res.adapters = new address[](adaptersLength);
        for (uint256 i; i < adaptersLength; ++i) {
            res.adapters[i] = vault.adapters(i);
        }
    }
}
