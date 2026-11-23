import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
  disabled?: boolean;
}

export default function PasswordInput({ value, onChange, placeholder, autoComplete, disabled }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        autoComplete={autoComplete}
        disabled={disabled}
      />
      <button
        type="button"
        className="eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={show}
        title={show ? 'Ocultar senha' : 'Mostrar senha'}
        disabled={disabled}
      >
        {show ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 3l18 18" />
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.8 17.8 0 0 1-3.4 4.1" />
            <path d="M6.2 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a10.8 10.8 0 0 0 4.3-.9" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
