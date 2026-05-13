import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  onClose: () => void;
}

export function ShareModal({ url, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      inputRef.current?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-zinc-800 border border-zinc-600 rounded-lg w-full max-w-lg p-5 text-zinc-100">
        <div className="flex items-start justify-between gap-2 mb-3">
          <h2 className="text-lg font-bold">Share your schedule</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-100 text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          This URL is a <strong className="text-zinc-200">snapshot</strong> of the shows you've
          saved right now. It won't update if you change your schedule afterward — re-share to
          publish a fresh copy.
        </p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            readOnly
            value={url}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs font-mono text-zinc-300"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button
            onClick={copy}
            className="px-3 py-2 rounded text-sm bg-accent text-white hover:bg-accent-soft font-semibold"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
