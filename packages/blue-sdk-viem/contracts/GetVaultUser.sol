// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20} from "./interfaces/IERC20.sol";
import {IMetaMorpho} from "./interfaces/IMetaMorpho.sol";

struct VaultUserRequest {
    IMetaMorpho vault;
    address user;
}

struct VaultUserResponse {
    bool isAllocator;
    uint256 allowance;
}

contract GetVaultUser {
    function query(VaultUserRequest calldata req) external view returns (VaultUserResponse memory res) {
        res.isAllocator = req.vault.isAllocator(req.user);
        res.allowance = IERC20(req.vault.asset()).allowance(req.user, address(req.vault));
    }
}
