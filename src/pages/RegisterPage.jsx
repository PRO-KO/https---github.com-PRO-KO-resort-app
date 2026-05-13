import { useState } from 'react'
import { validate, sanitize, normalizeEmpId } from '../security'
import { Btn, Card, Alert, Field, KoshaLogo } from '../components/UI'
import * as API from '../api'

export default function RegisterPage({ employees, refreshEmp, setPage }) {
  const [f, setF] = useState({ empId: '', empName: '', pw: '', pw2: '', organization: '', department: '', phone: '' })
  const [err,     setErr]     = useState('')
  const [done,    setDone]    = useState(false)
  const [loading, setLoading] = useState(false)

  const upd = k => v => setF(p => ({ ...p, [k]: v }))

  const handlePhoneChange = v => {
    // 숫자만 추출
    const num = v.replace(/[^0-9]/g, '')
    let formatted = num
    if (num.length > 3 && num.length <= 7) {
      formatted = num.slice(0, 3) + '-' + num.slice(3)
    } else if (num.length > 7) {
      formatted = num.slice(0, 3) + '-' + num.slice(3, 7) + '-' + num.slice(7, 11)
    }
    setF(p => ({ ...p, phone: formatted }))
  }

  const submit = async () => {
    if (loading) return

    // ── 입력 검증 ─────────────────────────────────────────────────────────────
    const id = normalizeEmpId(f.empId)
    const name = sanitize.text(f.empName)
    const org  = sanitize.text(f.organization)
    const dept = sanitize.text(f.department)
    const phone = sanitize.phone(f.phone)

    if (!id)               { setErr('사번을 입력해주세요.'); return }
    if (!validate.empId(id)) { setErr('사번은 영문/숫자/하이픈/언더스코어 1~30자만 허용됩니다.'); return }
    if (!name)             { setErr('이름을 입력해주세요.'); return }
    if (!validate.text50(name)) { setErr('이름은 1~50자이어야 합니다.'); return }
    if (!f.pw || !f.pw2)   { setErr('비밀번호를 입력해주세요.'); return }
    if (!validate.password(f.pw)) { setErr('비밀번호는 4~128자이어야 합니다.'); return }
    if (f.pw !== f.pw2)    { setErr('비밀번호가 일치하지 않습니다.'); return }
    if (!org)              { setErr('기관명을 입력해주세요.'); return }
    if (!validate.text50(org)) { setErr('기관명은 1~50자이어야 합니다.'); return }
    if (!dept)             { setErr('부서명을 입력해주세요.'); return }
    if (!validate.text50(dept)) { setErr('부서명은 1~50자이어야 합니다.'); return }
    if (!phone)            { setErr('휴대폰번호를 입력해주세요.'); return }
    if (!validate.phone(phone)) { setErr('올바른 전화번호 형식이 아닙니다.'); return }

    setErr('')
    setLoading(true)
    try {
      // API 호출 (서버에서 해싱 처리)
      await API.registerEmployee({
        empId: id,
        empName: name,
        password: f.pw,
        organization: org,
        department: dept,
        phone: phone
      })
      
      if (refreshEmp) await refreshEmp()
      setDone(true)
    } catch (e) {
      console.error('[RegisterPage submit]', e)
      setErr(e?.message || '가입 신청 중 오류가 발생했습니다. 이미 존재하는 사번이거나 서버 연결을 확인해주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (done) return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'var(--font-sans)' }}>
      <Card style={{ maxWidth: 420, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <KoshaLogo style={{ display: 'inline-flex', marginBottom: 14 }} />
          <h2 style={{ fontSize: 17, fontWeight: 500, marginBottom: 8 }}>가입 신청이 접수되었습니다</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            관리자가 직원 여부를 확인 후 승인합니다.<br />승인 완료 시 로그인할 수 있습니다.
          </p>
        </div>
        <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '14px 16px', marginBottom: 20 }}>
          {[['신청 사번', normalizeEmpId(f.empId)], ['이름', sanitize.text(f.empName)], ['기관', sanitize.text(f.organization)], ['부서', sanitize.text(f.department)], ['처리 상태', '승인 대기 중']].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{k}</span>
              <span style={{ fontSize: 13, fontWeight: k === '처리 상태' ? 500 : 400, color: k === '처리 상태' ? 'var(--color-text-warning)' : 'var(--color-text-primary)' }}>{v}</span>
            </div>
          ))}
        </div>
        <Btn fullWidth onClick={() => setPage('login')}>로그인 화면으로</Btn>
      </Card>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <KoshaLogo style={{ display: 'inline-flex', marginBottom: 12 }} />
          <h1 style={{ fontSize: 18, fontWeight: 500, marginBottom: 4 }}>가입 신청</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>관리자 승인 후 로그인 가능합니다</p>
        </div>
        <Card>
          {/* 진행 단계 */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 22, paddingBottom: 18, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
            {[['1', '신청', true], ['2', '승인', false], ['3', '로그인', false]].map(([n, l, active], i, arr) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4, background: active ? 'var(--color-background-info)' : 'var(--color-background-secondary)', color: active ? 'var(--color-text-info)' : 'var(--color-text-tertiary)' }}>{n}</div>
                  <span style={{ fontSize: 10, color: active ? 'var(--color-text-info)' : 'var(--color-text-tertiary)' }}>{l}</span>
                </div>
                {i < arr.length - 1 && <div style={{ height: '0.5px', background: 'var(--color-border-tertiary)', flex: 1, marginBottom: 18 }} />}
              </div>
            ))}
          </div>

          {err && <Alert type="danger">{err}</Alert>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 14, marginBottom: 14 }}>
            <Field label="사번" value={f.empId} onChange={upd('empId')} placeholder="예: 2023008" required
              hint="영문/숫자/하이픈/언더스코어 최대 30자" />
            <Field label="이름" value={f.empName} onChange={upd('empName')} placeholder="실명을 입력해주세요" required />
            <Field label="기관" value={f.organization} onChange={upd('organization')} placeholder="예: AI디지털전략실" required />
            <Field label="부서" value={f.department} onChange={upd('department')} placeholder="예: 디지털계획부" required />
            <Field label="휴대폰번호" type="tel" value={f.phone} onChange={handlePhoneChange} placeholder="010-0000-0000" required />
            <Field label="비밀번호 설정" type="password" value={f.pw} onChange={upd('pw')} placeholder="4~128자" required />
            <Field label="비밀번호 확인" type="password" value={f.pw2} onChange={upd('pw2')} placeholder="재입력" required />
          </div>

          <Btn variant="primary" fullWidth onClick={submit} disabled={loading} style={{ marginBottom: 12 }}>
            {loading ? '처리 중…' : '가입 신청하기'}
          </Btn>
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => setPage('login')} style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              ← 로그인으로 돌아가기
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
