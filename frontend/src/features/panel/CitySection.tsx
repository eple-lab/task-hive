/**
 * 상태창 "도시" 구역 (docs/04 5.8, D-25). 기본은 서울.
 *
 * - 도시를 고르면 PUT /api/settings {city} 로 저장한다. 서버가 목록(CITIES)을 다시 검사한다.
 * - 저장되면 GET /api/greeting 을 한 번 불러, 바뀐 도시의 날씨를 채팅창에 알려 준다.
 *   (첫 인사는 이미 지나갔으므로 "다음 인사부터" 반영되고, 지금은 날씨 한 줄로 확인시켜 준다.)
 * - 브라우저 위치 권한은 쓰지 않는다.
 */
import { api } from '../../shared/api/client';
import { t } from '../../shared/i18n/ko';
import { useStore } from '../../shared/state/store';
import { Collapsible } from '../../shared/ui/controls';
import { CITIES } from './logic';
import { useSettingsSave } from './useSettingsSave';

export function CitySection() {
  const { state, dispatch } = useStore();
  const { save, error } = useSettingsSave();
  const me = state.me;
  if (!me) return null;

  const say = (content: string) => dispatch({ type: 'add_message', message: { role: 'system', content } });

  const change = async (city: string) => {
    if (!(await save({ city }))) return;
    say(t.panel.city.changed(city));
    try {
      const g = await api.greeting();
      if (g.weather) say(`지금 ${g.weather.city}은 ${g.weather.desc}, ${Math.round(g.weather.temp_c)}도예요.`);
    } catch {
      /* 날씨를 못 가져와도 도시 저장은 성공했다. 조용히 넘어간다. */
    }
  };

  // 서버에 목록에 없는 값이 저장돼 있어도 선택값이 사라져 보이지 않게 한다.
  const options: string[] = (CITIES as readonly string[]).includes(me.city) ? [...CITIES] : [me.city, ...CITIES];

  return (
    <Collapsible title={t.panel.city.title} defaultOpen={false}>
      <label className="field">
        <span className="visually-hidden">{t.panel.city.title}</span>
        <select value={me.city} onChange={(e) => void change(e.target.value)}>
          {options.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <p className="help">{t.panel.city.help}</p>
      {error ? (
        <p className="error" role="alert">
          {t.panel.saveFailed} {error}
        </p>
      ) : null}
    </Collapsible>
  );
}
