"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Something went wrong</h2>
      <p className="error">{error.message || "An unexpected error occurred."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
