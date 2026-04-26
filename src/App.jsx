import { useState, useEffect, useRef } from 'react'
import { DEFAULT_SETTINGS, ADMIN_PW } from './constants'
import { lsGet, lsSet, KEYS } from './storage'
import { touchSession, isSessionValid, clearSession, SESSION_MS } from './security'
import { KoshaLogo, Btn } from './components/UI'

import LoginPage    from './pages/LoginPage'
import HomePage     from './pages/HomePage'
import ApplyPage    from './pages/ApplyPage'
import StatusPage   from './pages/StatusPage'
import AdminLayout  from './admin/AdminLayout'

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [page,        setPage]        = useState('login')
  const [adminAuth,   setAdminAuth]   = useState(false)
  const [employees,   setEmployees]   = useState(null)
  const [apps,        setApps]        = useState(null)
  const [settings,    setSettings]    = useState(null)
  const [fundUsed,    setFundUsed]    = useState(0)
  // 세션 만료 경고 표시 여부
  const [sessionWarn,        setSessionWarn]        = useState(false)
  // 네비게이션 로고 5-click 관리자 진입
  const [showNavAdminModal,  setShowNavAdminModal]  = useState(false)
  const [navAdminPw,         setNavAdminPw]         = useState('')
  const [navAdminErr,        setNavAdminErr]         = useState('')
  const navLogoClicks = useRef(0)
  const navLogoTimer  = useRef(null)

  useEffect(() => {
    const emp = lsGet(KEYS.employees, {})
    const a   = lsGet(KEYS.apps,      [])
    const raw = lsGet(KEYS.settings,  DEFAULT_SETTINGS)
    const fu  = lsGet(KEYS.fundUsed,  0)
    if (!raw.rooms)              raw.rooms              = DEFAULT_SETTINGS.rooms
    if (!raw.applicationPeriods) raw.applicationPeriods = DEFAULT_SETTINGS.applicationPeriods
    if (!raw.fundBudget)         raw.fundBudget         = DEFAULT_SETTINGS.fundBudget
    if (!raw.peakDayQuotas)      raw.peakDayQuotas      = DEFAULT_SETTINGS.peakDayQuotas
    if (!raw.peakHolidays)       raw.peakHolidays       = DEFAULT_SETTINGS.peakHolidays
    setEmployees(emp); setApps(a); setSettings(raw); setFundUsed(fu)
  }, [])

  // ── 세션 타임아웃 관리 ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser && !adminAuth) return

    // 활동 시 세션 갱신
    const onActivity = () => { touchSession(); setSessionWarn(false) }
    document.addEventListener('click',    onActivity, true)
    document.addEventListener('keypress', onActivity, true)
    document.addEventListener('scroll',   onActivity, true)

    // 1분마다 세션 유효 여부 확인
    const checkInterval = setInterval(() => {
      if (!isSessionValid()) {
        handleLogout()
      } else {
        // 세션 만료 5분 전 경고
        const remaining = sessionStorage.getItem('_sess_ts')
        if (remaining && (Date.now() - parseInt(remaining)) > SESSION_MS - 5 * 60 * 1000) {
          setSessionWarn(true)
        }
      }
    }, 60_000)

    return () => {
      document.removeEventListener('click',    onActivity, true)
      document.removeEventListener('keypress', onActivity, true)
      document.removeEventListener('scroll',   onActivity, true)
      clearInterval(checkInterval)
    }
  }, [currentUser, adminAuth])

  const saveEmp      = e => { setEmployees(e); lsSet(KEYS.employees, e) }
  const saveApps     = a => { setApps(a);      lsSet(KEYS.apps,      a) }
  const saveSettings = s => { setSettings(s);  lsSet(KEYS.settings,  s) }
  const saveFundUsed = v => { setFundUsed(v);  lsSet(KEYS.fundUsed,  v) }

  const loginUser  = user => { setCurrentUser(user); setAdminAuth(false); setPage('home'); touchSession() }
  const loginAdmin = ()   => { setCurrentUser(null); setAdminAuth(true);  setPage('admin'); touchSession() }

  const handleNavLogoClick = () => {
    navLogoClicks.current += 1
    if (navLogoTimer.current) clearTimeout(navLogoTimer.current)
    navLogoTimer.current = setTimeout(() => { navLogoClicks.current = 0 }, 2000)
    if (navLogoClicks.current >= 5) {
      navLogoClicks.current = 0; clearTimeout(navLogoTimer.current)
      setNavAdminPw(''); setNavAdminErr(''); setShowNavAdminModal(true)
    }
  }

  const confirmNavAdmin = () => {
    if (navAdminPw === ADMIN_PW) {
      setShowNavAdminModal(false); setNavAdminPw(''); setNavAdminErr('')
      loginAdmin()
    } else {
      setNavAdminErr('비밀번호가 올바르지 않습니다.')
    }
  }

  const handleLogout = () => {
    setCurrentUser(null); setAdminAuth(false); setPage('login')
    setSessionWarn(false); clearSession()
  }

  if (!employees || !apps || !settings) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--color-text-secondary)', fontSize: 14 }}>
      로딩 중…
    </div>
  )

  const sharedProps = { employees, saveEmp, setPage, loginUser, loginAdmin }

  if (page === 'login') return <LoginPage {...sharedProps} />
  if (!currentUser && !adminAuth) return <LoginPage {...sharedProps} />

  const navItems = adminAuth
    ? []
    : [{ id: 'home', label: '홈' }, { id: 'apply', label: '예약 신청' }, { id: 'status', label: '내 신청 현황' }]

  const ctx = {
    currentUser, employees, apps, settings, fundUsed,
    saveEmp, saveApps, saveSettings, saveFundUsed,
    setPage, adminAuth, setAdminAuth,
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background-tertiary)', fontFamily: 'var(--font-sans)' }}>
      <h1 className="sr-only">안전보건공단 발전기금 휴양소 예약 시스템</h1>

      {/* 세션 만료 경고 배너 */}
      {sessionWarn && (
        <div style={{ background: 'var(--color-background-warning)', borderBottom: '0.5px solid var(--color-border-warning)', padding: '8px 20px', fontSize: 13, color: 'var(--color-text-warning)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>세션이 곧 만료됩니다. 계속 사용하시려면 화면을 클릭해주세요.</span>
          <button onClick={() => { touchSession(); setSessionWarn(false) }}
            style={{ background: 'none', border: '0.5px solid var(--color-text-warning)', borderRadius: 4, padding: '3px 10px', fontSize: 12, color: 'var(--color-text-warning)', cursor: 'pointer' }}>
            연장
          </button>
        </div>
      )}

      <nav style={{ background: 'var(--color-background-primary)', borderBottom: '0.5px solid var(--color-border-tertiary)', padding: '0 20px', display: 'flex', alignItems: 'center', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ padding: '8px 16px 8px 0', borderRight: '0.5px solid var(--color-border-tertiary)', marginRight: 12 }}>
          <KoshaLogo compact onClick={handleNavLogoClick} style={{ cursor: 'pointer', userSelect: 'none' }} />
        </div>
        {navItems.map(n => (
          <button key={n.id} onClick={() => setPage(n.id)}
            style={{ background: 'none', border: 'none', padding: '14px 14px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)', color: page === n.id ? 'var(--color-text-info)' : 'var(--color-text-secondary)', borderBottom: page === n.id ? '2px solid var(--color-text-info)' : '2px solid transparent', fontWeight: page === n.id ? 500 : 400 }}>
            {n.label}
          </button>
        ))}
        {adminAuth && (
          <button onClick={() => setPage('admin')}
            style={{ background: 'none', border: 'none', padding: '14px 14px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-sans)', color: page === 'admin' ? 'var(--color-text-info)' : 'var(--color-text-secondary)', borderBottom: page === 'admin' ? '2px solid var(--color-text-info)' : '2px solid transparent', fontWeight: page === 'admin' ? 500 : 400 }}>
            관리자
          </button>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{adminAuth ? '관리자' : currentUser?.empId}</span>
          <Btn onClick={handleLogout} style={{ fontSize: 12, padding: '5px 12px' }}>로그아웃</Btn>
        </div>
      </nav>

      <main style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px 80px' }}>
        {page === 'home'   && <HomePage    {...ctx} />}
        {page === 'apply'  && <ApplyPage   {...ctx} />}
        {page === 'status' && <StatusPage  {...ctx} />}
        {page === 'admin'  && <AdminLayout {...ctx} />}
      </main>

      {/* 네비게이션 로고 5-click 관리자 진입 모달 */}
      {showNavAdminModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowNavAdminModal(false); setNavAdminPw(''); setNavAdminErr('') } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
        >
          <div style={{ background: 'var(--color-background-primary)', borderRadius: 'var(--border-radius-lg)', padding: '28px 28px 24px', width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', fontFamily: 'var(--font-sans)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500 }}>관리자 로그인</h3>
              <button onClick={() => { setShowNavAdminModal(false); setNavAdminPw(''); setNavAdminErr('') }}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--color-text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            {navAdminErr && (
              <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-sm)', padding: '8px 12px', marginBottom: 12, fontSize: 13, color: 'var(--color-text-danger)' }}>
                {navAdminErr}
              </div>
            )}
            <input
              type="password"
              value={navAdminPw}
              onChange={e => { setNavAdminPw(e.target.value); setNavAdminErr('') }}
              onKeyDown={e => e.key === 'Enter' && confirmNavAdmin()}
              placeholder="관리자 비밀번호"
              style={{ width: '100%', marginBottom: 14 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" fullWidth onClick={confirmNavAdmin}>확인</Btn>
              <Btn fullWidth onClick={() => { setShowNavAdminModal(false); setNavAdminPw(''); setNavAdminErr('') }}>취소</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
