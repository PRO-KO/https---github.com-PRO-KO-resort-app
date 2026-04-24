import { useState } from 'react'
import { fmtDate } from '../constants'
import { Btn, Card, Field, EmpStatusBadge } from '../components/UI'

export default function ApprovalTab({ employees, saveEmp }) {
  const [rejectTarget, setRejectTarget] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [filter,  setFilter]  = useState('pending')
  const [search,  setSearch]  = useState('')
  const [sortKey, setSortKey] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')

  const counts = {
    pending:  Object.values(employees).filter(e => e.status === 'pending').length,
    approved: Object.values(employees).filter(e => e.status === 'approved').length,
    rejected: Object.values(employees).filter(e => e.status === 'rejected').length,
  }

  const toggleSort = key => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const sortIcon = key => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  const list = Object.values(employees)
    .filter(e => {
      if (filter !== 'all' && e.status !== filter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return (e.empId?.toLowerCase().includes(q) ||
              e.organization?.toLowerCase().includes(q) ||
              e.department?.toLowerCase().includes(q) ||
              e.phone?.includes(q))
    })
    .sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    })

  const approve = async id => await saveEmp({ ...employees, [id]: { ...employees[id], status: 'approved', approvedAt: new Date().toISOString() } })
  const reject  = async () => {
    await saveEmp({ ...employees, [rejectTarget]: { ...employees[rejectTarget], status: 'rejected', rejectedAt: new Date().toISOString(), rejectReason: rejectReason.trim() } })
    setRejectTarget(null); setRejectReason('')
  }
  const revert = async id => await saveEmp({ ...employees, [id]: { ...employees[id], status: 'pending', approvedAt: undefined, rejectedAt: undefined, rejectReason: undefined } })

  return (
    <div>
      {/* 요약 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        {[['승인 대기', counts.pending, 'warning'], ['승인 완료', counts.approved, 'success'], ['거절됨', counts.rejected, 'danger']].map(([l, v, t]) => (
          <div key={l} style={{ background: `var(--color-background-${t})`, borderRadius: 'var(--border-radius-md)', padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: `var(--color-text-${t})`, marginBottom: 5 }}>{l}</p>
            <p style={{ fontSize: 22, fontWeight: 500, color: `var(--color-text-${t})` }}>{v}</p>
          </div>
        ))}
      </div>

      {/* 거절 패널 */}
      {rejectTarget && (
        <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-lg)', padding: '16px 20px', marginBottom: 18 }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-danger)', marginBottom: 12 }}>{rejectTarget} 가입 거절</p>
          <Field label="거절 사유 (선택)" value={rejectReason} onChange={setRejectReason} placeholder="예: 직원 명단에 없는 사번입니다"
            onKeyDown={e => e.key === 'Enter' && reject()} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn variant="danger" onClick={reject}>거절 확정</Btn>
            <Btn onClick={() => { setRejectTarget(null); setRejectReason('') }}>취소</Btn>
          </div>
        </div>
      )}

      {/* 검색 & 필터 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="사번 / 기관 / 부서 / 전화 검색" style={{ flex: 1, minWidth: 200, fontSize: 13 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['pending', '대기'], ['all', '전체'], ['approved', '승인'], ['rejected', '거절']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              style={{ background: filter === v ? 'var(--color-background-info)' : 'none', border: '0.5px solid var(--color-border-secondary)',
                       color: filter === v ? 'var(--color-text-info)' : 'var(--color-text-secondary)', padding: '5px 12px',
                       borderRadius: 'var(--border-radius-md)', fontSize: 12, cursor: 'pointer', fontWeight: filter === v ? 500 : 400, fontFamily: 'var(--font-sans)' }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 10 }}>총 {list.length}명</p>

      {list.length === 0
        ? <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '28px', textAlign: 'center' }}>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>조건에 맞는 신청이 없습니다.</p>
          </div>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 620 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                  {[['empId','사번'],['organization','기관'],['department','부서'],['phone','전화'],['createdAt','신청일'],['status','상태']].map(([k,l]) => (
                    <th key={k} onClick={() => toggleSort(k)}
                      style={{ padding: '7px 9px', textAlign: 'left', color: sortKey===k?'var(--color-text-info)':'var(--color-text-secondary)', fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                      {l}{sortIcon(k)}
                    </th>
                  ))}
                  <th style={{ padding: '7px 9px' }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map(emp => (
                  <tr key={emp.empId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '7px 9px', fontWeight: 500 }}>{emp.empId}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.organization || '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.department || '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.phone || '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(emp.createdAt)}</td>
                    <td style={{ padding: '7px 9px' }}><EmpStatusBadge status={emp.status} /></td>
                    <td style={{ padding: '7px 9px' }}>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {emp.status === 'pending' && <>
                          <Btn variant="success" onClick={() => approve(emp.empId)} style={{ fontSize: 11, padding: '4px 10px' }}>승인</Btn>
                          <Btn variant="danger"  onClick={() => { setRejectTarget(emp.empId); setRejectReason('') }} style={{ fontSize: 11, padding: '4px 10px' }}>거절</Btn>
                        </>}
                        {(emp.status === 'approved' || emp.status === 'rejected') && (
                          <Btn onClick={() => revert(emp.empId)} style={{ fontSize: 11, padding: '4px 10px' }}>대기로</Btn>
                        )}
                        {emp.status === 'rejected' && emp.rejectReason && (
                          <span style={{ fontSize: 11, color: 'var(--color-text-danger)', alignSelf: 'center' }}>사유: {emp.rejectReason}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}
