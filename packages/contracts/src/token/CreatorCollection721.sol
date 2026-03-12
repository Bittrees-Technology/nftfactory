// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC721URIStorageUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import {ERC2981Upgradeable} from "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";

contract CreatorCollection721 is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable, ERC721URIStorageUpgradeable, ERC2981Upgradeable {
    string public ensSubname;
    uint256 public totalSupply;
    bool public upgradesFinalized;

    mapping(uint256 => bool) public metadataLocked;

    event TokenPublished(address indexed creator, uint256 indexed tokenId, string uri);
    event TokenRoyaltySet(uint256 indexed tokenId, address indexed receiver, uint96 feeNumerator);
    event MetadataLockUpdated(uint256 indexed tokenId, bool locked);
    event ContractUpgradesFinalized(address indexed owner);

    error MetadataLocked();
    error UpgradesFinalized();

    function initialize(
        address creator,
        string calldata tokenName,
        string calldata tokenSymbol,
        string calldata subname,
        address defaultRoyaltyReceiver,
        uint96 defaultRoyaltyBps
    ) external initializer {
        __Ownable_init(creator);
        __Ownable2Step_init();
        __UUPSUpgradeable_init();
        __ERC721_init(tokenName, tokenSymbol);
        __ERC721URIStorage_init();
        __ERC2981_init();

        ensSubname = subname;

        if (defaultRoyaltyReceiver != address(0) && defaultRoyaltyBps > 0) {
            _setDefaultRoyalty(defaultRoyaltyReceiver, defaultRoyaltyBps);
        }
    }

    function publish(address to, string calldata uri, bool lockMetadata) external onlyOwner returns (uint256 tokenId) {
        tokenId = ++totalSupply;
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
        metadataLocked[tokenId] = lockMetadata;
        emit TokenPublished(to, tokenId, uri);
    }

    function updateTokenURI(uint256 tokenId, string calldata newUri) external onlyOwner {
        if (metadataLocked[tokenId]) revert MetadataLocked();
        _setTokenURI(tokenId, newUri);
    }

    function setMetadataLock(uint256 tokenId, bool locked) external onlyOwner {
        if (metadataLocked[tokenId]) revert MetadataLocked();
        metadataLocked[tokenId] = locked;
        emit MetadataLockUpdated(tokenId, locked);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function setTokenRoyalty(uint256 tokenId, address receiver, uint96 feeNumerator) external onlyOwner {
        _setTokenRoyalty(tokenId, receiver, feeNumerator);
        emit TokenRoyaltySet(tokenId, receiver, feeNumerator);
    }

    function finalizeUpgrades() external onlyOwner {
        upgradesFinalized = true;
        emit ContractUpgradesFinalized(msg.sender);
    }

    function _authorizeUpgrade(address) internal view override onlyOwner {
        if (upgradesFinalized) revert UpgradesFinalized();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorageUpgradeable, ERC2981Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
