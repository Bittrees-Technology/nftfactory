"use client";

export default function ProfileError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h2>Profile Error</h2>
      <p className="error">{error.message || "Failed to load the profile page."}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
