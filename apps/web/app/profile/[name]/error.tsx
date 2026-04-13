"use client";

function sanitizeProfilePageErrorMessage(message: string | undefined): string {
  const normalized = String(message || "").trim().toLowerCase();
  if (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("cloudflare tunnel error")
  ) {
    return "Profile data is temporarily unavailable. Please try again shortly.";
  }
  return message || "Failed to load the profile page.";
}

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
      <p className="error">{sanitizeProfilePageErrorMessage(error.message)}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </section>
  );
}
