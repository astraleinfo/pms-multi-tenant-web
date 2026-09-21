import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <p className="tnum font-mono text-caption uppercase tracking-[0.16em] text-accent-text">Error 404</p>
      <h1 className="mt-3 font-display text-display font-semibold text-ink">
        Nothing lives at this address
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-body leading-relaxed text-ink-2">
        The page may have moved, or the record belongs to a tenant this session cannot see.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-10 items-center rounded-[var(--r)] bg-accent px-4 text-body font-medium text-accent-ink shadow-e1 transition-colors hover:bg-accent-hover"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
