/**
 * 작은 공용 부품: 버튼, 토글, 접는 구역, 슬라이더.
 *
 * 왜 직접 만들었나: UI 라이브러리를 더하지 않기 위해서다(의존성 최소화, docs/10-frontend-architecture.md).
 * 접근성: 진짜 <button>, <input> 요소를 쓰고 aria 속성을 붙여 키보드와 화면 낭독기로 쓸 수 있게 한다.
 */
import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** primary = 강조 버튼, ghost = 테두리 없는 버튼, danger = 지우기 */
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  small?: boolean;
};

export function Button({ variant = 'default', small, className, type, ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, small ? 'btn--small' : '', className ?? ''].filter(Boolean).join(' ');
  // type 을 안 주면 폼 안에서 제출 버튼이 되어 버리므로 기본을 button 으로 둔다.
  return <button type={type ?? 'button'} className={cls} {...rest} />;
}

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  /** 아직 묻지 않아 "켜진 모습"으로만 보이는 상태(D-16) */
  tentative?: boolean;
}

/** 켜고 끄는 스위치. role="switch" 로 화면 낭독기가 상태를 읽는다. */
export function Toggle({ checked, onChange, label, disabled, tentative }: ToggleProps) {
  return (
    <label className={`toggle${disabled ? ' toggle--disabled' : ''}${tentative ? ' toggle--tentative' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
      <span className="toggle__label">{label}</span>
    </label>
  );
}

interface CollapsibleProps {
  title: string;
  /** 처음에 펴져 있는가 */
  defaultOpen?: boolean;
  /** 제목 옆 숫자 배지 */
  badge?: number;
  children: ReactNode;
}

/** 제목을 누르면 통째로 접히거나 펴지는 구역(R-PANEL-4). */
export function Collapsible({ title, defaultOpen = true, badge, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className={`section${open ? ' section--open' : ''}`}>
      <h3 className="section__head">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
          <span className="section__caret" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span>{title}</span>
          {badge ? <span className="badge">{badge}</span> : null}
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="section__body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  help?: string;
  disabled?: boolean;
  /** 오른쪽에 보일 값 글자. 안 주면 숫자 그대로 */
  display?: string;
}

/** 이름·값·설명이 붙은 슬라이더(캡처의 "온도", "저음" 모양). */
export function Slider({ label, value, min, max, step, onChange, help, disabled, display }: SliderProps) {
  const id = useId();
  return (
    <div className={`slider${disabled ? ' slider--disabled' : ''}`}>
      <div className="slider__row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{display ?? String(value)}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {help ? <p className="help">{help}</p> : null}
    </div>
  );
}
