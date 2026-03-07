// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {IERC721Lite} from "../interfaces/IERC721Lite.sol";
import {IERC1155Lite} from "../interfaces/IERC1155Lite.sol";
import {NftFactoryRegistry} from "./NftFactoryRegistry.sol";

contract MarketplaceV2 is Owned {
    uint256 public constant MAX_LISTING_DURATION_DAYS = 365;
    uint256 public constant MAX_OFFER_DURATION_DAYS = 365;

    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 amount;
        string standard; // ERC721 | ERC1155
        address paymentToken; // address(0) = ETH
        uint256 price;
        uint256 expiresAt;
        bool active;
    }

    struct Offer {
        address buyer;
        address nft;
        uint256 tokenId;
        uint256 quantity;
        string standard; // ERC721 | ERC1155
        address paymentToken; // address(0) = ETH
        uint256 price; // total escrowed price
        uint256 expiresAt;
        bool active;
    }

    uint256 public nextListingId;
    uint256 public nextOfferId;
    NftFactoryRegistry public registry;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;
    mapping(address => bool) public blockedCollection;

    // Listing ids are stored as id + 1 so zero means "no active listing".
    mapping(bytes32 => uint256) private _activeListingIds;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nft,
        uint256 tokenId,
        uint256 amount,
        string standard,
        address paymentToken,
        uint256 price,
        uint256 expiresAt
    );
    event Sale(uint256 indexed listingId, address indexed buyer, uint256 price, address paymentToken);
    event Cancelled(uint256 indexed listingId);
    event OfferCreated(
        uint256 indexed offerId,
        address indexed buyer,
        address indexed nft,
        uint256 tokenId,
        uint256 quantity,
        string standard,
        address paymentToken,
        uint256 price,
        uint256 expiresAt
    );
    event OfferCancelled(uint256 indexed offerId);
    event OfferAccepted(
        uint256 indexed offerId,
        address indexed seller,
        address indexed buyer,
        address nft,
        uint256 tokenId,
        uint256 quantity,
        address paymentToken,
        uint256 price
    );
    event BlockedCollectionUpdated(address indexed collection, bool blocked);

    error NotSeller();
    error NotBuyer();
    error NotActive();
    error PaymentMismatch();
    error Sanctioned();
    error UnsupportedStandard();
    error InvalidAmount();
    error InvalidPrice();
    error InvalidDuration();
    error Expired();
    error NotApproved();
    error ExistingActiveListing();
    error SelfOffer();
    error Reentrancy();

    uint256 private _entered;

    constructor(address initialOwner, address registryAddress) Owned(initialOwner) {
        registry = NftFactoryRegistry(registryAddress);
    }

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    function setBlockedCollection(address collection, bool isBlocked) external onlyOwner {
        blockedCollection[collection] = isBlocked;
        emit BlockedCollectionUpdated(collection, isBlocked);
    }

    function createListing(
        address nft,
        uint256 tokenId,
        uint256 amount,
        string calldata standard,
        address paymentToken,
        uint256 price,
        uint256 durationDays
    ) external {
        if (registry.blocked(msg.sender) || registry.blocked(nft) || blockedCollection[nft]) revert Sanctioned();
        if (price == 0) revert InvalidPrice();

        bytes32 standardKey = _standardKey(standard);
        string memory normalizedStandard = _normalizedStandard(standardKey);
        uint256 expiresAt = _expiresAt(durationDays, MAX_LISTING_DURATION_DAYS);

        _assertTransferable(msg.sender, nft, tokenId, amount, standardKey);

        bytes32 listingKey = _listingKey(msg.sender, nft, tokenId);
        _clearExpiredListing(listingKey);
        if (_activeListingIds[listingKey] != 0) revert ExistingActiveListing();

        uint256 listingId = nextListingId;
        listings[listingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            amount: amount,
            standard: normalizedStandard,
            paymentToken: paymentToken,
            price: price,
            expiresAt: expiresAt,
            active: true
        });
        _activeListingIds[listingKey] = listingId + 1;

        emit Listed(listingId, msg.sender, nft, tokenId, amount, normalizedStandard, paymentToken, price, expiresAt);
        nextListingId = listingId + 1;
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (listing.seller != msg.sender) revert NotSeller();
        if (!listing.active) revert NotActive();
        _deactivateListing(listingId);
        emit Cancelled(listingId);
    }

    function buy(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert NotActive();
        if (block.timestamp > listing.expiresAt) revert Expired();
        if (
            registry.blocked(msg.sender) || registry.blocked(listing.seller) || registry.blocked(listing.nft)
                || blockedCollection[listing.nft]
        ) revert Sanctioned();

        bytes32 standardKey = _standardKey(listing.standard);
        _assertApproved(listing.seller, listing.nft, standardKey);

        _deactivateListing(listingId);
        _disburseSaleProceeds(listing.paymentToken, msg.sender, listing.seller, listing.price);
        _transferAsset(listing.seller, msg.sender, listing.nft, listing.tokenId, listing.amount, standardKey);

        emit Sale(listingId, msg.sender, listing.price, listing.paymentToken);
    }

    function createOffer(
        address nft,
        uint256 tokenId,
        uint256 quantity,
        string calldata standard,
        address paymentToken,
        uint256 price,
        uint256 durationDays
    ) external payable nonReentrant {
        if (registry.blocked(msg.sender) || registry.blocked(nft) || blockedCollection[nft]) revert Sanctioned();
        if (price == 0) revert InvalidPrice();

        bytes32 standardKey = _standardKey(standard);
        string memory normalizedStandard = _normalizedStandard(standardKey);
        uint256 expiresAt = _expiresAt(durationDays, MAX_OFFER_DURATION_DAYS);

        if (standardKey == keccak256("ERC721")) {
            if (quantity != 1) revert InvalidAmount();
            if (IERC721Lite(nft).ownerOf(tokenId) == msg.sender) revert SelfOffer();
        } else if (quantity == 0) {
            revert InvalidAmount();
        }

        _escrowOfferFunds(paymentToken, price);

        uint256 offerId = nextOfferId;
        offers[offerId] = Offer({
            buyer: msg.sender,
            nft: nft,
            tokenId: tokenId,
            quantity: quantity,
            standard: normalizedStandard,
            paymentToken: paymentToken,
            price: price,
            expiresAt: expiresAt,
            active: true
        });

        emit OfferCreated(offerId, msg.sender, nft, tokenId, quantity, normalizedStandard, paymentToken, price, expiresAt);
        nextOfferId = offerId + 1;
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (offer.buyer != msg.sender) revert NotBuyer();
        if (!offer.active) revert NotActive();

        offer.active = false;
        _refundOfferEscrow(offer.paymentToken, offer.buyer, offer.price);

        emit OfferCancelled(offerId);
    }

    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        if (!offer.active) revert NotActive();
        if (block.timestamp > offer.expiresAt) revert Expired();
        if (msg.sender == offer.buyer) revert SelfOffer();
        if (
            registry.blocked(msg.sender) || registry.blocked(offer.buyer) || registry.blocked(offer.nft)
                || blockedCollection[offer.nft]
        ) revert Sanctioned();

        bytes32 standardKey = _standardKey(offer.standard);
        _assertTransferable(msg.sender, offer.nft, offer.tokenId, offer.quantity, standardKey);

        offer.active = false;

        bytes32 listingKey = _listingKey(msg.sender, offer.nft, offer.tokenId);
        uint256 activeListingId = _activeListingIds[listingKey];
        if (activeListingId != 0) {
            uint256 listingId = activeListingId - 1;
            if (listings[listingId].active) {
                _deactivateListing(listingId);
                emit Cancelled(listingId);
            } else {
                _activeListingIds[listingKey] = 0;
            }
        }

        _settleEscrowedOffer(offer.paymentToken, msg.sender, offer.price);
        _transferAsset(msg.sender, offer.buyer, offer.nft, offer.tokenId, offer.quantity, standardKey);

        emit OfferAccepted(
            offerId, msg.sender, offer.buyer, offer.nft, offer.tokenId, offer.quantity, offer.paymentToken, offer.price
        );
    }

    function _escrowOfferFunds(address paymentToken, uint256 price) internal {
        if (paymentToken == address(0)) {
            if (msg.value != price) revert PaymentMismatch();
            return;
        }
        if (msg.value != 0) revert PaymentMismatch();
        _safeTransferFromERC20(paymentToken, msg.sender, address(this), price);
    }

    function _refundOfferEscrow(address paymentToken, address buyer, uint256 price) internal {
        if (price == 0) return;
        if (paymentToken == address(0)) {
            (bool ok,) = buyer.call{value: price}("");
            require(ok, "ETH_REFUND_FAILED");
            return;
        }
        _safeTransferERC20(paymentToken, buyer, price);
    }

    function _settleEscrowedOffer(address paymentToken, address seller, uint256 price) internal {
        uint256 protocolFee = _protocolFee(price);
        uint256 sellerProceeds = price - protocolFee;
        address feeTreasury = registry.treasury();

        if (paymentToken == address(0)) {
            if (protocolFee > 0) {
                (bool feeOk,) = feeTreasury.call{value: protocolFee}("");
                require(feeOk, "FEE_TRANSFER_FAILED");
            }
            (bool sellerOk,) = seller.call{value: sellerProceeds}("");
            require(sellerOk, "ETH_TRANSFER_FAILED");
            return;
        }

        if (protocolFee > 0) {
            _safeTransferERC20(paymentToken, feeTreasury, protocolFee);
        }
        _safeTransferERC20(paymentToken, seller, sellerProceeds);
    }

    function _disburseSaleProceeds(address paymentToken, address buyer, address seller, uint256 price) internal {
        uint256 protocolFee = _protocolFee(price);
        uint256 sellerProceeds = price - protocolFee;
        address feeTreasury = registry.treasury();

        if (paymentToken == address(0)) {
            if (msg.value != price) revert PaymentMismatch();
            if (protocolFee > 0) {
                (bool feeOk,) = feeTreasury.call{value: protocolFee}("");
                require(feeOk, "FEE_TRANSFER_FAILED");
            }
            (bool sellerOk,) = seller.call{value: sellerProceeds}("");
            require(sellerOk, "ETH_TRANSFER_FAILED");
            return;
        }

        if (msg.value != 0) revert PaymentMismatch();
        if (protocolFee > 0) {
            _safeTransferFromERC20(paymentToken, buyer, feeTreasury, protocolFee);
        }
        _safeTransferFromERC20(paymentToken, buyer, seller, sellerProceeds);
    }

    function _transferAsset(
        address from,
        address to,
        address nft,
        uint256 tokenId,
        uint256 amount,
        bytes32 standardKey
    ) internal {
        if (standardKey == keccak256("ERC721")) {
            IERC721Lite(nft).safeTransferFrom(from, to, tokenId);
            return;
        }
        IERC1155Lite(nft).safeTransferFrom(from, to, tokenId, amount, "");
    }

    function _assertTransferable(address seller, address nft, uint256 tokenId, uint256 amount, bytes32 standardKey) internal view {
        if (standardKey == keccak256("ERC721")) {
            if (amount != 1) revert InvalidAmount();
            if (IERC721Lite(nft).ownerOf(tokenId) != seller) revert NotSeller();
        } else {
            if (amount == 0) revert InvalidAmount();
            if (IERC1155Lite(nft).balanceOf(seller, tokenId) < amount) revert NotSeller();
        }
        _assertApproved(seller, nft, standardKey);
    }

    function _assertApproved(address seller, address nft, bytes32 standardKey) internal view {
        if (standardKey == keccak256("ERC721")) {
            if (!IERC721Lite(nft).isApprovedForAll(seller, address(this))) revert NotApproved();
            return;
        }
        if (!IERC1155Lite(nft).isApprovedForAll(seller, address(this))) revert NotApproved();
    }

    function _deactivateListing(uint256 listingId) internal {
        Listing storage listing = listings[listingId];
        listing.active = false;
        bytes32 listingKey = _listingKey(listing.seller, listing.nft, listing.tokenId);
        if (_activeListingIds[listingKey] == listingId + 1) {
            _activeListingIds[listingKey] = 0;
        }
    }

    function _clearExpiredListing(bytes32 listingKey) internal {
        uint256 listingIdPlusOne = _activeListingIds[listingKey];
        if (listingIdPlusOne == 0) return;

        Listing storage listing = listings[listingIdPlusOne - 1];
        if (!listing.active || block.timestamp > listing.expiresAt) {
            listing.active = false;
            _activeListingIds[listingKey] = 0;
        }
    }

    function _listingKey(address seller, address nft, uint256 tokenId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seller, nft, tokenId));
    }

    function _standardKey(string memory standard) internal pure returns (bytes32 key) {
        key = keccak256(bytes(standard));
        if (key != keccak256("ERC721") && key != keccak256("ERC1155")) revert UnsupportedStandard();
    }

    function _normalizedStandard(bytes32 standardKey) internal pure returns (string memory) {
        return standardKey == keccak256("ERC721") ? "ERC721" : "ERC1155";
    }

    function _expiresAt(uint256 durationDays, uint256 maxDurationDays) internal view returns (uint256) {
        if (durationDays == 0 || durationDays > maxDurationDays) revert InvalidDuration();
        return block.timestamp + (durationDays * 1 days);
    }

    function _protocolFee(uint256 price) internal view returns (uint256) {
        uint256 feeBps = registry.protocolFeeBps();
        if (feeBps == 0) return 0;
        return (price * feeBps) / 10_000;
    }

    function _safeTransferERC20(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "ERC20_TRANSFER_FAILED");
    }

    function _safeTransferFromERC20(address token, address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "ERC20_TRANSFER_FROM_FAILED");
    }
}
