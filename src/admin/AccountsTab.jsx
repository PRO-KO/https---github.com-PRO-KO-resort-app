import { useState } from 'react'
import { YEAR } from "../constants";
import { hashPwd, generateSalt, validate, sanitize } from "../security";
import { Btn, Field, Alert } from "../components/UI";

export default function AccountsTab({ employees, apps, saveEmp }) {
  const [f, setF] = useState({ empId: '', pw: '', org: '', dept: '', phone: '' })
  const [err,        setErr]        = useState('')
  const [ok,         setOk]         = useState('')
  const [loading,    setLoading]    = useState(false)
  const [resetTarget,setResetTarget]= useState(null)
  const [resetPw,    setResetPw]    = useState('')
  const [delConfirm, setDelConfirm] = useState(null)
  const [search,     setSearch]     = useState('')
  const [showAdd,    setShowAdd]    = useState(false)

  const upd   = k => v => setF(p => ({ ...p, [k]: v }))
  const flash = msg => { setOk(msg); setTimeout(() => setOk(''), 2500) }

  const list = Object.values(employees)
    .filter(e => {
      if (e.status !== 'approved') return false
      if (!search) return true
      const q = search.toLowerCase()
      return e.empId.toLowerCase().includes(q) ||
             e.organization?.toLowerCase().includes(q) ||
             e.department?.toLowerCase().includes(q) ||
             e.phone?.includes(q)
    })
    .sort((a, b) => a.empId.localeCompare(b.empId))

  // ── 계정 추가 ──────────────────────────────────────────────────────────────
  const addEmp = async () => {
    if (loading) return
    const id    = sanitize.empId(f.empId)
    const org   = sanitize.text(f.organization)
    const dept  = sanitize.text(f.department)
    const phone = sanitize.phone(f.phone)

    if (!id || !validate.empId(id))  { setErr('사번은 영문/숫자/하이픈/언더스코어 1~30자이어야 합니다.'); return }
    if (!validate.password(f.pw))    { setErr('비밀번호는 4~128자이어야 합니다.'); return }
    if (employees[id])               { setErr('이미 존재하는 사번입니다.'); return }

    setLoading(true)
    try {
      const salt = generateSalt()
      const hash = await hashPwd(f.pw, salt)
      await saveEmp({
        ...employees,
        [id]: {
          empId: id, pwHash: hash, pwSalt: salt, status: 'approved',
          organization: org, department: dept, phone,
          createdAt: new Date().toISOString(), approvedAt: new Date().toISOString(),
        },
      })
      setF({ empId: '', pw: '', org: '', dept: '', phone: '' })
      setErr('')
      flash(`${id} 계정 추가 완료.`)
      setShowAdd(false)
    } finally {
      setLoading(false)
    }
  }

  const closeAddModal = () => { setShowAdd(false); setF({ empId: '', pw: '', org: '', dept: '', phone: '' }); setErr('') }

  // ── 비밀번호 초기화 ────────────────────────────────────────────────────────
  const resetPassword = async () => {
    if (!validate.password(resetPw)) { setErr('새 비밀번호는 4~128자이어야 합니다.'); return }
    setLoading(true)
    try {
      const salt = generateSalt()
      const hash = await hashPwd(resetPw, salt)
      await saveEmp({ ...employees, [resetTarget.empId]: { ...employees[resetTarget.empId], pwHash: hash, pwSalt: salt } })
      flash(`${resetTarget.empId} 비밀번호 변경 완료.`)
      setResetTarget(null); setResetPw(''); setErr('')
    } finally {
      setLoading(false)
    }
  }

  // ── 계정 삭제 ──────────────────────────────────────────────────────────────
  const deleteEmp = async id => {
    const { [id]: _, ...rest } = employees
    await saveEmp(rest)
    setDelConfirm(null)
    flash(`${id} 계정 삭제 완료.`)
  }

  return (
    <div>
      {ok  && <Alert type="success">{ok}</Alert>}

      {/* 계정 목록 헤더 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500 }}>승인된 계정 ({list.length}명)</h3>
          <button
            onClick={() => setShowAdd(true)}
            title="직원 계정 직접 추가"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--color-background-info)', border: 'none',
              color: 'var(--color-text-info)', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', lineHeight: 1, flexShrink: 0,
            }}
          >+</button>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="사번 / 기관 / 부서 / 전화 검색" style={{ width: 220, fontSize: 13 }} />
      </div>

      {list.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>조건에 맞는 계정이 없습니다.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--color-border-secondary)' }}>
                  {['사번', '기관', '부서', '전화', '가입일', '신청수', '비밀번호', '삭제'].map(h => (
                    <th key={h} style={{ padding: '7px 9px', textAlign: 'left', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(emp => (
                  <tr key={emp.empId} style={{ borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
                    <td style={{ padding: '7px 9px', fontWeight: 500 }}>{emp.empId}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.organization ?? '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.department  ?? '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)' }}>{emp.phone       ?? '-'}</td>
                    <td style={{ padding: '7px 9px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {emp.createdAt ? new Date(emp.createdAt).toLocaleDateString('ko-KR') : '-'}
                    </td>
                    <td style={{ padding: '7px 9px' }}>{apps.filter(a => a.empId === emp.empId && a.year === YEAR).length}건</td>

                    {/* 비밀번호 초기화 */}
                    <td style={{ padding: '7px 9px' }}>
                      {resetTarget?.empId === emp.empId
                        ? <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                            <input type="password" value={resetPw} onChange={e => setResetPw(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && resetPassword()}
                              placeholder="새 비밀번호 (4~128자)" style={{ width: 130, fontSize: 12 }} />
                            <Btn variant="success" onClick={resetPassword} disabled={loading} style={{ fontSize: 11, padding: '4px 9px' }}>
                              {loading ? '…' : '확인'}
                            </Btn>
                            <Btn onClick={() => { setResetTarget(null); setResetPw('') }} style={{ fontSize: 11, padding: '4px 9px' }}>취소</Btn>
                          </div>
                        : <Btn onClick={() => setResetTarget(emp)} style={{ fontSize: 11, padding: '4px 9px' }}>초기화</Btn>
                      }
                    </td>

                    {/* 삭제 */}
                    <td style={{ padding: '7px 9px' }}>
                      {delConfirm === emp.empId
                        ? <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                            <Btn variant="danger" onClick={() => deleteEmp(emp.empId)} style={{ fontSize: 11, padding: '4px 9px' }}>삭제</Btn>
                            <Btn onClick={() => setDelConfirm(null)} style={{ fontSize: 11, padding: '4px 9px' }}>취소</Btn>
                          </div>
                        : <Btn variant="danger" onClick={() => setDelConfirm(emp.empId)} style={{ fontSize: 11, padding: '4px 9px' }}>삭제</Btn>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }

      {/* 계정 직접 추가 모달 */}
      {showAdd && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeAddModal() }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
        >
          <div style={{
            background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)',
            padding: '28px 28px 24px', width: '100%', maxWidth: 520,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)', margin: '0 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500 }}>직원 계정 직접 추가</h3>
              <button onClick={closeAddModal}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--color-text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 18 }}>관리자가 직접 계정을 생성합니다. 즉시 승인 상태로 등록됩니다.</p>
            {err && <Alert type="danger">{err}</Alert>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
              <Field label="사번"          value={f.empId} onChange={upd('empId')} placeholder="EMP-0001" />
              <Field label="기관"          value={f.org}   onChange={upd('org')}   placeholder="안전보건공단" />
              <Field label="부서"          value={f.dept}  onChange={upd('dept')}  placeholder="인사부" />
              <Field label="휴대폰"        type="tel" value={f.phone} onChange={upd('phone')} placeholder="010-0000-0000" />
              <Field label="초기 비밀번호"  type="password" value={f.pw} onChange={upd('pw')} placeholder="4~128자"
                onKeyDown={e => e.key === 'Enter' && addEmp()} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" onClick={addEmp} disabled={loading}>{loading ? '처리 중…' : '추가'}</Btn>
              <Btn onClick={closeAddModal}>취소</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
