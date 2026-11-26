/**
 * PLACEHOLDER — replaced in Phase E-4 by the real storefront homepage.
 * Static on purpose: E-2 must build without a database or environment variables.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-6 px-5 py-16">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal">
        Foundation build
      </p>

      <h1 className="text-4xl leading-tight font-medium sm:text-5xl">
        Roamly — travel connectivity store
      </h1>

      <p className="max-w-prose text-base leading-relaxed text-ink-muted">
        Application shell is in place. Storefront, checkout, order status, and the
        admin CMS arrive in the next phases. See <code>WORK_TRACKER.md</code> for
        current progress.
      </p>

      <dl className="grid gap-3 border-t border-sand pt-6 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Phase</dt>
          <dd className="font-medium">E-2 Foundation</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Implementation</dt>
          <dd className="font-medium">Foundation only</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Business features</dt>
          <dd className="font-medium">Not implemented</dd>
        </div>
      </dl>
    </main>
  );
}
