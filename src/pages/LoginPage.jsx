import { useState, useRef } from 'react'
import * as API from '../api'
import { ADMIN_PW, ADMIN_PW_CONFIGURED, YEAR } from '../constants'
import {
  verifyPwdCompat, needsUpgrade, hashPwd, generateSalt,
  checkLock, recordFail, clearLock, touchSession,
  normalizeEmpId, secureTextEqual, MAX_ATTEMPTS,
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
    const id = normalizeEmpId(empId)
    if (!id || !pw) { setErr('사번과 비밀번호를 입력해주세요.'); return }

    setErr('')
    setLoading(true)
    try {
      // 서버 API를 통한 로그인
      const res = await API.login(id, pw)
      API.setToken(res.token)
      clearLock(id)
      touchSession()
      loginUser({ empId: id })
    } catch (e) {
      console.error('[LoginPage handleLogin]', e)
      setErr(e?.message || '로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleAdminLogin = async () => {
    setAdminErr('')
    try {
      // 서버 API를 통한 관리자 로그인
      const res = await API.adminLogin(adminPw)
      clearLock('admin')
      API.setToken(res.token)
      touchSession()
      loginAdmin()
    } catch (e) {
      recordFail('admin')
      setAdminErr(e.message || '관리자 비밀번호가 올바르지 않습니다.')
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
              placeholder="예: 2023008" />
            <Field label="비밀번호" type="password" value={pw}
              onChange={v => { setPw(v); setErr('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="비밀번호 입력" />
          </div>
          <Btn variant="primary" fullWidth onClick={handleLogin} disabled={loading} style={{ marginBottom: 12 }}>
            {loading ? '인증 중…' : '로그인'}
          </Btn>
          <div style={{ textAlign: 'center', paddingTop: 8, borderTop: '0.5px solid var(--color-border-tertiary)' }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>처음 사용하시나요?&nbsp;</span>
            <button
              onClick={() => setPage('register')}
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--color-text-info)', cursor: 'pointer', fontWeight: 500, padding: 0, fontFamily: 'var(--font-sans)' }}
            >
              가입 신청하기 →
            </button>
          </div>
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
              onKeyDown={e => e.key === 'Enter' && handleAdminLogin()}
              placeholder="관리자 비밀번호" />
            <div style={{ marginTop: 12 }}>
              <Btn variant="primary" fullWidth onClick={handleAdminLogin}>로그인</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
