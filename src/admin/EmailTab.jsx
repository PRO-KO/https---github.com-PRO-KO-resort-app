import { useState } from 'react'
import { YEAR, MONTHS_KR, won } from '../constants'
import { sendEmail, buildEmailBody, getRecipient } from '../emailService'
import { Btn, Alert } from '../components/UI'

export default function EmailTab({ apps, employees }) {
  const [selMonth,  setSelMonth]  = useState(new Date().getMonth() + 1)
  const [emailType, setEmailType] = useState('winner')
  const [sending,   setSending]   = useState(false)
  const [results,   setResults]   = useState({})
  const [preview,   setPreview]   = useState(null)
  const [search,    setSearch]    = useState('')

  const allTargets = apps.filter(a =>
    a.month === selMonth && a.year === YEAR &&
    (emailType === 'winner'
      ? a.status === 'selected' || a.status === 'manual'
      : a.status === 'rejected')
  )

  // 검색 필터 적용
  const targetApps = search
    ? allTargets.filter(a => {
        const q = search.toLowerCase()
        const emp = employees[a.empId]
        return a.empId.toLowerCase().includes(q) ||
               emp?.organization?.toLowerCase().includes(q) ||
               emp?.department?.toLowerCase().includes(q) ||
               emp?.phone?.includes(q)
      })
    : allTargets

  const sentCnt  = Object.values(results).filter(v => v === 'success').length
  const errorCnt = Object.values(results).filter(v => v === 'error').length

  const sendOne = async (app) => {
    const to      = getRecipient(app.empId, emailType)
    const subject = emailType === 'winner'
      ? `[안전보건공단] 휴양소 예약 당첨 안내 (${selMonth}월)`
      : `[안전보건공단] 휴양소 예약 신청 결과 안내 (${selMonth}월)`
    const body = buildEmailBody(emailType, app, employees[app.empId], selMonth)
    setResults(r => ({ ...r, [app.id]: 'sending' }))
    try {
      await sendEmail(to, subject, body)
      setResults(r => ({ ...r, [app.id]: 'success' }))
    } catch (e) {
      console.error('[email]', e)
      setResults(r => ({ ...r, [app.id]: 'error' }))
    }
  }

  const sendAll = async () => {
    setSending(true)
    for (const app of targetApps) await sendOne(app)
    setSending(false)
  }

  const statusIcon = st => {
    if (st === 'sending') return <span style={{ fontSize: 11, color: 'var(--color-text-warning)' }}>발송 중…</span>
    if (st === 'success') return <span style={{ fontSize: 11, color: 'var(--color-text-success)' }}>✓ 완료</span>
    if (st === 'error')   return <span style={{ fontSize: 11, color: 'var(--color-text-danger)' }}>✗ 실패</span>
    return                       <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>미발송</span>
  }

  return (
    <div>
      {/* 설정 */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>대상 월</label>
          <select value={selMonth} onChange={e => { setSelMonth(parseInt(e.target.value)); setResults({}); setSearch('') }} style={{ width: 180 }}>
            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{MONTHS_KR[i]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}>메일 종류</label>
          <select value={emailType} onChange={e => { setEmailType(e.target.value); setResults({}); setSearch('') }} style={{ width: 260 }}>
            <option value="winner">당첨 메일 (외부 @kosha.or.kr)</option>
            <option value="loser"> 낙첨 메일 (내부 @kosha-kms1.kosha.or.kr)</option>
          </select>
        </div>
      </div>

      {(sentCnt > 0 || errorCnt > 0) && (
        <Alert type={errorCnt > 0 ? 'warn' : 'success'} style={{ marginBottom: 14 }}>
          발송 완료: {sentCnt}건{errorCnt > 0 && ` / 실패: ${errorCnt}건`}
        </Alert>
      )}

      {/* 수신자 검색 + 액션 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="사번 / 기관 / 부서 / 전화 검색" style={{ flex: 1, minWidth: 180, fontSize: 13 }} />
        <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{targetApps.length}명</span>
        {targetApps.length > 0 && (
          <Btn onClick={() => setPreview(targetApps[0])} style={{ fontSize: 12, padding: '6px 14px' }}>미리보기</Btn>
        )}
        <Btn variant={sending ? 'default' : 'primary'} onClick={sendAll}
          disabled={sending || targetApps.length === 0} style={{ fontSize: 12, padding: '6px 14px' }}>
          {sending ? '발송 중…' : '전체 발송'}
        </Btn>
      </div>

      {targetApps.length === 0
        ? <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {allTargets.length > 0 && search ? `검색 결과 없음 (전체 ${allTargets.length}명)` : `${selMonth}월 ${emailType === 'winner' ? '당첨자' : '낙첨자'}가 없거나 추첨이 실행되지 않았습니다.`}
            </p>
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {targetApps.map(app => {
              const emp = employees[app.empId]
              return (
                <div key={app.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-md)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{app.empId}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{emp?.organization ?? ''} {emp?.department ?? ''}</span>
                      {emp?.phone && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{emp.phone}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      → {getRecipient(app.empId, emailType)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {app.roomType} / {app.nights}박 / 지원금 {won(app.subsidy)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {statusIcon(results[app.id])}
                    <Btn onClick={() => sendOne(app)} disabled={results[app.id] === 'sending'} style={{ fontSize: 11, padding: '4px 10px' }}>개별 발송</Btn>
                  </div>
                </div>
              )
            })}
          </div>
      }

      {/* 메일 미리보기 */}
      {preview && (
        <div style={{ marginTop: 20, background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>메일 미리보기</span>
            <button onClick={() => setPreview(null)} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>×</button>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>받는 사람: <strong>{getRecipient(preview.empId, emailType)}</strong></p>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
              제목: {emailType === 'winner' ? `[안전보건공단] 휴양소 예약 당첨 안내 (${selMonth}월)` : `[안전보건공단] 휴양소 예약 신청 결과 안내 (${selMonth}월)`}
            </p>
            <pre style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-sans)', background: 'var(--color-background-primary)', padding: '14px 16px', borderRadius: 'var(--border-radius-md)' }}>
              {buildEmailBody(emailType, preview, employees[preview.empId], selMonth)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
