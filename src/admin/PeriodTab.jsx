// PeriodTab — 신청 기간 & 월별 선발 인원 설정
import { useState } from 'react'
import { MONTHS_KR, getSeason } from '../constants'
import { Btn, Card, SeasonBadge } from '../components/UI'

export default function PeriodTab({ settings, saveSettings }) {
  const [quotas,  setQuotas]  = useState({ ...settings.quotas })
  const [periods, setPeriods] = useState(JSON.parse(JSON.stringify(settings.applicationPeriods ?? {})))
  const [saved,   setSaved]   = useState(false)

  const updPeriod = (m, k, v) => setPeriods(p => ({ ...p, [m]: { ...p[m], [k]: v } }))

  const save = async () => {
    await saveSettings({ ...settings, quotas, applicationPeriods: periods })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
        월별 신청 기간과 최대 선발 인원을 설정합니다. 신청 기간을 비워두면 상시 신청 가능합니다.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[...Array(12)].map((_, i) => {
          const m = i + 1
          const p = periods[m] ?? { start: '', end: '' }
          return (
            <Card key={m} style={{ padding: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{MONTHS_KR[i]}</span>
                <SeasonBadge season={getSeason(m)} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>신청 시작일</label>
                  <input type="date" value={p.start ?? ''} onChange={e => updPeriod(m, 'start', e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>신청 마감일</label>
                  <input type="date" value={p.end ?? ''} onChange={e => updPeriod(m, 'end', e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>선발 인원</label>
                  <input type="number" min={1} max={500} value={quotas[m] ?? 20}
                    onChange={e => setQuotas({ ...quotas, [m]: Math.max(1, parseInt(e.target.value) || 1) })}
                    style={{ width: '70px' }} />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>명</span>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
      <Btn variant="primary" onClick={save}>{saved ? '저장됨 ✓' : '저장'}</Btn>
    </div>
  )
}
