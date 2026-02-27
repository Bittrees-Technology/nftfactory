"use client";

export default function ListError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>List Error</h2>
      <p className="error">{error.message || "Failed to load the list page."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
