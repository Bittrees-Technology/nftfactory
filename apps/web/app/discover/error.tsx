"use client";

export default function DiscoverError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Discover Error</h2>
      <p className="error">{error.message || "Failed to load the discover page."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
