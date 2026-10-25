import React from 'react'
import { Activity, AlertTriangle, Clock3 } from 'lucide-react'
import type { CompactAnalysisSnapshot } from '../../stores/useAiAgentStore'

export const AnalysisSnapshotCard: React.FC<{ snapshot: CompactAnalysisSnapshot }> = ({ snapshot }) => {
  const price = snapshot.evidence.currentPrice ?? snapshot.evidence.price
  const rows = [
    ['Price', price],
    ['RSI (14)', snapshot.evidence.rsi14],
    ['ATR (14)', snapshot.evidence.atr14],
    ['Spread', snapshot.evidence.spread],
    ['News score', snapshot.evidence.newsScore]
  ].filter((row) => row[1] !== undefined && row[1] !== null)

  return (
    <section aria-label="Analysis snapshot" style={{ margin: '6px 0 10px', padding: 9, border: '1px solid var(--border-subtle)', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700 }}><Activity size={12} /> Evidence snapshot · {snapshot.symbol} · {snapshot.timeframe}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--text-secondary)', fontSize: 9 }}><Clock3 size={10} />{new Date(snapshot.capturedAt).toLocaleTimeString()}</span>
      </header>
      {snapshot.bias && <div style={{ fontSize: 10, marginBottom: 5 }}>Bias: <strong>{snapshot.bias}</strong></div>}
      {rows.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {rows.map(([label, value]) => <span key={String(label)} style={{ border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 5px', fontSize: 9, color: 'var(--text-secondary)' }}>{label}: <strong style={{ color: 'var(--text-primary)' }}>{String(value)}</strong></span>)}
      </div> : <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>No numeric market evidence was returned.</div>}
      {snapshot.unavailable.length > 0 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 6, color: 'var(--gold)', fontSize: 9 }}><AlertTriangle size={10} />Unavailable: {snapshot.unavailable.join(', ')}</div>}
    </section>
  )
}
