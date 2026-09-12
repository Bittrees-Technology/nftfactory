import {it,expect} from 'vitest';
import {ipfsToGatewayUrl} from './nftMetadata';
import {artworkSources} from '../components/profile/ArtworkImage';
it('normalizes legacy Rarible IPFS URIs for previews',()=>{expect(ipfsToGatewayUrl('ipfs://ipfs/bafytest/image.jpeg','https://example.org/ipfs')).toBe('https://example.org/ipfs/bafytest/image.jpeg');expect(artworkSources('ipfs://ipfs/bafytest/image.jpeg','https://local.example')).toContain('https://bafytest.ipfs.dweb.link/image.jpeg');});
