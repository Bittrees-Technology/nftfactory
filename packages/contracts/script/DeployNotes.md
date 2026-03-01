# Deploy Notes

Deploy order:
1. NftFactoryRegistry
2. RoyaltySplitRegistry
3. SubnameRegistrar
4. ModeratorRegistry
5. SharedMint721
6. SharedMint1155
7. CreatorCollection721 implementation
8. CreatorCollection1155 implementation
9. CreatorFactory
10. Marketplace

Post deploy:
- authorize CreatorFactory in registry
- set treasury and protocol fee
- transfer contract ownerships to Safe
- seed ModeratorRegistry with the initial moderator set
- set `MODERATOR_REGISTRY_ADDRESS` in `services/indexer/.env`
- restart the indexer so `/api/admin/moderators` reflects the on-chain allowlist
