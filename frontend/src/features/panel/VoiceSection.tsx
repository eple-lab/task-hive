/**
 * 상태창 "목소리 설정" 구역 (docs/04 5.6). 처음에는 접혀 있다.
 *
 * 필드는 서버 계약(docs/11-api-contract.md `settings.voice`)과 같은 이름을 쓴다:
 * enabled, gender, voice, rate, pitch, volume, echo, sentence_stream, stop_on_typing.
 *
 * 동작
 * - 값을 바꾸면 화면 상태(state.voice)를 먼저 바꾸고(바로 들리게), 서버에는 "바꾼 필드만" 0.5초 모아 PUT /api/settings 로 보낸다.
 * - voice(목소리)는 이 기기(브라우저)의 speechSynthesis 한국어 음성 중에서 고른다. 기기마다 목록이 다르다.
 * - echo(에코)는 브라우저 내장 음성에 걸 수 없어 막아 둔다(D-03). Colab TTS 가 붙으면 연다.
 * - "들어 보기"는 말하기가 꺼져 있어도 지금 설정으로 한 문장을 읽는다.
 * - 분위기 프리셋(속도·음높이·볼륨을 한 번에)과 "기본값으로"를 둔다.
 */
import { t } from '../../shared/i18n/ko';
import type { VoiceSettings } from '../../shared/api/types';
import { DEFAULT_VOICE, useStore } from '../../shared/state/store';
import { Button, Collapsible, Slider, Toggle } from '../../shared/ui/controls';
import { VOICE_PRESETS, speechSupported } from '../voice/speech';
import { useSpeaker, useVoices } from '../voice/useVoice';
import { koreanVoices } from './logic';
import { useSettingsSave } from './useSettingsSave';

export function VoiceSection() {
  const { state, dispatch } = useStore();
  const v = state.voice;
  const speaker = useSpeaker();
  const voices = koreanVoices(useVoices());
  const { saveDebounced, error } = useSettingsSave();
  const supported = speechSupported();

  /** 화면 값을 바로 바꾸고, 바꾼 필드만 서버에 저장한다. */
  const change = (patch: Partial<VoiceSettings>) => {
    dispatch({ type: 'set_voice', patch });
    saveDebounced({ voice: patch });
  };

  return (
    <Collapsible title={t.panel.voice.title} defaultOpen={false}>
      {!supported ? <p className="help">{t.panel.voice.unsupported}</p> : null}

      <Toggle checked={v.enabled} label={t.panel.voice.enabled} onChange={(enabled) => change({ enabled })} />

      <fieldset className="field-group">
        <legend>{t.panel.voice.gender}</legend>
        {(['female', 'male'] as const).map((g) => (
          <label key={g} className="radio">
            <input type="radio" name="voice-gender" checked={v.gender === g} onChange={() => change({ gender: g })} />
            {g === 'female' ? t.panel.voice.female : t.panel.voice.male}
          </label>
        ))}
      </fieldset>

      <label className="field">
        <span>{t.panel.voice.voice}</span>
        <select
          value={v.voice ?? ''}
          disabled={voices.length === 0}
          onChange={(e) => change({ voice: e.target.value === '' ? null : e.target.value })}
        >
          <option value="">{t.panel.voice.auto}</option>
          {voices.map((x) => (
            <option key={x.voiceURI} value={x.voiceURI}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {supported && voices.length === 0 ? <p className="help">{t.panel.voice.noKorean}</p> : null}

      <div className="preset-row" role="group" aria-label={t.panel.voice.presets}>
        <Button small onClick={() => change(VOICE_PRESETS.calm)}>
          {t.panel.voice.presetCalm}
        </Button>
        <Button small onClick={() => change(VOICE_PRESETS.clear)}>
          {t.panel.voice.presetClear}
        </Button>
        <Button small onClick={() => change(VOICE_PRESETS.whisper)}>
          {t.panel.voice.presetWhisper}
        </Button>
      </div>

      <Slider label={t.panel.voice.rate} value={v.rate} min={0.5} max={2} step={0.05} onChange={(rate) => change({ rate })} />
      <Slider
        label={t.panel.voice.pitch}
        value={v.pitch}
        min={0}
        max={2}
        step={0.05}
        help={t.panel.voice.pitchHelp}
        onChange={(pitch) => change({ pitch })}
      />
      <Slider label={t.panel.voice.volume} value={v.volume} min={0} max={1} step={0.05} onChange={(volume) => change({ volume })} />
      {/* 에코: 브라우저 내장 음성에는 걸 수 없다. 값은 보여 주되 못 바꾸게 한다. */}
      <Slider
        label={t.panel.voice.echo}
        value={v.echo}
        min={0}
        max={1}
        step={0.05}
        disabled
        display={t.panel.voice.echoSoon}
        help={t.panel.voice.echoHelp}
        onChange={() => undefined}
      />

      <div className="field-stack">
        <Toggle
          checked={v.sentence_stream}
          label={t.panel.voice.sentence}
          onChange={(sentence_stream) => change({ sentence_stream })}
        />
        <Toggle
          checked={v.stop_on_typing}
          label={t.panel.voice.stopOnTyping}
          onChange={(stop_on_typing) => change({ stop_on_typing })}
        />
      </div>

      <div className="preset-row">
        <Button small variant="primary" disabled={!supported} onClick={() => speaker.preview(t.panel.voice.previewText)}>
          {t.panel.voice.preview}
        </Button>
        <Button small variant="ghost" onClick={() => change({ ...DEFAULT_VOICE })}>
          {t.panel.voice.reset}
        </Button>
      </div>

      {error ? (
        <p className="error" role="alert">
          {t.panel.saveFailed} {error}
        </p>
      ) : null}
    </Collapsible>
  );
}
