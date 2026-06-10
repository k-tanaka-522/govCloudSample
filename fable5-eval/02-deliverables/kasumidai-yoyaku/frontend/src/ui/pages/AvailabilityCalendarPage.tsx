import { useEffect, useState } from 'react';
import { getMonthlySlots, statusLabel } from '../../application/availabilityService';
import type { AvailabilitySlot } from '../../application/availabilityService';

const DEFAULT_FACILITY_ID = 1;
const DEFAULT_MONTH = '2026-07';

/**
 * 空き状況カレンダー(SC-U03。REQ-006)。未ログインで全操作可。
 * 空き=○/予約済み=×/休館=−/優先枠=◆をアイコン+テキスト併記
 * (色のみに依存しない=REQ-014 AA。KSM-DDD-001 §1.5)。
 */
export const AvailabilityCalendarPage = () => {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [month, setMonth] = useState(DEFAULT_MONTH);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMonthlySlots(DEFAULT_FACILITY_ID, month)
      .then((result) => {
        if (!cancelled) {
          setSlots(result);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('空き状況を取得できませんでした。時間をおいて再度お試しください。');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  return (
    <section aria-labelledby="calendar-heading">
      <h2 id="calendar-heading">空き状況カレンダー</h2>
      <label>
        表示する年月
        <input
          type="month"
          value={month}
          onChange={(event) => {
            setMonth(event.target.value);
          }}
        />
      </label>
      {error !== null && <p role="alert">{error}</p>}
      <table>
        <caption>市民体育館の空き状況(60秒ごとに更新)</caption>
        <thead>
          <tr>
            <th scope="col">利用日</th>
            <th scope="col">面・室</th>
            <th scope="col">コマ</th>
            <th scope="col">状態</th>
          </tr>
        </thead>
        <tbody>
          {slots.map((slot) => {
            const label = statusLabel(slot.status);
            return (
              <tr key={`${String(slot.unitId)}-${slot.useDate}-${String(slot.slotId)}`}>
                <td>{slot.useDate}</td>
                <td>{String(slot.unitId)}</td>
                <td>{String(slot.slotId)}</td>
                <td>
                  <span aria-hidden="true">{label.mark}</span> {label.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
