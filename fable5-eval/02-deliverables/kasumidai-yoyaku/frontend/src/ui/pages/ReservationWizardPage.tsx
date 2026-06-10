import { useState } from 'react';
import {
  cancellationRuleDescription,
  formatYen,
  precheckSelection,
  reserve,
} from '../../application/reservationService';
import type { ReservationResult, SlotSelection } from '../../application/reservationService';

const DEFAULT_FACILITY_ID = 1;
const SLOT_NAMES: Record<number, string> = { 1: '午前', 2: '午後', 3: '夜間' };

/**
 * 先着予約申込ウィザード(SC-U08。REQ-007/009/010/015)。
 * 選択→確認→完了の3ステップ。確認画面で料金内訳・取消規則を明示し、
 * 二重送信は冪等キーで防止(KSM-DDD-001 §1.5/§4.4)。
 */
export const ReservationWizardPage = () => {
  const [slots, setSlots] = useState<SlotSelection[]>([]);
  const [result, setResult] = useState<ReservationResult | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const addSlot = (slot: SlotSelection) => {
    setSlots((current) => [...current, slot]);
    setMessages([]);
  };

  const goConfirm = () => {
    const errors = precheckSelection(slots);
    setMessages(errors);
    setConfirming(errors.length === 0);
  };

  const submit = async () => {
    try {
      setResult(await reserve(DEFAULT_FACILITY_ID, 'バドミントン練習', slots));
      setMessages([]);
    } catch (cause) {
      setMessages([cause instanceof Error ? cause.message : '申込に失敗しました。']);
    }
  };

  if (result !== null) {
    return <CompletionStep result={result} />;
  }
  return (
    <section aria-labelledby="wizard-heading">
      <h2 id="wizard-heading">先着予約申込</h2>
      {messages.length > 0 && (
        <ul role="alert">
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      {confirming ? (
        <ConfirmStep
          slots={slots}
          onBack={() => {
            setConfirming(false);
          }}
          onSubmit={() => {
            void submit();
          }}
        />
      ) : (
        <SelectStep slots={slots} onAdd={addSlot} onNext={goConfirm} />
      )}
    </section>
  );
};

const SelectStep = (props: {
  slots: SlotSelection[];
  onAdd: (slot: SlotSelection) => void;
  onNext: () => void;
}) => {
  const [useDate, setUseDate] = useState('2026-07-04');
  const [slotId, setSlotId] = useState(1);

  return (
    <div>
      <h3>1. コマの選択(連続・複数日の一括予約に対応)</h3>
      <label>
        利用日
        <input
          type="date"
          value={useDate}
          onChange={(event) => {
            setUseDate(event.target.value);
          }}
        />
      </label>
      <label>
        コマ
        <select
          value={slotId}
          onChange={(event) => {
            setSlotId(Number(event.target.value));
          }}
        >
          {Object.entries(SLOT_NAMES).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          props.onAdd({ unitId: 1, useDate, slotId });
        }}
      >
        コマを追加
      </button>
      <h4>選択中のコマ({String(props.slots.length)}件)</h4>
      <ul>
        {props.slots.map((slot) => (
          <li key={`${slot.useDate}-${String(slot.slotId)}`}>
            {slot.useDate} {SLOT_NAMES[slot.slotId] ?? String(slot.slotId)}
          </li>
        ))}
      </ul>
      <button type="button" onClick={props.onNext} disabled={props.slots.length === 0}>
        確認へ進む
      </button>
    </div>
  );
};

const ConfirmStep = (props: {
  slots: SlotSelection[];
  onBack: () => void;
  onSubmit: () => void;
}) => (
  <div>
    <h3>2. 申込内容の確認</h3>
    <p>
      選択した{String(props.slots.length)}コマは
      <strong>全件成立または全件不成立</strong>
      で処理されます(一部のみの自動確定は行いません)。
    </p>
    <p>{cancellationRuleDescription()}</p>
    <button type="button" onClick={props.onBack}>
      選択に戻る
    </button>
    <button type="button" onClick={props.onSubmit}>
      この内容で申し込む
    </button>
  </div>
);

const CompletionStep = (props: { result: ReservationResult }) => (
  <div>
    <h3>3. 申込完了</h3>
    <p role="status">予約番号 {String(props.result.reservationId)} で受け付けました。</p>
    <dl>
      <dt>基本料金</dt>
      <dd>{formatYen(props.result.billing.baseAmount)}</dd>
      <dt>設備料金</dt>
      <dd>{formatYen(props.result.billing.equipmentAmount)}</dd>
      <dt>減免額</dt>
      <dd>{formatYen(props.result.billing.exemptionAmount)}</dd>
      <dt>請求額</dt>
      <dd>{formatYen(props.result.billing.billedAmount)}</dd>
      <dt>支払期限</dt>
      <dd>{props.result.billing.dueAt}</dd>
      <dt>支払方法</dt>
      <dd>{props.result.paymentMethods.join('・')}</dd>
    </dl>
  </div>
);
