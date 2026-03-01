// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ModeratorRegistry} from "../src/core/ModeratorRegistry.sol";

contract SeedModeratorsScript is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address registryAddress = vm.envAddress("MODERATOR_REGISTRY_ADDRESS");
        string memory csv = vm.envString("MODERATOR_ADDRESSES");
        string memory defaultLabel = vm.envOr("MODERATOR_LABEL", string("Core moderator"));

        ModeratorRegistry registry = ModeratorRegistry(registryAddress);
        address[] memory addresses = _parseAddresses(csv);

        vm.startBroadcast(pk);
        for (uint256 i = 0; i < addresses.length; i++) {
            registry.setModerator(addresses[i], defaultLabel, true);
        }
        vm.stopBroadcast();
    }

    function _parseAddresses(string memory csv) internal pure returns (address[] memory) {
        bytes memory raw = bytes(csv);
        uint256 count = 1;
        for (uint256 i = 0; i < raw.length; i++) {
            if (raw[i] == ",") count++;
        }

        address[] memory values = new address[](count);
        uint256 start = 0;
        uint256 index = 0;

        for (uint256 i = 0; i <= raw.length; i++) {
            if (i == raw.length || raw[i] == ",") {
                bytes memory part = new bytes(i - start);
                for (uint256 j = start; j < i; j++) {
                    part[j - start] = raw[j];
                }
                values[index] = vm.parseAddress(string(part));
                index++;
                start = i + 1;
            }
        }

        return values;
    }
}
