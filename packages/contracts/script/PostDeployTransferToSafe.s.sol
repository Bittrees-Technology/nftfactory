// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Owned} from "../src/utils/Owned.sol";

contract PostDeployTransferToSafeScript is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address safe = vm.envAddress("TREASURY_SAFE");

        address[] memory ownables = vm.envAddress("OWNABLE_ADDRESSES", ",");

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < ownables.length; i++) {
            Owned(ownables[i]).transferOwnership(safe);
            console2.log("Ownership transferred", ownables[i]);
        }
        vm.stopBroadcast();
    }
}
