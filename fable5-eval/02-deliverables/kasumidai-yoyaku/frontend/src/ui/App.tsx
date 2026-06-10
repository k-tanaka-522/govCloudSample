import { useState } from 'react';
import { AvailabilityCalendarPage } from './pages/AvailabilityCalendarPage';
import { MyReservationsPage } from './pages/MyReservationsPage';
import { ReservationWizardPage } from './pages/ReservationWizardPage';
import { StaffLotteryPage } from './pages/staff/StaffLotteryPage';

type PageKey = 'calendar' | 'reserve' | 'mypage' | 'staffLottery';

const PAGES: { key: PageKey; label: string }[] = [
  { key: 'calendar', label: '空き状況(SC-U03)' },
  { key: 'reserve', label: '予約申込(SC-U08)' },
  { key: 'mypage', label: 'マイページ・取消(SC-U07/U10)' },
  { key: 'staffLottery', label: '【職員】抽選管理(SC-S09)' },
];

/**
 * 画面切替(P4実装範囲の4画面)。スマートフォンファースト(REQ-013)・
 * キーボード操作完結・aria-current によるナビゲーション(REQ-014 AA)。
 */
export const App = () => {
  const [page, setPage] = useState<PageKey>('calendar');

  return (
    <div lang="ja">
      <header>
        <h1>霞台市公共施設予約システム</h1>
        <nav aria-label="主要画面">
          <ul>
            {PAGES.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  aria-current={page === item.key ? 'page' : undefined}
                  onClick={() => {
                    setPage(item.key);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        {page === 'calendar' && <AvailabilityCalendarPage />}
        {page === 'reserve' && <ReservationWizardPage />}
        {page === 'mypage' && <MyReservationsPage />}
        {page === 'staffLottery' && <StaffLotteryPage />}
      </main>
    </div>
  );
};
