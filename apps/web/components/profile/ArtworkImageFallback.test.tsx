// @vitest-environment jsdom
import React from 'react';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ArtworkImage from './ArtworkImage';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllEnvs();});
it('moves a stalled visible preview to its replica without waiting indefinitely',()=>{vi.useFakeTimers();vi.stubEnv('NEXT_PUBLIC_IPFS_GATEWAY','https://primary.test');vi.stubEnv('NEXT_PUBLIC_IPFS_REPLICA_GATEWAY','https://replica.test');render(<ArtworkImage source="ipfs://bafytest" alt="Artwork"/>);expect(screen.getByRole('img').getAttribute('src')).toContain('primary.test');act(()=>vi.advanceTimersByTime(8000));expect(screen.getByRole('img').getAttribute('src')).toContain('replica.test');fireEvent.load(screen.getByRole('img'));act(()=>vi.advanceTimersByTime(16000));expect(screen.getByRole('img').getAttribute('src')).toContain('replica.test');});
