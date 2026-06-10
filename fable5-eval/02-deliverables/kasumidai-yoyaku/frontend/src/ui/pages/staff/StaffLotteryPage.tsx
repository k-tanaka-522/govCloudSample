import { useState } from 'react';
import { runLottery } from '../../../application/lotteryAdminService';
import type { LotteryExecutionSummary } from '../../../application/lotteryAdminService';

/**
 * 抽選管理(SC-S09。REQ-008。所管課ロール以上・/staff経路=IP制限+MFA)。
 * 通常の抽選実行はJB-01バッチ(毎月8日6:00)。本画面はバッチ失敗時の再実行
 * (QA No.14回答のP6運用手順と連動)と結果サマリ確認用。
 * 1業務1画面・操作ヒント常設(NFR-C06=KSM-DDD-001 §1.1方針3)。
 */
export const StaffLotteryPage = () => {
  const [periodId, setPeriodId] = useState('');
  const [summary, setSummary] = useState<LotteryExecutionSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const execute = async () => {
    try {
      setSummary(await runLottery(Number(periodId)));
      setMessage('抽選を実行しました。当落通知は順次送信されます。');
    } catch {
      setSummary(null);
      setMessage('実行できませんでした。実行済みの期間か、申込締切前の可能性があります。');
    }
  };

  return (
    <section aria-labelledby="lottery-heading">
      <h2 id="lottery-heading">抽選管理(職員)</h2>
      <p>
        操作ヒント:抽選は通常、毎月8日 6:00 に自動実行されます。この画面からの実行は
        自動実行が失敗した場合の再実行に使用してください(実行済みの期間は再実行できません)。
      </p>
      <label>
        抽選期間ID
        <input
          type="text"
          inputMode="numeric"
          value={periodId}
          onChange={(event) => {
            setPeriodId(event.target.value);
          }}
        />
      </label>
      <button
        type="button"
        onClick={() => {
          void execute();
        }}
        disabled={periodId === ''}
      >
        抽選を実行
      </button>
      {message !== null && <p role="status">{message}</p>}
      {summary !== null && (
        <dl>
          <dt>申込数</dt>
          <dd>{String(summary.entryCount)}件</dd>
          <dt>当選</dt>
          <dd>{String(summary.wonCount)}件</dd>
          <dt>落選</dt>
          <dd>{String(summary.lostCount)}件(落選順位は繰上げ操作で使用)</dd>
        </dl>
      )}
    </section>
  );
};
