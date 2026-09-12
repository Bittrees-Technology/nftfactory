// @vitest-environment jsdom
import React from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import ExistingEnsNameField from './ExistingEnsNameField';
afterEach(cleanup);
it('offers only owned names, with no manual registration entry', () => {
  const onChange = vi.fn();
  render(<ExistingEnsNameField value="" onChange={onChange} options={['artist.eth']} connected/>);
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByText('Enter another name…')).toBeNull();
  fireEvent.change(screen.getByRole('combobox'), {target: {value: 'artist.eth'}});
  expect(onChange).toHaveBeenCalledWith('artist.eth');
});
it('distinguishes loading, failure, empty and disconnected states', () => {
  const props = {value: '', onChange: vi.fn(), options: [] as string[], connected: true};
  const view = render(<ExistingEnsNameField {...props} loading/>);
  expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Looking up');
  view.rerender(<ExistingEnsNameField {...props} error="Unable to load"/>);
  expect(screen.getByRole('button').textContent).toBe('Retry loading names');
  expect(screen.getByRole('status').textContent).toBe('Unable to load');
  view.rerender(<ExistingEnsNameField {...props}/>);
  expect(screen.getByRole('status').textContent).toContain('No .eth names');
  view.rerender(<ExistingEnsNameField {...props} connected={false}/>);
  expect(screen.getByRole('status').textContent).toContain('Connect your wallet');
});
