"use client";

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Admin Error</h2>
      <p className="error">{error.message || "Failed to load the admin page."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
