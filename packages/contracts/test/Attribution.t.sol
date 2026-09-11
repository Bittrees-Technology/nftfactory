// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";
import {SharedMint721} from "../src/token/SharedMint721.sol";
import {SharedMint1155} from "../src/token/SharedMint1155.sol";
contract AttributionTest is Test {
 function testAnotherWalletCannotIncrementCreatorHandleMints() external {
  address artist=address(0xA11CE);address attacker=address(0xBAD);
  SubnameRegistrar registrar=new SubnameRegistrar(address(this),address(0xBEEF));
  SharedMint721 single=new SharedMint721(address(this),address(registrar),"Art","ART");
  SharedMint1155 edition=new SharedMint1155(address(this),address(registrar),"Editions","ED");
  registrar.setAuthorizedMinter(address(single),true);registrar.setAuthorizedMinter(address(edition),true);
  vm.deal(artist,1 ether);vm.prank(artist);registrar.registerSubname{value:.001 ether}("artist");
  vm.prank(attacker);single.publish("artist","ipfs://a");
  vm.prank(attacker);edition.publish("artist",2,"ipfs://b");
  (,,uint256 count,)=registrar.subnames(keccak256("artist"));assertEq(count,0);
  vm.prank(artist);single.publish("artist","ipfs://c");
  (,,count,)=registrar.subnames(keccak256("artist"));assertEq(count,1);
 }
}
