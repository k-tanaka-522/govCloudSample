import { useState } from 'react';
import {
  cancelReservation,
  cancellationRuleDescription,
  formatYen,
  previewCancellation,
} from '../../application/reservationService';
import type { CancellationInfo } from '../../application/reservationService';

/**
 * マイページ・予約取消(SC-U07/SC-U10。REQ-011/019)。
 * 取消期限・キャンセル料・還付見込額を事前表示してから取消を確定する
 * (QA No.11確定値:7日前まで無料/6日前以降100%)。
 */
export const MyReservationsPage = () => {
  const [reservationId, setReservationId] = useState('');
  const [preview, setPreview] = useState<CancellationInfo | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPreview = async () => {
    try {
      setPreview(await previewCancellation(Number(reservationId)));
      setMessage(null);
    } catch {
      setPreview(null);
      setMessage('予約が見つからないか、取消できない状態です。');
    }
  };

  const confirmCancel = async () => {
    try {
      const result = await cancelReservation(Number(reservationId));
      setPreview(result);
      setMessage('取消が完了しました。還付がある場合は後日処理されます。');
    } catch {
      setMessage('取消に失敗しました。時間をおいて再度お試しください。');
    }
  };

  return (
    <section aria-labelledby="mypage-heading">
      <h2 id="mypage-heading">予約の取消</h2>
      <p>{cancellationRuleDescription()}</p>
      <label>
        予約番号
        <input
          type="text"
          inputMode="numeric"
          value={reservationId}
          onChange={(event) => {
            setReservationId(event.target.value);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void loadPreview();
        }}
        disabled={reservationId === ''}
      >
        取消内容を確認
      </button>
      {message !== null && <p role="status">{message}</p>}
      {preview !== null && (
        <div>
          <h3>取消内容の確認</h3>
          <dl>
            <dt>無料取消期限</dt>
            <dd>{preview.freeCancelDeadline} まで</dd>
            <dt>キャンセル料</dt>
            <dd>{formatYen(preview.cancellationCharge)}</dd>
            <dt>還付見込額</dt>
            <dd>{formatYen(preview.expectedRefund)}</dd>
          </dl>
          {!preview.cancelled && (
            <button
              type="button"
              onClick={() => {
                void confirmCancel();
              }}
            >
              取消を確定する
            </button>
          )}
        </div>
      )}
    </section>
  );
};
