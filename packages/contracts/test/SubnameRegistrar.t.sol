// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

contract SubnameRegistrarTest is Test {
    SubnameRegistrar internal registrar;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal creator = address(0xCAFE);
    address internal minter = address(0x1234);

    function setUp() external {
        vm.prank(admin);
        registrar = new SubnameRegistrar(admin, treasury);
    }

    function testRegisterSubname() external {
        vm.deal(creator, 1 ether);

        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        bytes32 key = keccak256(bytes("alice"));
        (address owner,, uint256 mintedCount, bool exists) = registrar.subnames(key);

        assertEq(owner, creator);
        assertEq(mintedCount, 0);
        assertTrue(exists);
        assertEq(treasury.balance, 0.001 ether);
    }

    function testAuthorizedMinterCanRecordMint() external {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.prank(admin);
        registrar.setAuthorizedMinter(minter, true);

        vm.prank(minter);
        registrar.recordMint("alice");

        bytes32 key = keccak256(bytes("alice"));
        (, , uint256 mintedCount,) = registrar.subnames(key);
        assertEq(mintedCount, 1);
    }

    function testUnauthorizedMinterReverts() external {
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.prank(minter);
        vm.expectRevert(SubnameRegistrar.NotAuthorizedMinter.selector);
        registrar.recordMint("alice");
    }
}
