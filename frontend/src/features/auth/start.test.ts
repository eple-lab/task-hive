/**
 * 시작 화면의 손님 시작 흐름 테스트 (화면을 그리지 않고 논리만 본다).
 * - 이름 검사(cleanGuestName)
 * - 가짜 서버로: 처음엔 mode 'none' -> 이름으로 시작하면 'guest' -> 저장소가 me 를 받는다 -> 나가면 다시 'none'
 */
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../shared/api/mock';
import { initialState, reducer } from '../../shared/state/store';
import { cleanGuestName, NAME_MAX } from './name';

describe('cleanGuestName', () => {
  it('공백을 지우고 통과시킨다', () => {
    expect(cleanGuestName('  꿀벌  ')).toBe('꿀벌');
  });
  it('빈 이름과 공백뿐인 이름은 거절한다', () => {
    expect(cleanGuestName('')).toBeNull();
    expect(cleanGuestName('   ')).toBeNull();
  });
  it('제어 문자는 빼고, 너무 길면 거절한다', () => {
    expect(cleanGuestName('a\u0000b')).toBe('ab');
    expect(cleanGuestName('가'.repeat(NAME_MAX))).not.toBeNull();
    expect(cleanGuestName('가'.repeat(NAME_MAX + 1))).toBeNull();
  });
});

describe('손님 시작 흐름 (가짜 서버)', () => {
  it('none -> guest -> (나가기) -> none', async () => {
    expect((await mockApi.me()).mode).toBe('none');

    const me = await mockApi.guest('꿀벌');
    expect(me.mode).toBe('guest');
    expect(me.name).toBe('꿀벌');

    // 저장소가 응답을 받으면 App 이 본 화면으로 바꾼다.
    const s = reducer(initialState(), { type: 'boot_ok', me });
    expect(s.me?.mode).toBe('guest');

    await mockApi.logout();
    expect((await mockApi.me()).mode).toBe('none');
    // 나가기 뒤 저장소를 비워도 화면 설정은 남는다.
    const cleared = reducer({ ...s, messages: [{ id: 1, role: 'user', content: 'x' }] }, { type: 'reset' });
    expect(cleared.me).toBeNull();
    expect(cleared.messages).toHaveLength(0);
  });
});
