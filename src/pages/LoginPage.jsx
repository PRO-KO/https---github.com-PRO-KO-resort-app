import { useState, useRef } from 'react'
import { ADMIN_PW, YEAR } from '../constants'
import {
  verifyPwdCompat, needsUpgrade, hashPwd, generateSalt,
  checkLock, recordFail, clearLock, touchSession,
  sanitize, MAX_ATTEMPTS,
} from '../security'
import { Btn, Card, Alert, Field, KoshaLogo } from '../components/UI'

export default function LoginPage({ employees, saveEmp, loginUser, loginAdmin, setPage }) {
  const [empId,     setEmpId]     = useState('')
  const [pw,        setPw]        = useState('')
  const [err,       setErr]       = useState('')
  const [loading,   setLoading]   = useState(false)
  const [adminPw,   setAdminPw]   = useState('')
  const [adminErr,  setAdminErr]  = useState('')
  const [showAdmin, setShowAdmin] = useState(false)

  const clickCount = useRef(0); const clickTimer = useRef(null)

  const handleLogoClick = () => {
    clickCount.current += 1
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => { clickCount.current = 0 }, 2000)
    if (clickCount.current >= 5) {
      clickCount.current = 0; clearTimeout(clickTimer.current); setShowAdmin(true)
    }
  }

  const handleLogin = async () => {
    if (loading) return
    // 새니타이징
    const id = sanitize.empId(empId)
    if (!id || !pw) { setErr('사번과 비밀번호를 입력해주세요.'); return }
    if (pw.length > 128) { setErr('비밀번호가 너무 깁니다.'); return }

    // 잠금 확인 (Brute-force 방지)
    const lock = checkLock(id)
    if (lock.locked) {
      setErr(`로그인 시도 횟수 초과. ${lock.remainMin}분 후 다시 시도해주세요.`)
      return
    }

    const emp = employees[id]

    // ※ 사용자 존재 여부를 같은 에러 메시지로 표현 (사용자 열거 공격 방지)
    if (!emp || emp.status === 'rejected') {
      recordFail(id)
      setErr('사번 또는 비밀번호가 올바르지 않습니다.')
      return
    }

    if (emp.status === 'pending') {
      setErr('관리자 승인 대기 중입니다. 승인 후 로그인할 수 있습니다.')
      return
    }

    setLoading(true)
    try {
      // 비밀번호 검증 (PBKDF2 or 구버전 호환)
      const ok = await verifyPwdCompat(pw, emp)
      if (!ok) {
        const result = recordFail(id)
        const remain = MAX_ATTEMPTS - result.attempts
        setErr(result.locked
          ? '로그인 시도 횟수 초과. 15분간 잠금됩니다.'
          : `사번 또는 비밀번호가 올바르지 않습니다. (남은 시도: ${remain}회)`)
        return
      }

      // 성공 처리
      clearLock(id)
      touchSession()

      // 구버전 해시 자동 업그레이드 (PBKDF2로 마이그레이션)
      if (needsUpgrade(emp)) {
        const salt    = generateSalt()
        const newHash = await hashPwd(pw, salt)
        await saveEmp({ ...employees, [id]: { ...emp, pwHash: newHash, pwSalt: salt } })
      }

      loginUser({ empId: id })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'var(--font-sans)' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <KoshaLogo onClick={handleLogoClick} style={{ display: 'inline-flex', marginBottom: 14 }} />
          <h1 style={{ fontSize: 17, fontWeight: 500, marginBottom: 4 }}>발전기금 휴양소 예약 시스템</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>{YEAR}년 임직원 복리후생</p>
        </div>

        <Card style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 500, marginBottom: 18 }}>직원 로그인</h2>
          {err && <Alert type="danger">{err}</Alert>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            <Field label="사번" value={empId}
              onChange={v => { setEmpId(v); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="예: EMP-0001" />
            <Field label="비밀번호" type="password" value={pw}
              onChange={v => { setPw(v); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호 입력" />
          </div>
          <Btn variant="primary" fullWidth onClick={handleLogin} disabled={loading}>
            {loading ? '인증 중…' : '로그인'}
          </Btn>
        </Card>

        {showAdmin && (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 500 }}>관리자</h3>
              <button onClick={() => { setShowAdmin(false); setAdminPw(''); setAdminErr('') }}
                style={{ background: 'none', border: 'none', fontSize: 18, color: 'var(--color-text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {adminErr && <Alert type="danger">{adminErr}</Alert>}
            <Field label="비밀번호" type="password" value={adminPw}
              onChange={v => { setAdminPw(v); setAdminErr('') }}
              onKeyDown={e => e.key === 'Enter' && (adminPw === ADMIN_PW ? loginAdmin() : setAdminErr('비밀번호가 올바르지 않습니다.'))}
              placeholder="관리자 비밀번호" />
            <div style={{ marginTop: 12 }}>
              <Btn variant="primary" fullWidth onClick={() => {
                if (adminPw === ADMIN_PW) { touchSession(); loginAdmin() }
                else setAdminErr('비밀번호가 올바르지 않습니다.')
              }}>로그인</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
