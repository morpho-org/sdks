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
    address asset;
    uint256 totalAssets;
    uint128 _totalAssets;
    uint256 totalSupply;
    uint256 virtualShares;
    uint64 maxRate;
    uint64 lastUpdate;
    address[] adapters;
    address liquidityAdapter;
    uint96 performanceFee;
    uint96 managementFee;
    address performanceFeeRecipient;
    address managementFeeRecipient;
}

contract GetVaultV2 {
    function query(IVaultV2 vault) external view returns (VaultV2Response memory res) {
        res.token =
            Token({asset: vault.asset(), symbol: vault.symbol(), name: vault.name(), decimals: vault.decimals()});
        res.asset = vault.asset();
        res.totalAssets = vault.totalAssets();
        res._totalAssets = vault._totalAssets();
        res.totalSupply = vault.totalSupply();
        res.virtualShares = vault.virtualShares();
        res.maxRate = vault.maxRate();
        res.lastUpdate = vault.lastUpdate();
        res.liquidityAdapter = vault.liquidityAdapter();
        res.performanceFee = vault.performanceFee();
        res.managementFee = vault.managementFee();
        res.performanceFeeRecipient = vault.performanceFeeRecipient();
        res.managementFeeRecipient = vault.managementFeeRecipient();

        uint256 adaptersLength = vault.adaptersLength();
        res.adapters = new address[](adaptersLength);
        for (uint256 i; i < adaptersLength; ++i) {
            res.adapters[i] = vault.adapters(i);
        }
    }
}
