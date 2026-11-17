/**
 * 오른쪽 상태창 (docs/04 5장). 위에서 아래로 구역을 쌓고, 각 구역은 접을 수 있다.
 *
 * 순서: 연결 → 후보 → 하이브 등록 예정 → (구글 기능 안내) → 목소리 설정 → 대화 설정 → 도시
 *
 * 구글 기능(캘린더·일기 구글 저장·태스크 시트)은 2단계다. google_available 이 false 인 동안은
 * 안내 한 줄만 보이고 토글·권한 요청은 만들지 않는다(D-16, D-28). 언어(5.9)는 다른 언어가 준비되기 전이라 두지 않는다.
 */
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { CandidatesSection } from './CandidatesSection';
import { CitySection } from './CitySection';
import { ConnectSection } from './ConnectSection';
import { LlmSection } from './LlmSection';
import { PendingSection } from './PendingSection';
import { VoiceSection } from './VoiceSection';

export function StatusPanel() {
  const { state } = useStore();
  const googleAvailable = state.me?.google_available === true;

  return (
    <section className="statuspanel" aria-label={t.panel.title}>
      <h2 className="statuspanel__title">{t.panel.title}</h2>
      <ConnectSection />
      <CandidatesSection />
      <PendingSection />
      {googleAvailable ? null : (
        <p className="help statuspanel__google">
          <strong>{t.panel.google.title}</strong> {t.panel.google.soon}
        </p>
      )}
      <VoiceSection />
      <LlmSection />
      <CitySection />
    </section>
  );
}
