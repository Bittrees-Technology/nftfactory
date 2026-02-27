"use client";

export default function MintError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Mint Error</h2>
      <p className="error">{error.message || "Failed to load the mint page."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
