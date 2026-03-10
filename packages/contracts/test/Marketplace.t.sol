// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NftFactoryRegistry} from "../src/core/NftFactoryRegistry.sol";
import {Marketplace} from "../src/core/Marketplace.sol";

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

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "INSUFFICIENT_BALANCE");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "INSUFFICIENT_BALANCE");
        require(allowance[from][msg.sender] >= amount, "INSUFFICIENT_ALLOWANCE");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockBadERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address, uint256) external returns (bool) {
        return true;
    }

    function transferFrom(address, address, uint256) external returns (bool) {
        return true;
    }
}

contract ReentrantSeller {
    Marketplace public marketplace;
    Mock721 public nft;
    uint256 public targetTokenId;
    bool public reenterOnReceive;

    constructor(address marketplaceAddress, address nftAddress) {
        marketplace = Marketplace(marketplaceAddress);
        nft = Mock721(nftAddress);
    }

    function prepareListing(uint256 tokenId, uint256 price, uint256 durationDays) external {
        targetTokenId = tokenId;
        nft.mint(address(this), tokenId);
        nft.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft), tokenId, 1, "ERC721", address(0), price, durationDays);
    }

    function armReenter(uint256 tokenId) external {
        targetTokenId = tokenId;
        reenterOnReceive = true;
    }

    receive() external payable {
        if (!reenterOnReceive) return;
        reenterOnReceive = false;
        try marketplace.createListing(address(nft), targetTokenId, 1, "ERC721", address(0), 1 ether, 7) {} catch {}
    }
}

contract MarketplaceTest is Test {
    NftFactoryRegistry internal registry;
    Marketplace internal marketplace;
    Mock721 internal nft721;
    Mock1155 internal nft1155;
    MockERC20 internal erc20;
    MockBadERC20 internal badErc20;
    ReentrantSeller internal reentrantSeller;

    address internal admin = address(0xA11CE);
    address internal treasury = address(0xBEEF);
    address internal seller = address(0xCAFE);
    address internal buyer = address(0xBAAD);

    function setUp() external {
        vm.prank(admin);
        registry = new NftFactoryRegistry(admin, treasury);
        vm.prank(admin);
        marketplace = new Marketplace(admin, address(registry));

        nft721 = new Mock721();
        nft1155 = new Mock1155();
        erc20 = new MockERC20();
        badErc20 = new MockBadERC20();
        reentrantSeller = new ReentrantSeller(address(marketplace), address(nft721));

        vm.deal(buyer, 10 ether);
    }

    function testCreateListingRevertsWithoutApproval721() external {
        vm.prank(seller);
        nft721.mint(seller, 1);

        vm.prank(seller);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
    }

    function testCreateListingRevertsWithoutApproval1155() external {
        vm.prank(seller);
        nft1155.mint(seller, 7, 3);

        vm.prank(seller);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.createListing(address(nft1155), 7, 2, "ERC1155", address(0), 0.1 ether, 7);
    }

    function testCreateListingRevertsWithZeroPrice() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidPrice.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0, 7);
        vm.stopPrank();
    }

    function testCreateListingRevertsWithZeroDuration() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidDuration.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 0);
        vm.stopPrank();
    }

    function testCreateListingRevertsWhenDurationExceedsMaximum() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.InvalidDuration.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 366);
        vm.stopPrank();
    }

    function testBuyRevertsWhenApprovalRevoked() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
        nft721.setApprovalForAll(address(marketplace), false);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(Marketplace.NotApproved.selector);
        marketplace.buy{value: 0.1 ether}(0);

        (,,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testBuyRevertsAfterListingExpiry() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 1);
        vm.stopPrank();

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(buyer);
        vm.expectRevert(Marketplace.Expired.selector);
        marketplace.buy{value: 0.1 ether}(0);
    }

    function testCreateListingNormalizesStandard() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 0.1 ether, 7);
        vm.stopPrank();

        (,,,, string memory standard,,,,) = marketplace.listings(0);
        assertEq(standard, "ERC721");
    }

    function testCreateListingRevertsForInvalidStandard() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.UnsupportedStandard.selector);
        marketplace.createListing(address(nft721), 1, 1, "erc721", address(0), 0.1 ether, 7);
        vm.stopPrank();
    }

    function testCreateListingRevertsWhenPaymentTokenNotAllowed() external {
        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        vm.expectRevert(Marketplace.PaymentTokenNotAllowed.selector);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(erc20), 100, 7);
        vm.stopPrank();
    }

    function testBuySplitsProtocolFeeForEthSales() external {
        vm.prank(admin);
        registry.setProtocolFeeBps(500);

        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(0), 1 ether, 7);
        vm.stopPrank();

        uint256 sellerBalanceBefore = seller.balance;
        uint256 treasuryBalanceBefore = treasury.balance;

        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        assertEq(treasury.balance - treasuryBalanceBefore, 0.05 ether);
        assertEq(seller.balance - sellerBalanceBefore, 0.95 ether);
        assertEq(nft721.ownerOf(1), buyer);
    }

    function testBuyTransfersAllowedErc20() external {
        vm.prank(admin);
        registry.setPaymentTokenAllowed(address(erc20), true);
        vm.prank(admin);
        registry.setProtocolFeeBps(500);

        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(erc20), 200, 7);
        vm.stopPrank();

        erc20.mint(buyer, 200);
        vm.prank(buyer);
        erc20.approve(address(marketplace), 200);

        vm.prank(buyer);
        marketplace.buy(0);

        assertEq(erc20.balanceOf(treasury), 10);
        assertEq(erc20.balanceOf(seller), 190);
        assertEq(erc20.balanceOf(buyer), 0);
        assertEq(nft721.ownerOf(1), buyer);
    }

    function testBuyRevertsWhenAllowedTokenDoesNotTransferBalance() external {
        vm.prank(admin);
        registry.setPaymentTokenAllowed(address(badErc20), true);

        vm.startPrank(seller);
        nft721.mint(seller, 1);
        nft721.setApprovalForAll(address(marketplace), true);
        marketplace.createListing(address(nft721), 1, 1, "ERC721", address(badErc20), 100, 7);
        vm.stopPrank();

        badErc20.mint(buyer, 100);
        vm.prank(buyer);
        badErc20.approve(address(marketplace), 100);

        vm.prank(buyer);
        vm.expectRevert(Marketplace.PaymentTransferMismatch.selector);
        marketplace.buy(0);

        assertEq(nft721.ownerOf(1), seller);
        (,,,,,,,, bool active) = marketplace.listings(0);
        assertTrue(active);
    }

    function testNonReentrantBuyBlocksSellerRelistDuringEthPayout() external {
        reentrantSeller.prepareListing(1, 1 ether, 7);
        reentrantSeller.armReenter(1);

        vm.prank(buyer);
        marketplace.buy{value: 1 ether}(0);

        assertEq(nft721.ownerOf(1), buyer);
        assertEq(marketplace.nextListingId(), 1);
    }
}
