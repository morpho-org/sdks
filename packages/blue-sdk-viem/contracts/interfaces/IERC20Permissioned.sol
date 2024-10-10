// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.5.0;

import {IERC20Permit} from "./IERC20Permit.sol";

interface IERC20Permissioned is IERC20Permit {
    function hasPermission(address account) external view returns (bool);
}
