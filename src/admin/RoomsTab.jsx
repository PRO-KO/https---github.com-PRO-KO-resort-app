import { useState } from 'react'
import { won } from '../constants'
import { Btn, Card, SeasonBadge } from '../components/UI'

export default function RoomsTab({ settings, saveSettings }) {
  const [rooms, setRooms] = useState(JSON.parse(JSON.stringify(settings.rooms)))
  const [saved, setSaved] = useState(false)

  const updRoom  = (idx, k, v)    => setRooms(r => r.map((room, i) => i === idx ? { ...room, [k]: v } : room))
  const updPrice = (idx, season, v) => setRooms(r => r.map((room, i) => i === idx ? { ...room, prices: { ...room.prices, [season]: parseInt(v) || 0 } } : room))

  const save = async () => {
    await saveSettings({ ...settings, rooms })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 18 }}>
        각 객실의 예약 가능 기간, 정원, 발전기금 지원율(%), 요금을 설정합니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 20 }}>
        {rooms.map((room, idx) => (
          <Card key={room.id}>
            <h4 style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{room.name}</h4>

            {/* 기본 정보 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>객실명</label>
                <input value={room.name} onChange={e => updRoom(idx, 'name', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>설명</label>
                <input value={room.desc} onChange={e => updRoom(idx, 'desc', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>정원 (인)</label>
                <input type="number" min={1} value={room.capacity}
                  onChange={e => updRoom(idx, 'capacity', parseInt(e.target.value) || 1)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>최대 숙박 (박)</label>
                <input type="number" min={1} max={7} value={room.maxNights}
                  onChange={e => updRoom(idx, 'maxNights', parseInt(e.target.value) || 1)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>
                  발전기금 지원율 (%)
                </label>
                <input type="number" min={0} max={100} value={room.supportRate}
                  onChange={e => updRoom(idx, 'supportRate', parseInt(e.target.value) || 0)} style={{ width: '100%' }} />
                <p style={{ fontSize: 11, color: 'var(--color-text-info)', marginTop: 4 }}>
                  숙박료의 {room.supportRate}%를 발전기금에서 지원
                </p>
              </div>
            </div>

            {/* 예약 가능 기간 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>예약 가능 시작일</label>
                <input type="date" value={room.availableFrom ?? ''} onChange={e => updRoom(idx, 'availableFrom', e.target.value)} style={{ width: '100%' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 5 }}>예약 가능 종료일</label>
                <input type="date" value={room.availableTo ?? ''} onChange={e => updRoom(idx, 'availableTo', e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>

            {/* 시즌별 요금 */}
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 10 }}>시즌별 1박 요금</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {['비수기', '준성수기', '성수기'].map(s => (
                <div key={s}>
                  <div style={{ marginBottom: 6 }}><SeasonBadge season={s} /></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" value={room.prices[s]}
                      onChange={e => updPrice(idx, s, e.target.value)} style={{ width: '100px' }} />
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>원</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--color-text-info)', marginTop: 4 }}>
                    지원 {won(Math.round(room.prices[s] * room.supportRate / 100))}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <Btn variant="primary" onClick={save}>{saved ? '저장됨 ✓' : '저장'}</Btn>
    </div>
  )
}
