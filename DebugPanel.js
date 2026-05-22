// components/DebugPanel.js
import { useState } from 'react';

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  async function runDiagnostic() {
    setLoading(true);
    setResults(null);
    try {
      const res = await fetch('/api/debug');
      const data = await res.json();
      setResults(data);
    } catch (e) {
      setResults({ error: e.message });
    }
    setLoading(false);
  }

  const s = {
    wrap: {
      background: '#111113',
      border: '1px solid #27272A',
      borderRadius: '12px',
      marginBottom: '1rem',
      overflow: 'hidden',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '.75rem 1.25rem',
      cursor: 'pointer',
      borderBottom: open ? '1px solid #27272A' : 'none',
    },
    title: { fontSize: '13px', color: '#A1A1AA', fontWeight: 500 },
    body: { padding: '1.25rem' },
    btn: {
      padding: '7px 16px',
      background: '#6366F1',
      color: '#fff',
      border: 'none',
      borderRadius: '7px',
      fontSize: '13px',
      cursor: 'pointer',
      fontFamily: 'inherit',
      marginBottom: '1rem',
    },
    section: { marginBottom: '1.25rem' },
    sLabel: {
      fontSize: '11px',
      color: '#71717A',
      textTransform: 'uppercase',
      letterSpacing: '.07em',
      marginBottom: '8px',
      fontWeight: 500,
    },
    row: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      marginBottom: '6px',
      fontSize: '13px',
    },
    key: { color: '#71717A', minWidth: '160px', flexShrink: 0 },
    val: { color: '#FAFAFA', wordBreak: 'break-all' },
    ok: { color: '#22C55E' },
    err: { color: '#EF4444' },
    warn: { color: '#F59E0B' },
    pre: {
      background: '#18181B',
      border: '1px solid #27272A',
      borderRadius: '7px',
      padding: '.85rem',
      fontSize: '11px',
      fontFamily: 'monospace',
      color: '#A1A1AA',
      overflowX: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      maxHeight: '200px',
      overflowY: 'auto',
    },
    pill: {
      display: 'inline-block',
      fontSize: '11px',
      padding: '2px 8px',
      borderRadius: '20px',
      fontWeight: 500,
    },
  };

  function StatusPill({ ok, label }) {
    return (
      <span style={{
        ...s.pill,
        background: ok ? '#052E16' : '#1F0000',
        color: ok ? '#22C55E' : '#EF4444',
      }}>
        {ok ? '✓' : '✗'} {label}
      </span>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header} onClick={() => setOpen(o => !o)}>
        <span style={s.title}>🔬 Diagnostics & Debug</span>
        <span style={{ color: '#71717A', fontSize: '18px' }}>{open ? '›' : '›'}</span>
      </div>

      {open && (
        <div style={s.body}>
          <button style={s.btn} onClick={runDiagnostic} disabled={loading}>
            {loading ? '⏳ Running diagnostics...' : '▶ Run full diagnostic'}
          </button>

          {results && (
            <>
              {/* ENV VARS */}
              <div style={s.section}>
                <div style={s.sLabel}>Environment variables</div>
                <div style={s.row}>
                  <span style={s.key}>Grok API key</span>
                  <span>
                    <StatusPill ok={results.env?.grokKeySet} label={results.env?.grokKeySet ? `Set (${results.env.grokKeyPrefix}, ${results.env.grokKeyLength} chars)` : 'NOT SET in Vercel env vars'} />
                  </span>
                </div>
                <div style={s.row}>
                  <span style={s.key}>Apify token</span>
                  <span>
                    <StatusPill ok={results.env?.apifyKeySet} label={results.env?.apifyKeySet ? `Set (${results.env.apifyKeyPrefix})` : 'NOT SET in Vercel env vars'} />
                  </span>
                </div>
              </div>

              {/* GROK MODELS */}
              <div style={s.section}>
                <div style={s.sLabel}>Grok — available models</div>
                {results.grokModels?.ok ? (
                  <>
                    <div style={{ ...s.row, ...s.ok }}>✓ Connected to xAI API</div>
                    <div style={s.row}>
                      <span style={s.key}>Models available</span>
                      <span style={s.val}>
                        {results.grokModels.body?.data?.map(m => m.id).join(', ') || 'none returned'}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ ...s.row, ...s.err }}>
                      ✗ Failed — HTTP {results.grokModels?.status}
                    </div>
                    <div style={s.pre}>{JSON.stringify(results.grokModels?.body, null, 2)}</div>
                  </>
                )}
              </div>

              {/* GROK TEST CALL */}
              <div style={s.section}>
                <div style={s.sLabel}>Grok — test completion call</div>
                {results.grokTestCall?.ok ? (
                  <div style={{ ...s.row, ...s.ok }}>
                    ✓ Works — using model: <strong style={{ marginLeft: 6 }}>{results.grokTestCall.modelUsed}</strong>
                  </div>
                ) : (
                  <>
                    <div style={{ ...s.row, ...s.err }}>
                      ✗ Failed — HTTP {results.grokTestCall?.status} using model "{results.grokTestCall?.modelUsed}"
                    </div>
                    <div style={s.pre}>{results.grokTestCall?.rawBody || results.grokTestCall?.error}</div>
                    {results.grokTestCall?.availableModels?.length > 0 && (
                      <div style={{ ...s.row, ...s.warn, marginTop: 8 }}>
                        ⚠ Available models on your account: {results.grokTestCall.availableModels.join(', ')}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* APIFY */}
              <div style={s.section}>
                <div style={s.sLabel}>Apify account</div>
                {results.apifyTest?.ok ? (
                  <>
                    <div style={{ ...s.row, ...s.ok }}>✓ Connected</div>
                    <div style={s.row}><span style={s.key}>Username</span><span style={s.val}>{results.apifyTest.username}</span></div>
                    <div style={s.row}><span style={s.key}>Plan</span><span style={s.val}>{results.apifyTest.plan}</span></div>
                  </>
                ) : (
                  <div style={{ ...s.row, ...s.err }}>
                    ✗ Failed — HTTP {results.apifyTest?.status} — {results.apifyTest?.error}
                  </div>
                )}
              </div>

              {/* RAW JSON */}
              <div style={s.section}>
                <div style={s.sLabel}>Full raw response</div>
                <div style={s.pre}>{JSON.stringify(results, null, 2)}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
