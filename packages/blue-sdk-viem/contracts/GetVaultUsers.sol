// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {IERC20} from "./interfaces/IERC20.sol";
import {IMetaMorpho} from "./interfaces/IMetaMorpho.sol";
import {VaultUserRequest, VaultUserResponse} from "./GetVaultUser.sol";

contract GetVaultUsers {
    function query(VaultUserRequest[] calldata reqs) external view returns (VaultUserResponse[] memory res) {
        uint256 nbReqs = reqs.length;

        res = new VaultUserResponse[](nbReqs);

        for (uint256 i = 0; i < nbReqs; i++) {
            VaultUserRequest memory req = reqs[i];
            VaultUserResponse memory resI = res[i];

            resI.isAllocator = req.vault.isAllocator(req.user);
            resI.allowance = IERC20(req.vault.asset()).allowance(req.user, address(req.vault));
        }
    }
}
