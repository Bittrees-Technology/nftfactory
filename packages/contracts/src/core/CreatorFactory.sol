// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";
import {NftFactoryRegistry} from "./NftFactoryRegistry.sol";
import {CreatorCollection721} from "../token/CreatorCollection721.sol";
import {CreatorCollection1155} from "../token/CreatorCollection1155.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract CreatorFactory is Owned {
    bytes32 private constant _ERC721_KEY = keccak256("ERC721");
    bytes32 private constant _ERC1155_KEY = keccak256("ERC1155");

    struct DeployRequest {
        string standard;
        address creator;
        string tokenName;
        string tokenSymbol;
        string ensSubname;
        address defaultRoyaltyReceiver;
        uint96 defaultRoyaltyBps;
    }

    NftFactoryRegistry public immutable registry;

    address public implementation721;
    address public implementation1155;

    event CreatorCollectionDeployed(
        address indexed creator,
        address indexed collection,
        string standard,
        string ensSubname,
        string name,
        string symbol
    );
    event ImplementationsUpdated(address indexed impl721, address indexed impl1155);

    error UnknownStandard();
    error MissingImplementation();
    error UnauthorizedDeployer();

    constructor(address initialOwner, address registryAddress) Owned(initialOwner) {
        registry = NftFactoryRegistry(registryAddress);
    }

    function setImplementations(address impl721, address impl1155) external onlyOwner {
        implementation721 = impl721;
        implementation1155 = impl1155;
        emit ImplementationsUpdated(impl721, impl1155);
    }

    function deployCollection(DeployRequest calldata req) external returns (address deployedCollection) {
        // Creator can self-deploy; owner (Safe/admin) can also deploy on creator's behalf.
        if (msg.sender != req.creator && msg.sender != owner) revert UnauthorizedDeployer();

        bytes32 key = keccak256(bytes(req.standard));

        if (key == _ERC721_KEY) {
            deployedCollection = _deploy721(req);
        } else if (key == _ERC1155_KEY) {
            deployedCollection = _deploy1155(req);
        } else {
            revert UnknownStandard();
        }

        emit CreatorCollectionDeployed(
            req.creator, deployedCollection, req.standard, req.ensSubname, req.tokenName, req.tokenSymbol
        );
    }

    function _deploy721(DeployRequest calldata req) internal returns (address deployedCollection) {
        if (implementation721 == address(0)) revert MissingImplementation();
        bytes memory data = abi.encodeWithSelector(
            CreatorCollection721.initialize.selector,
            req.creator,
            req.tokenName,
            req.tokenSymbol,
            req.ensSubname,
            req.defaultRoyaltyReceiver,
            req.defaultRoyaltyBps
        );
        deployedCollection = address(new ERC1967Proxy(implementation721, data));
        registry.registerCreatorContract(req.creator, deployedCollection, req.ensSubname, "ERC721", true);
    }

    function _deploy1155(DeployRequest calldata req) internal returns (address deployedCollection) {
        if (implementation1155 == address(0)) revert MissingImplementation();
        bytes memory data = abi.encodeWithSelector(
            CreatorCollection1155.initialize.selector,
            req.creator,
            req.tokenName,
            req.tokenSymbol,
            req.ensSubname,
            req.defaultRoyaltyReceiver,
            req.defaultRoyaltyBps
        );
        deployedCollection = address(new ERC1967Proxy(implementation1155, data));
        registry.registerCreatorContract(req.creator, deployedCollection, req.ensSubname, "ERC1155", true);
    }
}
