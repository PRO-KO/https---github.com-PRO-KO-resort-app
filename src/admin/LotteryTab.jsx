import { useState } from 'react'
import { won, YEAR, MONTHS_KR, getSeason } from '../constants'
import { Btn, Card, Alert, AppStatusBadge } from '../components/UI'

export default function LotteryTab({ settings, apps, fundUsed, saveApps, saveFundUsed }) {
  const [selMonth, setSelMonth] = useState(new Date().getMonth() + 1)
  const [confirm,  setConfirm]  = useState(false)
  const [msg,      setMsg]      = useState(null)
  const [manualId, setManualId] = useState('')
  const [manualMsg,setManualMsg]= useState(null)

  const quota     = settings.quotas[selMonth] ?? 20
  const monthApps = apps.filter(a => a.month === selMonth && a.year === YEAR)
  const pending   = monthApps.filter(a => a.status === 'pending')
  const manual    = monthApps.filter(a => a.status === 'manual')      // 별도배정 (선점)
  const selected  = monthApps.filter(a => a.status === 'selected')
  const rejected  = monthApps.filter(a => a.status === 'rejected')
  const remaining = Math.max(0, quota - manual.length)                // 추첨으로 뽑을 잔여 인원

  // ── 무작위 추첨 ──────────────────────────────────────────────────────────
  const runLottery = async (resetFirst = false) => {
    let work = apps, curFund = fundUsed
    if (resetFirst) {
      // 재추첨 시 selected만 초기화 (manual은 유지)
      const prev = apps
        .filter(a => a.month === selMonth && a.year === YEAR && a.status === 'selected')
        .reduce((s, a) => s + a.subsidy, 0)
      work    = apps.map(a => a.month === selMonth && a.year === YEAR && a.status === 'selected' ? { ...a, status: 'pending' } : a)
      curFund -= prev
    }
    const pool = work.filter(a => a.month === selMonth && a.year === YEAR && a.status === 'pending')
    if (!pool.length) { setMsg({ type: 'warn', text: '대기 중인 신청자가 없습니다.' }); return }

    // 별도배정 인원만큼 제외한 잔여 쿼터로 추첨
    const currentManual = work.filter(a => a.month === selMonth && a.year === YEAR && a.status === 'manual').length
    const effectiveQuota = Math.max(0, quota - currentManual)

    if (effectiveQuota === 0) { setMsg({ type: 'warn', text: '별도배정 인원이 쿼터를 모두 채웠습니다.' }); return }

    const shuffled  = [...pool].sort(() => Math.random() - 0.5)
    const winners   = shuffled.slice(0, effectiveQuota)
    const losers    = shuffled.slice(effectiveQuota)
    const winSet    = new Set(winners.map(a => a.id))
    const loseSet   = new Set(losers.map(a => a.id))
    const addedFund = winners.reduce((s, a) => s + a.subsidy, 0)

    const finalApps = work.map(a => {
      if (winSet.has(a.id))  return { ...a, status: 'selected' }
      if (loseSet.has(a.id)) return { ...a, status: 'rejected' }
      return a
    })
    await saveApps(finalApps)
    await saveFundUsed(curFund + addedFund)
    setMsg({ type: 'success', text: `추첨 완료! 별도배정 ${currentManual}명 + 추첨당첨 ${winners.length}명, 낙첨 ${losers.length}명.` })
    setConfirm(false)
  }

  // ── 별도 배정 (추첨 전 선점) ─────────────────────────────────────────────
  const manualAssign = async () => {
    const id  = manualId.trim()
    const app = monthApps.find(a => a.empId === id)
    if (!app) { setManualMsg({ type: 'warn', text: '해당 월에 해당 사번의 신청 내역이 없습니다.' }); return }

    const isManual   = app.status === 'manual'
    const newStatus  = isManual ? 'pending' : 'manual'   // 토글
    const fundDelta  = isManual ? -app.subsidy : app.subsidy

    await saveApps(apps.map(a => a.id === app.id ? { ...a, status: newStatus } : a))
    await saveFundUsed(fundUsed + fundDelta)
    setManualMsg({ type: 'success', text: `${id} → ${newStatus === 'manual' ? '별도배정 선점 완료' : '대기로 해제'}.` })
    setManualId('')
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>추첨 대상 월</label>
        <select value={selMonth} onChange={e => { setSelMonth(parseInt(e.target.value)); setMsg(null); setConfirm(false) }}>
          {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{MONTHS_KR[i]} ({getSeason(i + 1)})</option>)}
        </select>
      </div>
      {msg && <Alert type={msg.type}>{msg.text}</Alert>}

      {/* 현황 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
        {[['전체', monthApps.length], ['대기', pending.length], ['별도배정', manual.length], ['추첨당첨', selected.length], ['낙첨', rejected.length], ['잔여쿼터', remaining]].map(([k, v]) => (
          <div key={k} style={{ background: k === '별도배정' ? 'var(--color-background-info)' : 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: k === '별도배정' ? 'var(--color-text-info)' : 'var(--color-text-tertiary)', marginBottom: 4 }}>{k}</p>
            <p style={{ fontSize: 20, fontWeight: 500 }}>{v}</p>
          </div>
        ))}
      </div>

      {/* 별도배정 섹션 (먼저 배치 — 추첨 전 선점) */}
      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>별도 배정 (추첨 전 선점)</h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
          사번을 입력하면 별도배정으로 선점됩니다. 별도배정 인원만큼 추첨 쿼터가 감소합니다.
          현재 잔여 추첨 쿼터: <strong style={{ color: 'var(--color-text-info)' }}>{remaining}명</strong>
        </p>
        {manualMsg && <Alert type={manualMsg.type}>{manualMsg.text}</Alert>}
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={manualId} onChange={e => setManualId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && manualAssign()}
            placeholder="사번 입력 (이미 배정된 사번 재입력 시 해제)" style={{ flex: 1 }} />
          <Btn variant="primary" onClick={manualAssign}>배정</Btn>
        </div>
      </Card>

      {/* 무작위 추첨 섹션 */}
      <Card style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>무작위 난수 추첨</h3>
        <div style={{ display: 'flex', gap: 10, marginBottom: confirm ? 16 : 0, flexWrap: 'wrap' }}>
          {pending.length > 0 && !confirm && selected.length === 0 && (
            <Btn variant="primary" onClick={() => setConfirm(true)}>{selMonth}월 추첨 실행 (잔여 쿼터 {remaining}명)</Btn>
          )}
          {selected.length > 0 && (
            <Btn variant="warn" onClick={() => setConfirm('rerun')}>재추첨 (추첨당첨 초기화, 별도배정 유지)</Btn>
          )}
        </div>
        {confirm && (
          <div style={{ background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '14px 16px' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-warning)', marginBottom: 10 }}>
              {confirm === 'rerun'
                ? `추첨 당첨 결과를 초기화하고 재추첨합니다. 별도배정 ${manual.length}명은 유지됩니다.`
                : `대기 중인 ${pending.length}명 중 ${remaining}명을 무작위 추첨합니다. (전체 쿼터 ${quota} - 별도배정 ${manual.length})`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="success" onClick={() => runLottery(confirm === 'rerun')}>실행</Btn>
              <Btn onClick={() => setConfirm(false)}>취소</Btn>
            </div>
          </div>
        )}
      </Card>

      {/* 신청자 목록 */}
      {monthApps.length > 0 && (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>{selMonth}월 신청자 목록</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                  {['사번', '객실', '박수', '숙박료', '지원금', '상태'].map(h => (
                    <th key={h} style={{ padding: '7px 10px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthApps.sort((a, b) => {
                  const order = { manual: 0, selected: 1, pending: 2, rejected: 3 }
                  return (order[a.status] ?? 9) - (order[b.status] ?? 9)
                }).map(a => (
                  <tr key={a.id} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '7px 10px', fontWeight: 500 }}>{a.empId}</td>
                    <td style={{ padding: '7px 10px' }}>{a.roomType}</td>
                    <td style={{ padding: '7px 10px' }}>{a.nights}박</td>
                    <td style={{ padding: '7px 10px' }}>{won(a.total)}</td>
                    <td style={{ padding: '7px 10px', color: 'var(--color-text-info)' }}>{won(a.subsidy)}</td>
                    <td style={{ padding: '7px 10px' }}><AppStatusBadge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
