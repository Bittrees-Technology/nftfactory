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
import {MarketplaceFixedPrice} from "../src/core/MarketplaceFixedPrice.sol";

contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address treasury = vm.envAddress("TREASURY_SAFE");

        vm.startBroadcast(pk);

        NftFactoryRegistry registry = new NftFactoryRegistry(deployer, treasury);
        RoyaltySplitRegistry splitRegistry = new RoyaltySplitRegistry(deployer);
        SubnameRegistrar registrar = new SubnameRegistrar(deployer, treasury);

        SharedMint721 shared721 = new SharedMint721(deployer, address(registrar), "NFTFactory Shared 721", "NFS721");
        SharedMint1155 shared1155 = new SharedMint1155(deployer, address(registrar), "NFTFactory Shared 1155", "NFS1155");

        CreatorCollection721 impl721 = new CreatorCollection721();
        CreatorCollection1155 impl1155 = new CreatorCollection1155();

        CreatorFactory factory = new CreatorFactory(deployer, address(registry));
        MarketplaceFixedPrice marketplace = new MarketplaceFixedPrice(deployer, address(registry));

        factory.setImplementations(address(impl721), address(impl1155));
        registry.setFactoryAuthorization(address(factory), true);

        registrar.setAuthorizedMinter(address(shared721), true);
        registrar.setAuthorizedMinter(address(shared1155), true);

        vm.stopBroadcast();

        console2.log("Registry", address(registry));
        console2.log("RoyaltySplitRegistry", address(splitRegistry));
        console2.log("SubnameRegistrar", address(registrar));
        console2.log("SharedMint721", address(shared721));
        console2.log("SharedMint1155", address(shared1155));
        console2.log("CreatorCollection721 impl", address(impl721));
        console2.log("CreatorCollection1155 impl", address(impl1155));
        console2.log("CreatorFactory", address(factory));
        console2.log("MarketplaceFixedPrice", address(marketplace));
    }
}
