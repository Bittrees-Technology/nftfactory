// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Owned} from "../utils/Owned.sol";

contract NftFactoryRegistry is Owned {
    struct CreatorRecord {
        address owner;
        address contractAddress;
        bool isNftFactoryCreated;
        string ensSubname;
        string standard;
    }

    uint256 public protocolFeeBps;
    address public treasury;

    mapping(address => bool) public blocked;
    mapping(address => bool) public authorizedFactory;
    mapping(address => CreatorRecord[]) public creators;
    mapping(address => mapping(address => bool)) public creatorContractRegistered;

    event TreasuryUpdated(address indexed treasury);
    event ProtocolFeeUpdated(uint256 feeBps);
    event BlockedUpdated(address indexed account, bool blockedStatus);
    event FactoryAuthorizationUpdated(address indexed factory, bool authorized);
    event CreatorRegistered(
        address indexed creator,
        address indexed contractAddress,
        string ensSubname,
        string standard,
        bool isNftFactoryCreated
    );

    error FeeTooHigh();
    error NotAuthorizedFactory();
    error CreatorContractAlreadyRegistered();

    constructor(address initialOwner, address initialTreasury) Owned(initialOwner) {
        treasury = initialTreasury;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setProtocolFeeBps(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 10_000) revert FeeTooHigh();
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    function setBlocked(address account, bool status) external onlyOwner {
        blocked[account] = status;
        emit BlockedUpdated(account, status);
    }

    function setFactoryAuthorization(address factory, bool status) external onlyOwner {
        authorizedFactory[factory] = status;
        emit FactoryAuthorizationUpdated(factory, status);
    }

    function registerCreatorContract(
        address creator,
        address contractAddress,
        string calldata ensSubname,
        string calldata standard,
        bool isFactoryCreated
    ) external {
        if (!authorizedFactory[msg.sender] && msg.sender != owner) revert NotAuthorizedFactory();
        if (creatorContractRegistered[creator][contractAddress]) revert CreatorContractAlreadyRegistered();

        creatorContractRegistered[creator][contractAddress] = true;

        creators[creator].push(
            CreatorRecord({
                owner: creator,
                contractAddress: contractAddress,
                isNftFactoryCreated: isFactoryCreated,
                ensSubname: ensSubname,
                standard: standard
            })
        );

        emit CreatorRegistered(creator, contractAddress, ensSubname, standard, isFactoryCreated);
    }

    function creatorContracts(address creator) external view returns (CreatorRecord[] memory) {
        return creators[creator];
    }
}
