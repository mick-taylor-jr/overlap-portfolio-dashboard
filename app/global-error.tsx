'use client';

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '4rem 1.5rem', maxWidth: 560, margin: '0 auto', color: '#16181d' }}>
        <title>Overlap: something went wrong</title>
        <h1 style={{ fontSize: 20 }}>Overlap could not load</h1>
        <p style={{ color: '#5d6370' }}>Your portfolio is still saved in this browser. {error instanceof Error ? error.message : ''}</p>
        <button type="button" onClick={() => retry()} style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, border: '1px solid #d9d9d4', background: '#fff' }}>
          Try again
        </button>
      </body>
    </html>
  );
}
