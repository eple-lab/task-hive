/**
 * 상태창 "대화 설정" 구역 (docs/04 5.7). 처음에는 접혀 있다.
 *
 * - 온도(temperature), 최대 토큰(max_tokens): 슬라이더. 범위는 서버(app/routers/settings.py)와 같다.
 *   슬라이더 값은 이 구역 안의 상태로 들고 있다가 0.5초 뒤 서버에 저장한다(응답 순서가 뒤바뀌어 슬라이더가 튀지 않게).
 * - 모델(model): 연결 구역에서 받은 모델 목록에서 고른다. 연결 전에는 고를 수 없다.
 * - 저장한 값은 다음 /api/chat 요청에 실려 간다(useConversation.send 가 me.settings.llm 을 읽는다).
 */
import { useState } from 'react';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Collapsible, Slider } from '../../shared/ui/controls';
import { LLM_LIMITS } from './logic';
import { useSettingsSave } from './useSettingsSave';

export function LlmSection() {
  const { state } = useStore();
  const me = state.me;
  const { save, saveDebounced, error } = useSettingsSave();
  // 슬라이더가 끌리는 동안의 값. 처음 값은 서버가 준 값.
  const [temperature, setTemperature] = useState(me?.settings.llm.temperature ?? 0.6);
  const [maxTokens, setMaxTokens] = useState(me?.settings.llm.max_tokens ?? 400);

  if (!me) return null;
  const models = me.upstream.models;
  const current = me.settings.llm.model;
  // 저장돼 있던 모델이 지금 목록에 없어도(연결을 끊은 뒤 등) 선택값이 사라져 보이지 않게 옵션에 끼워 둔다.
  const options = current && !models.includes(current) ? [current, ...models] : models;

  return (
    <Collapsible title={t.panel.llm.title} defaultOpen={false}>
      <Slider
        label={t.panel.llm.temperature}
        value={temperature}
        {...LLM_LIMITS.temperature}
        help={t.panel.llm.temperatureHelp}
        display={temperature.toFixed(2)}
        onChange={(v) => {
          setTemperature(v);
          saveDebounced({ llm: { temperature: v } });
        }}
      />
      <Slider
        label={t.panel.llm.maxTokens}
        value={maxTokens}
        {...LLM_LIMITS.max_tokens}
        help={t.panel.llm.maxTokensHelp}
        onChange={(v) => {
          setMaxTokens(v);
          saveDebounced({ llm: { max_tokens: v } });
        }}
      />

      <label className="field">
        <span>{t.panel.llm.model}</span>
        <select
          value={current ?? ''}
          disabled={options.length === 0}
          onChange={(e) => void save({ llm: { model: e.target.value === '' ? null : e.target.value } })}
        >
          <option value="">{t.panel.llm.modelAuto}</option>
          {options.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {options.length === 0 ? <p className="help">{t.panel.llm.modelNeedConnect}</p> : null}

      {error ? (
        <p className="error" role="alert">
          {t.panel.saveFailed} {error}
        </p>
      ) : null}
    </Collapsible>
  );
}
