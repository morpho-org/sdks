// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20} from "./interfaces/IERC20.sol";
import {IMetaMorpho} from "./interfaces/IMetaMorpho.sol";

struct VaultUserResponse {
    bool isAllocator;
    uint256 allowance;
}

contract GetVaultUser {
    function query(IMetaMorpho vault, address user) external view returns (VaultUserResponse memory res) {
        res.isAllocator = vault.isAllocator(user);
        res.allowance = IERC20(vault.asset()).allowance(user, address(vault));
    }
}
