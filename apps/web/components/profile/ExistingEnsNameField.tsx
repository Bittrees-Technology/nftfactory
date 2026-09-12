'use client';
import {useId} from 'react';

export default function ExistingEnsNameField({value, onChange, options, subname = false, loading = false, error = '', incomplete = false, connected = false, onRefresh}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  subname?: boolean;
  loading?: boolean;
  error?: string;
  incomplete?: boolean;
  connected?: boolean;
  onRefresh?: () => void;
}) {
  const id = useId();
  const names = [...new Set(options)].sort((a, b) => a.localeCompare(b));
  return <div className="existingEnsNameField">
    <label htmlFor={id}>{subname ? 'Your ENS subnames' : 'Your ENS names'}
      <select id={id} value={names.includes(value) ? value : ''} onChange={event => onChange(event.target.value)} disabled={!connected || loading || !names.length} aria-describedby={`${id}-hint`}>
        <option value="" disabled>{loading ? 'Loading your names…' : 'Choose a name you own'}</option>
        {names.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <p id={`${id}-hint`} className="hint" role="status">{!connected ? 'Connect your wallet to find your ENS names.' : loading ? 'Looking up your names on Ethereum mainnet…' : error || (names.length ? 'Names held by this wallet on Ethereum mainnet. We’ll verify the address record before linking.' : `No ${subname ? 'wrapped ENS subnames' : '.eth names'} found for this wallet on Ethereum mainnet.`)}</p>
    {subname && <p className="hint">This list includes wrapped subnames held as ENS tokens.</p>}
    {incomplete && <p className="hint">Some names could not be loaded. Refresh to check again. Unwrapped subnames are not included in this inventory.</p>}
    {connected && <button type="button" className="secondary" disabled={loading} onClick={onRefresh}>{error ? 'Retry loading names' : 'Refresh names'}</button>}
    <p className="hint">Want a new name? Choose “Register a .eth name” under Profile identity action.</p>
  </div>;
}
