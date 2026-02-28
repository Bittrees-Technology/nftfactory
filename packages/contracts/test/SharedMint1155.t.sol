// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SharedMint1155} from "../src/token/SharedMint1155.sol";
import {IERC1155Receiver} from "../src/token/SharedMint1155.sol";
import {SubnameRegistrar} from "../src/core/SubnameRegistrar.sol";

/// @dev A minimal ERC-1155 receiver that accepts all tokens.
contract ERC1155ReceiverOk {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }
}

/// @dev A contract that explicitly rejects ERC-1155 single transfers.
contract ERC1155ReceiverReject {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return bytes4(0xdeadbeef);
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return bytes4(0xdeadbeef);
    }
}

/// @dev A contract with no ERC-1155 receiver hook.
contract ERC1155ReceiverNone {}

contract SharedMint1155Test is Test {
    SharedMint1155 internal nft;
    SubnameRegistrar internal registrar;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal creator = address(0xCAFE);
    address internal other = address(0xBAAD);

    function setUp() external {
        vm.startPrank(admin);
        registrar = new SubnameRegistrar(admin, treasury);
        nft = new SharedMint1155(admin, address(registrar), "SharedMulti", "SM");
        registrar.setAuthorizedMinter(address(nft), true);
        vm.stopPrank();

        vm.deal(creator, 1 ether);
    }

    // ── ERC-165 ───────────────────────────────────────────────────────────────

    function testSupportsInterfaceERC165() external view {
        assertTrue(nft.supportsInterface(0x01ffc9a7));
    }

    function testSupportsInterfaceERC1155() external view {
        assertTrue(nft.supportsInterface(0xd9b67a26));
    }

    function testSupportsInterfaceERC1155MetadataURI() external view {
        assertTrue(nft.supportsInterface(0x0e89341c));
    }

    function testSupportsInterfaceReturnsFalseForUnknown() external view {
        assertFalse(nft.supportsInterface(0xdeadbeef));
    }

    // ── Publish / Mint ────────────────────────────────────────────────────────

    function testPublishMints() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        assertEq(tokenId, 1);
        // EIP-1155: balanceOf(address account, uint256 id)
        assertEq(nft.balanceOf(creator, tokenId), 10);
        assertEq(nft.uri(tokenId), "ipfs://test");
    }

    function testPublishIncrementsNextTokenId() external {
        assertEq(nft.nextTokenId(), 0);

        vm.prank(creator);
        nft.publish("", 5, "ipfs://1");
        assertEq(nft.nextTokenId(), 1);

        vm.prank(creator);
        nft.publish("", 3, "ipfs://2");
        assertEq(nft.nextTokenId(), 2);
    }

    function testPublishEmitsTransferSingleFromZero() external {
        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit SharedMint1155.TransferSingle(creator, address(0), creator, 1, 10);
        nft.publish("", 10, "ipfs://test");
    }

    function testPublishEmitsURIEvent() external {
        vm.prank(creator);
        vm.expectEmit(true, false, false, true);
        emit SharedMint1155.URI("ipfs://test", 1);
        nft.publish("", 10, "ipfs://test");
    }

    // ── safeTransferFrom ──────────────────────────────────────────────────────

    function testTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        nft.safeTransferFrom(creator, other, tokenId, 4, "");

        assertEq(nft.balanceOf(creator, tokenId), 6);
        assertEq(nft.balanceOf(other, tokenId), 4);
    }

    function testTransferRevertsIfNotSender() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(other);
        vm.expectRevert(SharedMint1155.Unauthorized.selector);
        nft.safeTransferFrom(creator, other, tokenId, 1, "");
    }

    function testApprovedOperatorCanTransfer() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        nft.setApprovalForAll(other, true);

        vm.prank(other);
        nft.safeTransferFrom(creator, other, tokenId, 4, "");

        assertEq(nft.balanceOf(creator, tokenId), 6);
        assertEq(nft.balanceOf(other, tokenId), 4);
    }

    function testTransferToZeroAddressReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(0), tokenId, 1, "");
    }

    function testTransferInsufficientBalanceReverts() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 5, "ipfs://test");

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InsufficientBalance.selector);
        nft.safeTransferFrom(creator, other, tokenId, 6, "");
    }

    function testSafeTransferFromToReceiverContract() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        ERC1155ReceiverOk receiver = new ERC1155ReceiverOk();
        vm.prank(creator);
        nft.safeTransferFrom(creator, address(receiver), tokenId, 3, "");

        assertEq(nft.balanceOf(address(receiver), tokenId), 3);
    }

    function testSafeTransferFromRevertsIfContractRejectsToken() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        ERC1155ReceiverReject rejecter = new ERC1155ReceiverReject();
        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(rejecter), tokenId, 1, "");
    }

    function testSafeTransferFromRevertsIfContractHasNoHook() external {
        vm.prank(creator);
        uint256 tokenId = nft.publish("", 10, "ipfs://test");

        ERC1155ReceiverNone noHook = new ERC1155ReceiverNone();
        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InvalidRecipient.selector);
        nft.safeTransferFrom(creator, address(noHook), tokenId, 1, "");
    }

    // ── safeBatchTransferFrom ─────────────────────────────────────────────────

    function testBatchTransfer() external {
        vm.startPrank(creator);
        uint256 id1 = nft.publish("", 10, "ipfs://1");
        uint256 id2 = nft.publish("", 20, "ipfs://2");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 3;
        amounts[1] = 7;

        vm.prank(creator);
        nft.safeBatchTransferFrom(creator, other, ids, amounts, "");

        assertEq(nft.balanceOf(creator, id1), 7);
        assertEq(nft.balanceOf(creator, id2), 13);
        assertEq(nft.balanceOf(other, id1), 3);
        assertEq(nft.balanceOf(other, id2), 7);
    }

    function testBatchTransferEmitsTransferBatch() external {
        vm.startPrank(creator);
        uint256 id1 = nft.publish("", 10, "ipfs://1");
        uint256 id2 = nft.publish("", 20, "ipfs://2");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 3;
        amounts[1] = 7;

        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit SharedMint1155.TransferBatch(creator, creator, other, ids, amounts);
        nft.safeBatchTransferFrom(creator, other, ids, amounts, "");
    }

    function testBatchTransferRevertsIfLengthMismatch() external {
        vm.prank(creator);
        nft.publish("", 10, "ipfs://1");

        uint256[] memory ids = new uint256[](2);
        ids[0] = 1;
        ids[1] = 2;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.ArrayLengthMismatch.selector);
        nft.safeBatchTransferFrom(creator, other, ids, amounts, "");
    }

    function testBatchTransferRevertsIfInsufficientBalance() external {
        vm.prank(creator);
        uint256 id1 = nft.publish("", 5, "ipfs://1");

        uint256[] memory ids = new uint256[](1);
        ids[0] = id1;

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 6;

        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InsufficientBalance.selector);
        nft.safeBatchTransferFrom(creator, other, ids, amounts, "");
    }

    function testBatchTransferToReceiverContract() external {
        vm.startPrank(creator);
        uint256 id1 = nft.publish("", 10, "ipfs://1");
        uint256 id2 = nft.publish("", 20, "ipfs://2");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 3;
        amounts[1] = 7;

        ERC1155ReceiverOk receiver = new ERC1155ReceiverOk();
        vm.prank(creator);
        nft.safeBatchTransferFrom(creator, address(receiver), ids, amounts, "");

        assertEq(nft.balanceOf(address(receiver), id1), 3);
        assertEq(nft.balanceOf(address(receiver), id2), 7);
    }

    function testBatchTransferRevertsIfContractRejects() external {
        vm.prank(creator);
        uint256 id1 = nft.publish("", 10, "ipfs://1");

        uint256[] memory ids = new uint256[](1);
        ids[0] = id1;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1;

        ERC1155ReceiverReject rejecter = new ERC1155ReceiverReject();
        vm.prank(creator);
        vm.expectRevert(SharedMint1155.InvalidRecipient.selector);
        nft.safeBatchTransferFrom(creator, address(rejecter), ids, amounts, "");
    }

    // ── balanceOfBatch ────────────────────────────────────────────────────────

    function testBalanceOfBatch() external {
        vm.startPrank(creator);
        uint256 id1 = nft.publish("", 10, "ipfs://1");
        uint256 id2 = nft.publish("", 20, "ipfs://2");
        vm.stopPrank();

        address[] memory accounts = new address[](2);
        accounts[0] = creator;
        accounts[1] = creator;

        uint256[] memory ids = new uint256[](2);
        ids[0] = id1;
        ids[1] = id2;

        uint256[] memory balances = nft.balanceOfBatch(accounts, ids);
        assertEq(balances[0], 10);
        assertEq(balances[1], 20);
    }

    function testBalanceOfBatchRevertsIfLengthMismatch() external {
        address[] memory accounts = new address[](2);
        accounts[0] = creator;
        accounts[1] = other;

        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;

        vm.expectRevert(SharedMint1155.ArrayLengthMismatch.selector);
        nft.balanceOfBatch(accounts, ids);
    }

    // ── setApprovalForAll ─────────────────────────────────────────────────────

    function testSetApprovalForAll() external {
        vm.prank(creator);
        nft.setApprovalForAll(other, true);
        assertTrue(nft.isApprovedForAll(creator, other));

        vm.prank(creator);
        nft.setApprovalForAll(other, false);
        assertFalse(nft.isApprovedForAll(creator, other));
    }

    // ── ENS subname integration ───────────────────────────────────────────────

    function testPublishWithSubnameRecordsMint() external {
        vm.prank(creator);
        registrar.registerSubname{value: 0.001 ether}("bob");

        vm.prank(creator);
        nft.publish("bob", 5, "ipfs://test");

        bytes32 key = keccak256(bytes("bob"));
        (,, uint256 mintedCount,) = registrar.subnames(key);
        assertEq(mintedCount, 1);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────

    function testNameAndSymbol() external view {
        assertEq(nft.name(), "SharedMulti");
        assertEq(nft.symbol(), "SM");
    }
}
