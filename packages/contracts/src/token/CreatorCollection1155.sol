// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC1155Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import {ERC2981Upgradeable} from "@openzeppelin/contracts-upgradeable/token/common/ERC2981Upgradeable.sol";

contract CreatorCollection1155 is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable, ERC1155Upgradeable, ERC2981Upgradeable {
    string public name;
    string public symbol;
    string public ensSubname;
    bool public upgradesFinalized;

    mapping(uint256 => string) private _tokenUris;
    mapping(uint256 => bool) public tokenExists;
    mapping(uint256 => bool) public metadataLocked;

    event TokenPublished(address indexed creator, uint256 indexed tokenId, uint256 amount, string uri);
    event TokenRoyaltySet(uint256 indexed tokenId, address indexed receiver, uint96 feeNumerator);
    event MetadataLockUpdated(uint256 indexed tokenId, bool locked);
    event ContractUpgradesFinalized(address indexed owner);

    error MetadataLocked();
    error UpgradesFinalized();
    error TokenAlreadyMinted();
    error InvalidAmount();

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
        __ERC1155_init("");
        __ERC2981_init();

        name = tokenName;
        symbol = tokenSymbol;
        ensSubname = subname;

        if (defaultRoyaltyReceiver != address(0) && defaultRoyaltyBps > 0) {
            _setDefaultRoyalty(defaultRoyaltyReceiver, defaultRoyaltyBps);
        }
    }

    function publish(address to, uint256 tokenId, uint256 amount, string calldata newUri, bool lockMetadata) external onlyOwner {
        if (tokenExists[tokenId]) revert TokenAlreadyMinted();
        if (amount == 0) revert InvalidAmount();
        tokenExists[tokenId] = true;
        _tokenUris[tokenId] = newUri;
        metadataLocked[tokenId] = lockMetadata;
        _mint(to, tokenId, amount, "");
        // EIP-1155 §5.4: URI event MUST be emitted whenever a token URI is set or changed.
        emit URI(newUri, tokenId);
        emit TokenPublished(to, tokenId, amount, newUri);
    }

    function updateTokenURI(uint256 tokenId, string calldata newUri) external onlyOwner {
        if (metadataLocked[tokenId]) revert MetadataLocked();
        _tokenUris[tokenId] = newUri;
        emit URI(newUri, tokenId);
    }

    function setMetadataLock(uint256 tokenId, bool locked) external onlyOwner {
        if (metadataLocked[tokenId]) revert MetadataLocked();
        metadataLocked[tokenId] = locked;
        emit MetadataLockUpdated(tokenId, locked);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return _tokenUris[tokenId];
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

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155Upgradeable, ERC2981Upgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
