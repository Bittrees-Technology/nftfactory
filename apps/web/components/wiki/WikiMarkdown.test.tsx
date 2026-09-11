// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import WikiMarkdown from './WikiMarkdown';
afterEach(cleanup);
it('renders a markdown table with navigable application links',()=>{render(<WikiMarkdown content={'| Action | Page |\n|---|---|\n| Browse | [Explore](/discover) |'}/>);expect(screen.getByRole('table')).toBeTruthy();expect(screen.getByRole('link',{name:'Explore'}).getAttribute('href')).toBe('/discover');});
it('keeps document links within the public wiki',()=>{render(<WikiMarkdown content={'[Storage](Storage.md)'}/>);expect(screen.getByRole('link').getAttribute('href')).toBe('/wiki/storage');});
