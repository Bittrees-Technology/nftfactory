// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ArtworkImage, { artworkSources } from './ArtworkImage';
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('uses configured primary then replica before the indexer gateway', () => {
  expect(artworkSources('https://dweb.link/ipfs/bafytest', 'https://primary.example/ipfs/', 'https://backup.example')).toEqual(['https://primary.example/ipfs/bafytest','https://backup.example/ipfs/bafytest','https://dweb.link/ipfs/bafytest','https://bafytest.ipfs.dweb.link/']);
});
it('falls back after an origin failure and stops after every source fails', () => {
  vi.stubEnv('NEXT_PUBLIC_IPFS_GATEWAY','https://primary.example');vi.stubEnv('NEXT_PUBLIC_IPFS_REPLICA_GATEWAY','https://backup.example');
  render(<ArtworkImage source="ipfs://bafytest" alt="Test artwork"/>);
  expect(screen.getByAltText('Test artwork').getAttribute('src')).toBe('https://primary.example/ipfs/bafytest');
  fireEvent.error(screen.getByAltText('Test artwork'));
  expect(screen.getByAltText('Test artwork').getAttribute('src')).toBe('https://backup.example/ipfs/bafytest');
  fireEvent.error(screen.getByAltText('Test artwork'));
  expect(screen.getByAltText('Test artwork').getAttribute('src')).toBe('https://bafytest.ipfs.dweb.link/');
  fireEvent.error(screen.getByAltText('Test artwork'));
  expect(screen.getByRole('status').textContent).toContain('temporarily unavailable');
});
