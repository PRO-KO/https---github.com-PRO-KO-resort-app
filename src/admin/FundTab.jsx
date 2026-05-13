import { useState } from 'react'
import { won, YEAR, MONTHS_KR, getSeason, pctOf, DEFAULT_SETTINGS } from '../constants'
import { Btn, Card, Stat, ProgressBar, SeasonBadge } from '../components/UI'
import * as API from '../api'

export default function FundTab({ settings, apps, fundUsed, saveFundUsed, saveSettings, saveApps }) {
  const s = settings || DEFAULT_SETTINGS
  const budget   = s.fundBudget ?? 20_000_000
  const fundLeft = budget - fundUsed
  const pct      = pctOf(fundUsed, budget)

  const [editBudget,   setEditBudget]   = useState(false)
  const [budgetVal,    setBudgetVal]    = useState(String(budget))
  const [savedMsg,     setSavedMsg]     = useState('')

  // 전체 초기화 확인 상태
  const [fullResetConfirm, setFullResetConfirm] = useState(false)
  // 월별 초기화: 초기화할 월 번호 (null이면 미선택)
  const [monthResetTarget, setMonthResetTarget] = useState(null)

  const flash = msg => { setSavedMsg(msg); setTimeout(() => setSavedMsg(''), 2500) }

  const saveBudget = async () => {
    const v = parseInt(budgetVal.replace(/,/g, '')) || budget
    await saveSettings({ ...(settings || DEFAULT_SETTINGS), fundBudget: v })
    setEditBudget(false)
    flash(`배정액이 ${won(v)}으로 변경되었습니다.`)
  }

  // 월별 집행 데이터 계산 (status: selected | manual 인 앱만 집계)
  const monthly = [...Array(12)].map((_, i) => {
    const m   = i + 1
    const sel = (apps || []).filter(a => a.month === m && a.year === YEAR && (a.status === 'selected' || a.status === 'manual'))
    return { m, sub: sel.reduce((s, a) => s + a.subsidy, 0), cnt: sel.length }
  })

  // 전체 초기화: 올해 selected/manual 앱 전부 pending 복원 + fundUsed = 0
  const handleFullReset = async () => {
    try {
      await API.resetApps()
      // 서버에서 업데이트된 신청 내역 다시 불러오기
      const newApps = await API.fetchApps()
      saveApps(newApps)
      // 발전기금 재계산 결과 가져오기
      const { value } = await API.fetchFundUsed()
      saveFundUsed(value)
      
      setFullResetConfirm(false)
      flash('전체 집행 현황이 초기화되었습니다.')
    } catch (e) {
      alert('초기화 중 오류 발생: ' + e.message)
    }
  }

  // 월별 초기화: 해당 월의 selected/manual 앱을 pending으로, fundUsed에서 해당 월 금액 차감
  const handleMonthReset = async (month) => {
    try {
      await API.resetApps(month)
      // 서버에서 업데이트된 신청 내역 다시 불러오기
      const newApps = await API.fetchApps()
      saveApps(newApps)
      // 발전기금 재계산 결과 가져오기
      const { value } = await API.fetchFundUsed()
      saveFundUsed(value)

      setMonthResetTarget(null)
      flash(`${MONTHS_KR[month - 1]} 집행 현황이 초기화되었습니다.`)
    } catch (e) {
      alert('초기화 중 오류 발생: ' + e.message)
    }
  }

  return (
    <div>
      {savedMsg && (
        <div style={{
          background: 'var(--color-background-success)',
          border: '0.5px solid var(--color-border-success)',
          borderRadius: 'var(--border-radius-md)',
          padding: '10px 14px', fontSize: 13,
          color: 'var(--color-text-success)', marginBottom: 14,
        }}>
          {savedMsg}
        </div>
      )}

      {/* 배정액 관리 */}
      <Card style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14 }}>발전기금 배정액 관리 ({YEAR}년)</h3>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>현재 배정액</p>
            {editBudget
              ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="number" value={budgetVal} onChange={e => setBudgetVal(e.target.value)} style={{ width: 160 }} />
                  <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>원</span>
                  <Btn variant="primary" onClick={saveBudget} style={{ fontSize: 12, padding: '6px 14px' }}>저장</Btn>
                  <Btn onClick={() => { setEditBudget(false); setBudgetVal(String(budget)) }} style={{ fontSize: 12, padding: '6px 14px' }}>취소</Btn>
                </div>
              : <p style={{ fontSize: 22, fontWeight: 500 }}>{won(budget)}</p>
            }
          </div>
          {!editBudget && (
            <Btn onClick={() => { setEditBudget(true); setBudgetVal(String(budget)) }} style={{ fontSize: 12, padding: '6px 14px' }}>수정</Btn>
          )}
        </div>
      </Card>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <Stat label="배정액"      value={won(budget)} />
        <Stat label="집행 지원액" value={won(fundUsed)} />
        <Stat label="잔액"        value={won(fundLeft)} color={fundLeft < budget * 0.2 ? 'var(--color-text-danger)' : undefined} />
        <Stat label="집행률"      value={pct + '%'} />
      </div>

      <div style={{ marginBottom: 28 }}>
        <ProgressBar value={fundUsed} max={budget} />
      </div>

      {/* 월별 집행 현황 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500 }}>월별 집행 현황</h3>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          집행 데이터가 있는 월만 초기화 가능합니다
        </span>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: 8 }}>
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
              {['월', '시즌', '선발 인원', '집행 지원액', '월별 초기화'].map(h => (
                <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthly.map(({ m, sub, cnt }) => (
              <tr key={m} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)', background: monthResetTarget === m ? 'var(--color-background-danger)' : undefined }}>
                <td style={{ padding: '7px 12px', fontWeight: 500 }}>{MONTHS_KR[m - 1]}</td>
                <td style={{ padding: '7px 12px' }}><SeasonBadge season={getSeason(m)} /></td>
                <td style={{ padding: '7px 12px' }}>{cnt > 0 ? cnt + '명' : '-'}</td>
                <td style={{ padding: '7px 12px', color: sub > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                  {sub > 0 ? won(sub) : '-'}
                </td>
                <td style={{ padding: '7px 12px' }}>
                  {cnt === 0
                    ? <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>-</span>
                    : monthResetTarget === m
                      ? <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: 'var(--color-text-danger)', whiteSpace: 'nowrap' }}>
                            {MONTHS_KR[m - 1]} 초기화?
                          </span>
                          <Btn variant="danger" onClick={() => handleMonthReset(m)}
                            style={{ fontSize: 11, padding: '3px 10px' }}>
                            확인
                          </Btn>
                          <Btn onClick={() => setMonthResetTarget(null)}
                            style={{ fontSize: 11, padding: '3px 10px' }}>
                            취소
                          </Btn>
                        </div>
                      : <Btn variant="danger" onClick={() => { setMonthResetTarget(m); setFullResetConfirm(false) }}
                          style={{ fontSize: 11, padding: '3px 10px' }}>
                          초기화
                        </Btn>
                  }
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)' }}>
              <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 500 }}>합계</td>
              <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                {(apps || []).filter(a => a.year === YEAR && (a.status === 'selected' || a.status === 'manual')).length}명
              </td>
              <td style={{ padding: '8px 12px', fontWeight: 500 }}>{won(fundUsed)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      {/* 전체 초기화 */}
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary)', paddingTop: 16, marginTop: 16 }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>
          전체 초기화: 올해 모든 당첨·별도배정 결과를 대기 상태로 되돌리고 집행액을 0으로 초기화합니다.
        </p>
        {!fullResetConfirm
          ? <Btn variant="danger" onClick={() => { setFullResetConfirm(true); setMonthResetTarget(null) }} style={{ fontSize: 12 }}>
              전체 초기화
            </Btn>
          : <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-danger)' }}>
                올해 전체 집행 현황을 초기화하시겠습니까?
              </span>
              <Btn variant="danger" onClick={handleFullReset}>초기화</Btn>
              <Btn onClick={() => setFullResetConfirm(false)}>취소</Btn>
            </div>
        }
      </div>
    </div>
  )
}
