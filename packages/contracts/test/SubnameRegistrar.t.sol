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
    address internal attacker = address(0xDEAD);

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

    function testActiveSubnameCannotBeHijacked() external {
        vm.deal(creator, 1 ether);
        vm.deal(attacker, 1 ether);

        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.prank(attacker);
        vm.expectRevert(SubnameRegistrar.SubnameActive.selector);
        registrar.registerSubname{value: 0.001 ether}("alice");
    }

    function testExpiredSubnameCanBeReclaimed() external {
        vm.deal(creator, 1 ether);
        vm.deal(attacker, 1 ether);

        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.warp(block.timestamp + 366 days);

        vm.prank(attacker);
        registrar.registerSubname{value: 0.001 ether}("alice");

        bytes32 key = keccak256(bytes("alice"));
        (address owner,,,) = registrar.subnames(key);
        assertEq(owner, attacker);
        assertEq(registrar.ownerSubnames(attacker, 0), key);
        vm.expectRevert();
        registrar.ownerSubnames(creator, 0);
    }

    function testRegisterSubnameRevertsForEmptyLabel() external {
        vm.deal(creator, 1 ether);

        vm.prank(creator);
        vm.expectRevert(SubnameRegistrar.InvalidLabel.selector);
        registrar.registerSubname{value: 0.001 ether}("");
    }

    function testRegisterSubnameRevertsForInvalidCharacters() external {
        vm.deal(creator, 1 ether);

        vm.prank(creator);
        vm.expectRevert(SubnameRegistrar.InvalidLabel.selector);
        registrar.registerSubname{value: 0.001 ether}("Alice");
    }

    function testRenewSubnameRevertsWhenMintedCountIsPositive() external {
        vm.deal(creator, 1 ether);

        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("alice");

        vm.prank(admin);
        registrar.setAuthorizedMinter(minter, true);

        vm.prank(minter);
        registrar.recordMint("alice");

        vm.prank(creator);
        vm.expectRevert(SubnameRegistrar.RenewalNotRequired.selector);
        registrar.renewSubname{value: 0.001 ether}("alice");
    }
}
