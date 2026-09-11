// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {RoyaltySplitRegistry} from "../src/core/RoyaltySplitRegistry.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {SharedMint1155} from "../src/token/SharedMint1155.sol";
import {CreatorCollection721} from "../src/token/CreatorCollection721.sol";
import {CreatorCollection1155} from "../src/token/CreatorCollection1155.sol";
import {CreatorFactory} from "../src/core/CreatorFactory.sol";
import {Marketplace} from "../src/core/Marketplace.sol";
import {ModeratorRegistry} from "../src/core/ModeratorRegistry.sol";

contract DeployScript is Script {
    function _readOptionalPaymentTokenAllowlist() internal returns (address[] memory) {
        try vm.envAddress("PAYMENT_TOKEN_ALLOWLIST", ",") returns (address[] memory tokens) {
            return tokens;
        } catch {
            return new address[](0);
        }
    }

    function run() external {
        require(block.chainid == vm.envUint("EXPECTED_CHAIN_ID"), "Unexpected deployment network");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        require(deployer != address(0), "Deployer is required");
        address adminSafe = vm.envAddress("ADMIN_SAFE");
        require(adminSafe.code.length > 0, "Administrator Safe must exist on this network");
        address treasury = vm.envAddress("TREASURY_SAFE");
        require(treasury != address(0), "Treasury is required");
        address[] memory paymentTokens = _readOptionalPaymentTokenAllowlist();

        vm.startBroadcast(deployer);

        NftFactoryRegistry registry = new NftFactoryRegistry(deployer, treasury);
        RoyaltySplitRegistry splitRegistry = new RoyaltySplitRegistry(deployer);
        SubnameRegistrar registrar = new SubnameRegistrar(deployer, treasury);
        ModeratorRegistry moderatorRegistry = new ModeratorRegistry(deployer);

        SharedMint721 shared721 = new SharedMint721(deployer, address(registrar), "NFTFactory Shared 721", "NFS721");
        SharedMint1155 shared1155 = new SharedMint1155(deployer, address(registrar), "NFTFactory Shared 1155", "NFS1155");

        CreatorCollection721 impl721 = new CreatorCollection721();
        CreatorCollection1155 impl1155 = new CreatorCollection1155();

        CreatorFactory factory = new CreatorFactory(deployer, address(registry));
        Marketplace marketplace = new Marketplace(deployer, address(registry));

        factory.setImplementations(address(impl721), address(impl1155));
        registry.setFactoryAuthorization(address(factory), true);
        for (uint256 i = 0; i < paymentTokens.length; i++) {
            registry.setPaymentTokenAllowed(paymentTokens[i], true);
        }

        registrar.setAuthorizedMinter(address(shared721), true);
        registrar.setAuthorizedMinter(address(shared1155), true);

        // Two-step ownership: the Safe must accept each handoff before release.
        registry.transferOwnership(adminSafe);
        splitRegistry.transferOwnership(adminSafe);
        registrar.transferOwnership(adminSafe);
        moderatorRegistry.transferOwnership(adminSafe);
        shared721.transferOwnership(adminSafe);
        shared1155.transferOwnership(adminSafe);
        factory.transferOwnership(adminSafe);
        marketplace.transferOwnership(adminSafe);

        vm.stopBroadcast();
        console2.log("Pending administrator Safe", adminSafe);
        console2.log("RELEASE HOLD: Safe must accept all eight ownership transfers");

        console2.log("Registry", address(registry));
        console2.log("RoyaltySplitRegistry", address(splitRegistry));
        console2.log("SubnameRegistrar", address(registrar));
        console2.log("ModeratorRegistry", address(moderatorRegistry));
        console2.log("SharedMint721", address(shared721));
        console2.log("SharedMint1155", address(shared1155));
        console2.log("CreatorCollection721 impl", address(impl721));
        console2.log("CreatorCollection1155 impl", address(impl1155));
        console2.log("CreatorFactory", address(factory));
        console2.log("Marketplace", address(marketplace));
        console2.log("Allowed payment tokens", paymentTokens.length);
    }
}
