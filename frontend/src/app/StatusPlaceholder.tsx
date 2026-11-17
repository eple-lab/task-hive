/**
 * 오른쪽 상태창 "자리".
 *
 * 상태창(연결·후보·등록 예정·캘린더·일기·설정)은 다음 단계(C-4)에서 features/panel 로 만든다.
 * 그때 Layout.tsx 의 import 한 줄만 바꾸면 된다(이 파일은 지우면 된다).
 */
import { t } from '../shared/i18n/ko';

export function StatusPlaceholder() {
  return (
    <section className="statuspanel" aria-label={t.panel.title}>
      <h2>{t.panel.title}</h2>
      <p className="muted">상태창은 다음 단계에서 만들어요.</p>
    </section>
  );
}
