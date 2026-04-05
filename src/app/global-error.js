"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, backgroundColor: '#fafafa' }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 300 }}>Something went wrong</h1>
          <p style={{ color: '#666', marginBottom: '2rem' }}>A critical error occurred. Please try again.</p>
          <button
            onClick={() => reset()}
            style={{ padding: '0.75rem 2rem', border: '1px solid #333', background: '#333', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
