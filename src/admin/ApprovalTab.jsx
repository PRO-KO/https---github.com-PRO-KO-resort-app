import { useState } from 'react'
import { fmtDate } from '../constants'
import { Btn, Field } from '../components/UI'

// 검색어로 직원 매칭
const matches = (emp, q) => {
  const s = q.toLowerCase()
  return (
    emp.empId?.toLowerCase().includes(s) ||
    emp.organization?.toLowerCase().includes(s) ||
    emp.department?.toLowerCase().includes(s) ||
    emp.phone?.includes(s)
  )
}

export default function ApprovalTab({ employees, saveEmp }) {
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  // 섹션별 검색어
  const [pendingSearch,  setPendingSearch]  = useState('')
  const [approvedSearch, setApprovedSearch] = useState('')
  const [rejectedSearch, setRejectedSearch] = useState('')

  // 섹션 접기/펼치기 (승인 완료, 거절됨은 기본 접힘)
  const [showApproved, setShowApproved] = useState(true)
  const [showRejected, setShowRejected] = useState(false)

  const allList = Object.values(employees)

  const pendingList = allList
    .filter(e => e.status === 'pending' && (!pendingSearch || matches(e, pendingSearch)))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))

  const approvedList = allList
    .filter(e => e.status === 'approved' && (!approvedSearch || matches(e, approvedSearch)))
    .sort((a, b) => String(b.approvedAt ?? b.createdAt ?? '').localeCompare(String(a.approvedAt ?? a.createdAt ?? '')))

  const rejectedList = allList
    .filter(e => e.status === 'rejected' && (!rejectedSearch || matches(e, rejectedSearch)))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))

  const counts = { pending: allList.filter(e => e.status === 'pending').length, approved: allList.filter(e => e.status === 'approved').length, rejected: allList.filter(e => e.status === 'rejected').length }

  // 액션
  const approve = async id => saveEmp({ ...employees, [id]: { ...employees[id], status: 'approved', approvedAt: new Date().toISOString() } })
  const reject  = async () => {
    await saveEmp({ ...employees, [rejectTarget]: { ...employees[rejectTarget], status: 'rejected', rejectedAt: new Date().toISOString(), rejectReason: rejectReason.trim() } })
    setRejectTarget(null); setRejectReason('')
  }
  const revert = async id => saveEmp({ ...employees, [id]: { ...employees[id], status: 'pending', approvedAt: undefined, rejectedAt: undefined, rejectReason: undefined } })

  // 공통 테이블 스타일
  const thStyle = { padding: '7px 9px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }
  const tdStyle = { padding: '7px 9px', fontSize: 12, color: 'var(--color-text-secondary)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* 요약 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {[['승인 대기', counts.pending, 'warning'], ['승인 완료', counts.approved, 'success'], ['거절됨', counts.rejected, 'danger']].map(([l, v, t]) => (
          <div key={l} style={{ background: `var(--color-background-${t})`, borderRadius: 'var(--border-radius-md)', padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: `var(--color-text-${t})`, marginBottom: 5 }}>{l}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: `var(--color-text-${t})` }}>{v}</p>
          </div>
        ))}
      </div>

      {/* ── 거절 입력 패널 ───────────────────────────────────────────────────── */}
      {rejectTarget && (
        <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-lg)', padding: '16px 20px' }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-danger)', marginBottom: 12 }}>{rejectTarget} 가입 거절</p>
          <Field label="거절 사유 (선택)" value={rejectReason} onChange={setRejectReason}
            placeholder="예: 직원 명단에 없는 사번입니다"
            onKeyDown={e => e.key === 'Enter' && reject()} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn variant="danger" onClick={reject}>거절 확정</Btn>
            <Btn onClick={() => { setRejectTarget(null); setRejectReason('') }}>취소</Btn>
          </div>
        </div>
      )}

      {/* ── 1. 가입 대기 ─────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            승인 대기
            {counts.pending > 0 && (
              <span style={{ background: 'var(--color-background-warning)', color: 'var(--color-text-warning)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                {counts.pending}
              </span>
            )}
          </h3>
          <input value={pendingSearch} onChange={e => setPendingSearch(e.target.value)}
            placeholder="사번 / 기관 / 부서 / 전화 검색"
            style={{ fontSize: 13, width: 220 }} />
        </div>

        {pendingList.length === 0
          ? <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '20px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                {pendingSearch ? '검색 결과가 없습니다.' : '승인 대기 중인 신청이 없습니다.'}
              </p>
            </div>
          : <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                    {['사번', '기관', '부서', '전화', '신청일', ''].map((h, i) => (
                      <th key={i} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingList.map(emp => (
                    <tr key={emp.empId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text-primary)' }}>{emp.empId}</td>
                      <td style={tdStyle}>{emp.organization || '-'}</td>
                      <td style={tdStyle}>{emp.department  || '-'}</td>
                      <td style={tdStyle}>{emp.phone       || '-'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(emp.createdAt)}</td>
                      <td style={{ padding: '7px 9px' }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <Btn variant="success" onClick={() => approve(emp.empId)} style={{ fontSize: 11, padding: '4px 10px' }}>승인</Btn>
                          <Btn variant="danger"  onClick={() => { setRejectTarget(emp.empId); setRejectReason('') }} style={{ fontSize: 11, padding: '4px 10px' }}>거절</Btn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </section>

      {/* ── 2. 승인 완료 ─────────────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showApproved ? 10 : 0, gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setShowApproved(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0, fontFamily: 'var(--font-sans)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>승인 완료</h3>
            <span style={{ background: 'var(--color-background-success)', color: 'var(--color-text-success)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
              {counts.approved}명
            </span>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{showApproved ? '▲' : '▼'}</span>
          </button>
          {showApproved && (
            <input value={approvedSearch} onChange={e => setApprovedSearch(e.target.value)}
              placeholder="사번 / 기관 / 부서 / 전화 검색"
              style={{ fontSize: 13, width: 220 }} />
          )}
        </div>

        {showApproved && (
          approvedList.length === 0
            ? <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '20px', textAlign: 'center' }}>
                <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  {approvedSearch ? '검색 결과가 없습니다.' : '승인된 계정이 없습니다.'}
                </p>
              </div>
            : <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                      {['사번', '기관', '부서', '전화', '신청일', '승인일', ''].map((h, i) => (
                        <th key={i} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {approvedList.map(emp => (
                      <tr key={emp.empId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                        <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text-primary)' }}>{emp.empId}</td>
                        <td style={tdStyle}>{emp.organization || '-'}</td>
                        <td style={tdStyle}>{emp.department  || '-'}</td>
                        <td style={tdStyle}>{emp.phone       || '-'}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(emp.createdAt)}</td>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: 'var(--color-text-success)' }}>{fmtDate(emp.approvedAt)}</td>
                        <td style={{ padding: '7px 9px' }}>
                          <Btn onClick={() => revert(emp.empId)} style={{ fontSize: 11, padding: '4px 10px' }}>대기로</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
        )}
      </section>

      {/* ── 3. 거절됨 ────────────────────────────────────────────────────────── */}
      {counts.rejected > 0 && (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showRejected ? 10 : 0, gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setShowRejected(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0, fontFamily: 'var(--font-sans)' }}>
              <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-primary)' }}>거절됨</h3>
              <span style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>
                {counts.rejected}명
              </span>
              <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{showRejected ? '▲' : '▼'}</span>
            </button>
            {showRejected && (
              <input value={rejectedSearch} onChange={e => setRejectedSearch(e.target.value)}
                placeholder="사번 / 기관 / 부서 / 전화 검색"
                style={{ fontSize: 13, width: 220 }} />
            )}
          </div>

          {showRejected && (
            rejectedList.length === 0
              ? <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '20px', textAlign: 'center' }}>
                  <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>검색 결과가 없습니다.</p>
                </div>
              : <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                        {['사번', '기관', '부서', '전화', '신청일', '거절 사유', ''].map((h, i) => (
                          <th key={i} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedList.map(emp => (
                        <tr key={emp.empId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                          <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text-primary)' }}>{emp.empId}</td>
                          <td style={tdStyle}>{emp.organization || '-'}</td>
                          <td style={tdStyle}>{emp.department  || '-'}</td>
                          <td style={tdStyle}>{emp.phone       || '-'}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(emp.createdAt)}</td>
                          <td style={{ ...tdStyle, color: 'var(--color-text-danger)' }}>{emp.rejectReason || '-'}</td>
                          <td style={{ padding: '7px 9px' }}>
                            <Btn onClick={() => revert(emp.empId)} style={{ fontSize: 11, padding: '4px 10px' }}>대기로</Btn>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
          )}
        </section>
      )}

    </div>
  )
}
