import { useState } from 'react'
import { Alert } from '../components/UI'
import ApprovalTab  from './ApprovalTab'
import LotteryTab   from './LotteryTab'
import PeriodTab    from './PeriodTab'
import FundTab      from './FundTab'
import RoomsTab     from './RoomsTab'
import AppListTab   from './AppListTab'
import EmailTab     from './EmailTab'
import AccountsTab  from './AccountsTab'

export default function AdminLayout({ employees, apps, settings, fundUsed, saveEmp, saveApps, saveSettings, saveFundUsed, adminAuth }) {
  const pendingCnt = Object.values(employees).filter(e => e.status === 'pending').length
  const [tab, setTab] = useState(pendingCnt > 0 ? 'approval' : 'lottery')

  if (!adminAuth) return <Alert type="danger">관리자 권한이 없습니다.</Alert>

  const TABS = [
    { id: 'approval', label: '가입 승인',    badge: pendingCnt },
    { id: 'lottery',  label: '추첨 실행'     },
    { id: 'period',   label: '신청 기간·인원' },
    { id: 'fund',     label: '발전기금 현황'  },
    { id: 'rooms',    label: '객실 설정'      },
    { id: 'applist',  label: '신청인 현황'    },
    { id: 'email',    label: '메일 발송'      },
    { id: 'accounts', label: '계정 관리'      },
  ]

  const ctx = { employees, apps, settings, fundUsed, saveEmp, saveApps, saveSettings, saveFundUsed }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 18 }}>관리자 대시보드</h2>

      {/* 탭 네비게이션 */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 22, borderBottom: '0.5px solid var(--color-border-tertiary)', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: 'none', border: 'none', padding: '9px 13px', fontSize: 12,
              cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
              color:        tab === t.id ? 'var(--color-text-info)'                           : 'var(--color-text-secondary)',
              borderBottom: tab === t.id ? '2px solid var(--color-text-info)'                 : '2px solid transparent',
              fontWeight:   tab === t.id ? 500                                                : 400,
              fontFamily:   'var(--font-sans)',
            }}>
            {t.label}
            {t.badge > 0 && (
              <span style={{ background: 'var(--color-background-danger)', color: 'var(--color-text-danger)', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {tab === 'approval' && <ApprovalTab  {...ctx} />}
      {tab === 'lottery'  && <LotteryTab   {...ctx} />}
      {tab === 'period'   && <PeriodTab    {...ctx} />}
      {tab === 'fund'     && <FundTab      {...ctx} />}
      {tab === 'rooms'    && <RoomsTab     {...ctx} />}
      {tab === 'applist'  && <AppListTab   {...ctx} />}
      {tab === 'email'    && <EmailTab     {...ctx} />}
      {tab === 'accounts' && <AccountsTab  {...ctx} />}
    </div>
  )
}
