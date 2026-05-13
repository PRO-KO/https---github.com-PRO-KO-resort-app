import { useState } from 'react'
import { won, YEAR, MONTHS_KR, getSeason, ADMIN_PW, ADMIN_PW_CONFIGURED } from '../constants'
import { checkLock, clearLock, recordFail, secureTextEqual } from '../security'
import { Btn, Card, Alert, AppStatusBadge } from '../components/UI'
import * as API from '../api'

export default function LotteryTab({ settings, apps, fundUsed, saveApps, saveFundUsed }) {
  const [selMonth,      setSelMonth]      = useState(new Date().getMonth() + 1)
  const [confirm,       setConfirm]       = useState(false)
  const [msg,           setMsg]           = useState(null)
  const [manualId,      setManualId]      = useState('')
  const [manualMsg,     setManualMsg]     = useState(null)

  // 관리자 모드 (별도배정 잠금)
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  const [showPwModal,   setShowPwModal]   = useState(false)
  const [pwInput,       setPwInput]       = useState('')
  const [pwErr,         setPwErr]         = useState('')

  const quota     = (settings?.quotas || {})[selMonth] ?? 20
  const monthApps = (apps || []).filter(a => a.month === selMonth && a.year === YEAR)
  const pending   = monthApps.filter(a => a.status === 'pending')
  const manual    = monthApps.filter(a => a.status === 'manual')
  const selected  = monthApps.filter(a => a.status === 'selected')
  const rejected  = monthApps.filter(a => a.status === 'rejected')
  const remaining = Math.max(0, quota - manual.length)

  const openAdminModal = () => {
    if (adminUnlocked) { setAdminUnlocked(false); return }
    setPwInput(''); setPwErr(''); setShowPwModal(true)
  }

  const confirmAdminPw = () => {
    if (!ADMIN_PW_CONFIGURED) {
      setPwErr('관리자 비밀번호가 설정되지 않았습니다. .env에 VITE_ADMIN_PW를 8자 이상으로 설정해주세요.')
      return
    }
    const lock = checkLock('admin')
    if (lock.locked) {
      setPwErr(`관리자 로그인 시도 횟수 초과. ${lock.remainMin}분 후 다시 시도해주세요.`)
      return
    }
    if (secureTextEqual(pwInput, ADMIN_PW)) {
      clearLock('admin')
      setAdminUnlocked(true); setShowPwModal(false); setPwInput(''); setPwErr('')
    } else {
      recordFail('admin')
      setPwErr('비밀번호가 올바르지 않습니다.')
    }
  }

  // ── 무작위 추첨 ──────────────────────────────────────────────────────────
  const runLottery = async () => {
    try {
      const res = await API.runLottery(selMonth)
      setMsg({ type: 'success', text: res.message })
      // 서버에서 업데이트된 신청 내역 다시 불러오기
      const newApps = await API.fetchApps()
      saveApps(newApps)
      
      // 발전기금 재계산 (서버에서도 하지만 로컬 UI 즉시 반영용)
      const { value: newFundUsed } = await API.fetchFundUsed()
      saveFundUsed(newFundUsed)
      
      setConfirm(false)
    } catch (e) {
      setMsg({ type: 'danger', text: '추첨 실행 중 오류 발생: ' + e.message })
    }
  }

  // ── 별도 배정 ─────────────────────────────────────────────────────────────
  const manualAssign = async () => {
    const id  = manualId.trim()
    const app = monthApps.find(a => a.empId === id)
    if (!app) { setManualMsg({ type: 'warn', text: '해당 월에 해당 사번의 신청 내역이 없습니다.' }); return }

    const isManual  = app.status === 'manual'
    const newStatus = isManual ? 'pending' : 'manual'

    try {
      await API.updateApp(app.id, { status: newStatus })
      
      // 서버에서 최신 데이터 불러오기
      const [newApps, fundRes] = await Promise.all([
        API.fetchApps(),
        API.fetchFundUsed()
      ])
      saveApps(newApps)
      saveFundUsed(fundRes.value)
      
      setManualMsg({ type: 'success', text: `${id} → ${newStatus === 'manual' ? '별도배정 선점 완료' : '대기로 해제'}.` })
      setManualId('')
    } catch (e) {
      setManualMsg({ type: 'danger', text: '별도배정 처리 중 오류 발생: ' + e.message })
    }
  }

  return (
    <div>
      {/* 헤더 행: 월 선택 + 관리자 모드 버튼 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>추첨 대상 월</label>
          <select value={selMonth} onChange={e => { setSelMonth(parseInt(e.target.value)); setMsg(null); setConfirm(false) }}>
            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1}>{MONTHS_KR[i]} ({getSeason(i + 1)})</option>)}
          </select>
        </div>
        <button
          onClick={openAdminModal}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 'var(--border-radius-md)', fontSize: 12,
            border: adminUnlocked ? 'none' : '0.5px solid var(--color-border-secondary)',
            background: adminUnlocked ? 'var(--color-background-danger)' : 'var(--color-background-secondary)',
            color: adminUnlocked ? 'var(--color-text-danger)' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500,
          }}
        >
          {adminUnlocked ? '🔓 관리자 모드 (클릭하여 잠금)' : '🔒 관리자 모드'}
        </button>
      </div>

      {msg && <Alert type={msg.type}>{msg.text}</Alert>}

      {/* 현황 — 별도배정 카드는 관리자 모드 해제 시만 표시 */}
      {(() => {
        const items = [
          ['전체',     monthApps.length, false],
          ['대기',     pending.length,   false],
          ...(adminUnlocked ? [['별도배정', manual.length, true]] : []),
          ['추첨당첨', selected.length,  false],
          ['낙첨',     rejected.length,  false],
          ['잔여쿼터', remaining,        false],
        ]
        return (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 10, marginBottom: 20 }}>
            {items.map(([k, v, isManual]) => (
              <div key={k} style={{ background: isManual ? 'var(--color-background-info)' : 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '12px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: isManual ? 'var(--color-text-info)' : 'var(--color-text-tertiary)', marginBottom: 4 }}>{k}</p>
                <p style={{ fontSize: 20, fontWeight: 500 }}>{v}</p>
              </div>
            ))}
          </div>
        )
      })()}

      {/* 별도배정 섹션 — 관리자 모드 잠금 해제 시만 표시 */}
      {adminUnlocked && (
        <Card style={{ marginBottom: 18, border: '0.5px solid var(--color-border-danger)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: 'var(--color-text-danger)' }}>별도 배정 (추첨 전 선점)</h3>
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
      )}

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
                : `대기 중인 ${pending.length}명 중 ${remaining}명을 무작위 추첨합니다.${adminUnlocked ? ` (전체 쿼터 ${quota} - 별도배정 ${manual.length})` : ''}`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="success" onClick={runLottery}>실행</Btn>
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

      {/* 관리자 비밀번호 모달 */}
      {showPwModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowPwModal(false); setPwInput(''); setPwErr('') } }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{
            background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)',
            padding: '28px 28px 24px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500 }}>관리자 모드 인증</h3>
              <button onClick={() => { setShowPwModal(false); setPwInput(''); setPwErr('') }}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--color-text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 14 }}>
              별도배정 기능을 사용하려면 관리자 비밀번호를 입력하세요.
            </p>
            {pwErr && <Alert type="danger">{pwErr}</Alert>}
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwErr('') }}
              onKeyDown={e => e.key === 'Enter' && confirmAdminPw()}
              placeholder="관리자 비밀번호"
              style={{ width: '100%', marginBottom: 14 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" fullWidth onClick={confirmAdminPw}>확인</Btn>
              <Btn fullWidth onClick={() => { setShowPwModal(false); setPwInput(''); setPwErr('') }}>취소</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
