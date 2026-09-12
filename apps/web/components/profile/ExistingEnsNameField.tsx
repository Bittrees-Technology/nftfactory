'use client';
import {useId, useState} from 'react';

export default function ExistingEnsNameField({value, onChange, options, subname = false}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  subname?: boolean;
}) {
  const id = useId();
  const [manual, setManual] = useState(false);
  const names = [...new Set(options)].sort((a, b) => a.localeCompare(b));
  const showInput = manual || names.length === 0 || Boolean(value && !names.includes(value));
  const title = subname ? 'ENS subname' : 'ENS name';
  return <div className="existingEnsNameField">
    {names.length > 0 && <label htmlFor={`${id}-select`}>{title}
      <select id={`${id}-select`} value={showInput ? '__manual' : value} onChange={event => {
        const next = event.target.value;
        setManual(next === '__manual');
        onChange(next === '__manual' ? '' : next);
      }}>
        <option value="" disabled>Choose a name</option>
        <optgroup label="Suggested names">{names.map(name => <option key={name} value={name}>{name}</option>)}</optgroup>
        <option value="__manual">Enter another name…</option>
      </select>
    </label>}
    {showInput && <label htmlFor={`${id}-input`}>{names.length ? 'Full ENS name' : title}
      <input id={`${id}-input`} value={value} onChange={event => {setManual(true); onChange(event.target.value);}} placeholder={subname ? 'studio.artist.eth' : 'artist.eth'} autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby={`${id}-hint`}/>
    </label>}
    <p id={`${id}-hint`} className="hint">{showInput ? 'Enter the complete name, including .eth.' : 'We’ll verify this name before linking it to your profile.'}</p>
  </div>;
}
