// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {MarketplaceFixedPrice} from "../src/core/MarketplaceFixedPrice.sol";

contract Mock721 {
    mapping(uint256 => address) public ownerOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "NOT_OWNER");
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "NOT_APPROVED");
        ownerOf[tokenId] = to;
    }
}

contract Mock1155 {
    mapping(address => mapping(address => bool)) public isApprovedForAll;
    mapping(uint256 => mapping(address => uint256)) internal _balanceOf;

    function mint(address to, uint256 id, uint256 amount) external {
        _balanceOf[id][to] += amount;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function balanceOf(address account, uint256 id) external view returns (uint256) {
        return _balanceOf[id][account];
    }

    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        require(msg.sender == from || isApprovedForAll[from][msg.sender], "NOT_APPROVED");
        require(_balanceOf[id][from] >= amount, "INSUFFICIENT");
        _balanceOf[id][from] -= amount;
        _balanceOf[id][to] += amount;
    }
}

contract ReentrantERC20 {
    MarketplaceFixedPrice public marketplace;
    uint256 public targetListing;
    bool public reenterOnTransferFrom;

    constructor(address marketplaceAddress) {
        marketplace = MarketplaceFixedPrice(marketplaceAddress);
    }

    function setReentry(uint256 listingId, bool enabled) external {
        targetListing = listingId;
        reenterOnTransferFrom = enabled;
    }

    function transferFrom(address, address, uint256) external returns (bool) {
        if (reenterOnTransferFrom) {
            reenterOnTransferFrom = false;
            try marketplace.buy(targetListing) {} catch {}
        }
        return true;
    }
}

contract MarketplaceFixedPriceTest is Test {
    NftFactoryRegistry internal registry;
    MarketplaceFixedPrice internal marketplace;
    Mock721 internal nft721;
    Mock1155 internal nft1155;
    ReentrantERC20 internal reentrantToken;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        vm.prank(admin);
        marketplace = new MarketplaceFixedPrice(admin, address(registry));

        nft721 = new Mock721();
        nft1155 = new Mock1155();
        reentrantToken = new ReentrantERC20(address(marketplace));

        vm.deal(buyer, 10 ether);
    }

    function testCreateListingRevertsWithoutApproval721() external {
        vm.prank(seller);
        nft721.mint(seller, 1);

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether);
    }

    function testCreateListingRevertsWithoutApproval1155() external {
        vm.prank(seller);
        nft1155.mint(seller, 7, 3);

        vm.prank(seller);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.createListing(address(nft1155), 7, 2, "ERC1155", address(0), 0.1 ether);
    }

    function testCreateListingRevertsWithZeroPrice() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(MarketplaceFixedPrice.InvalidPrice.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0);
        vm.stopPrank();
    }

    function testBuyRevertsWhenApprovalRevoked() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether);
        nft721.setApprovalForAll(address(marketplace), false);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(MarketplaceFixedPrice.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testNonReentrantBuyBlocksNestedBuy() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.mint(seller, 2);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(reentrantToken), 1);
        marketplace.createListing(address(nft721), 2, 1, "ERC721", address(reentrantToken), 1);
        vm.stopPrank();

        reentrantToken.setReentry(1, true);

        vm.prank(buyer);
        marketplace.buy(0);

        assertEq(nft721.ownerOf(1), buyer);
        assertEq(nft721.ownerOf(2), seller);
        (,,,,,,, bool firstActive) = marketplace.listings(0);
        (,,,,,,, bool secondActive) = marketplace.listings(1);
        assertFalse(firstActive);
        assertTrue(secondActive);
    }
}
