/**
 * 상태창 로직 테스트 (화면을 그리지 않고 논리만 본다). 기대 결과를 먼저 주석으로 적는다.
 *
 * - 후보 담기·빼기·고치기·옮기기의 상태 변화 (store reducer)
 * - 연결 입력 검사, 연결 성공/실패(400·502) 메시지 처리 (가짜 서버)
 * - 하이브로 옮기기: 성공 시 칸 생성, 제목 중복·벌집 꽉 참(409) 메시지, 제목 공백
 * - 설정 patch 합치기, 바뀐 필드만 뽑기, 한국어 음성 고르기
 */
import { describe, expect, it } from 'vitest';
import { mockApi } from '../../shared/api/mock';
import { initialState, reducer, type LocalCandidate, type State } from '../../shared/state/store';
import {
  changedFields,
  connectUpstream,
  errorMessage,
  koreanVoices,
  movePending,
  toBulkItems,
  validateConnectInput,
} from './logic';
import { mergePatch } from './useSettingsSave';

function cand(title: string, extra: Partial<LocalCandidate> = {}): LocalCandidate {
  return { localId: 1, title, due_date: null, subtasks: [], evidence: '근거', confidence: 0.7, source: 'chat', ...extra };
}

/** 후보 두 개가 들어 있는 시작 상태 */
function withCandidates(): State {
  return reducer(initialState(), {
    type: 'add_candidates',
    items: [
      { title: '장 보기', due_date: null, subtasks: ['우유'], evidence: '장을 봐야 해', confidence: 0.8, source: 'chat' },
      { title: '빨래', due_date: null, subtasks: [], evidence: '빨래도', confidence: 0.6, source: 'chat' },
    ],
  });
}

describe('후보 → 등록 예정 상태 변화', () => {
  it('기대: 담으면 후보에서 사라지고 등록 예정에 생긴다', () => {
    const s0 = withCandidates();
    expect(s0.candidates).toHaveLength(2);
    const id = s0.candidates[0]!.localId;
    const s1 = reducer(s0, { type: 'candidate_to_pending', localId: id });
    expect(s1.candidates.map((c) => c.title)).toEqual(['빨래']);
    expect(s1.pending.map((c) => c.title)).toEqual(['장 보기']);
  });

  it('기대: 빼기는 후보에서만 지우고 등록 예정은 건드리지 않는다', () => {
    const s0 = withCandidates();
    const s1 = reducer(s0, { type: 'remove_candidate', localId: s0.candidates[1]!.localId });
    expect(s1.candidates).toHaveLength(1);
    expect(s1.pending).toHaveLength(0);
  });

  it('기대: 등록 예정에서 제목을 고치고, 빼면 사라진다', () => {
    let s = withCandidates();
    s = reducer(s, { type: 'candidate_to_pending', localId: s.candidates[0]!.localId });
    const pid = s.pending[0]!.localId;
    s = reducer(s, { type: 'update_pending', localId: pid, patch: { title: '시장 가기' } });
    expect(s.pending[0]!.title).toBe('시장 가기');
    s = reducer(s, { type: 'remove_pending', localId: pid });
    expect(s.pending).toHaveLength(0);
  });

  it('기대: 이미 등록 예정에 있는 제목은 후보로 다시 들어오지 않는다', () => {
    let s = withCandidates();
    s = reducer(s, { type: 'candidate_to_pending', localId: s.candidates[0]!.localId });
    s = reducer(s, {
      type: 'add_candidates',
      items: [{ title: ' 장 보기 ', due_date: null, subtasks: [], evidence: '', confidence: 0.5, source: 'chat' }],
    });
    expect(s.candidates.map((c) => c.title)).toEqual(['빨래']);
  });
});

describe('연결 입력 검사와 오류 메시지', () => {
  it('기대: 빈 주소·빈 키는 서버에 보내기 전에 거절한다', () => {
    expect(validateConnectInput('', 'k')).toMatch(/주소/);
    expect(validateConnectInput('https://a.ngrok-free.app', '  ')).toMatch(/키/);
    expect(validateConnectInput('https://a.ngrok-free.app', 'k')).toBeNull();
  });

  it('기대: 서버 오류(ApiError)는 안내문 그대로, 그 밖의 오류는 일반 문구', async () => {
    const { ApiError } = await import('../../shared/api/client');
    expect(errorMessage(new ApiError(400, 'bad', '주소가 이상해요'))).toBe('주소가 이상해요');
    expect(errorMessage(new Error('내부 스택 정보'))).not.toContain('내부');
  });

  it('기대: 잘못된 주소 → 400 안내문, 키 없이 연결 시도 → 입력 검사 문구 (연결은 안 됨)', async () => {
    const me = await mockApi.guest('꿀벌');
    const bad = await connectUpstream(mockApi, me, 'https://example.com', '키');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).toContain('ngrok');
    const noKey = await connectUpstream(mockApi, me, 'https://abc.ngrok-free.app', '');
    expect(noKey.ok).toBe(false);
    expect((await mockApi.me()).upstream.connected).toBe(false);
  });

  it('기대: 올바른 주소·키 → 연결됨 + 모델 목록 + 지연 시간, 끊으면 다시 연결 안 됨', async () => {
    const me = await mockApi.guest('꿀벌');
    const ok = await connectUpstream(mockApi, me, ' https://abc.ngrok-free.app ', '비밀키');
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.me.upstream.connected).toBe(true);
      expect(ok.me.upstream.models.length).toBeGreaterThan(0);
      expect(ok.latencyMs).toBeGreaterThan(0);
    }
    await mockApi.deleteUpstream();
    expect((await mockApi.me()).upstream.connected).toBe(false);
  });
});

describe('하이브로 옮기기', () => {
  it('기대: 제목을 다듬어 서버 모양으로 바꾼다', () => {
    const items = toBulkItems([cand('  장 보기  ', { due_date: '2026-12-01', subtasks: ['우유'] })]);
    expect(items).toEqual([{ title: '장 보기', due_date: '2026-12-01', subtasks: ['우유'], source: 'chat' }]);
  });

  it('기대: 성공하면 칸 좌표가 있는 태스크가 만들어진다', async () => {
    await mockApi.logout();
    const r = await movePending(mockApi, [cand('옮기기 시험 A'), cand('옮기기 시험 B', { localId: 2 })]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tasks).toHaveLength(2);
      expect(r.tasks.every((x) => x.hex_q !== null && x.hex_r !== null)).toBe(true);
    }
  });

  it('기대: 같은 제목을 또 옮기면 실패하고 서버(409) 안내문이 그대로 나온다', async () => {
    await mockApi.logout();
    await movePending(mockApi, [cand('중복 시험')]);
    const again = await movePending(mockApi, [cand('중복 시험')]);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.message).toContain('중복 시험');
  });

  it('기대: 빈 목록·빈 제목은 서버를 부르지 않고 거절한다', async () => {
    expect((await movePending(mockApi, [])).ok).toBe(false);
    const blank = await movePending(mockApi, [cand('   ')]);
    expect(blank.ok).toBe(false);
  });
});

describe('설정 보조 계산', () => {
  it('기대: 같은 영역의 patch 는 합쳐지고 나중 값이 이긴다', () => {
    const merged = mergePatch({ voice: { rate: 1.2, pitch: 0.9 } }, { voice: { rate: 1.5 }, llm: { max_tokens: 300 } });
    expect(merged).toEqual({ voice: { rate: 1.5, pitch: 0.9 }, llm: { max_tokens: 300 } });
  });

  it('기대: 바뀐 필드만 뽑는다', () => {
    expect(changedFields({ a: 1, b: 2, c: 3 }, { a: 1, b: 5 })).toEqual({ b: 5 });
  });

  it('기대: 한국어 음성만 남는다(ko-KR, ko_KR 모두)', () => {
    const voices = [{ lang: 'en-US' }, { lang: 'ko-KR' }, { lang: 'ko_KR' }, { lang: 'ja-JP' }];
    expect(koreanVoices(voices)).toHaveLength(2);
  });
});


describe('후보 찾는 중 표시(extracting)', () => {
  // 기대: 처음은 idle → start 하면 running → end 하면 idle
  it('시작하면 running, 끝나면 idle', () => {
    let s = initialState();
    expect(s.extracting).toBe('idle');
    s = reducer(s, { type: 'extract_start' });
    expect(s.extracting).toBe('running');
    s = reducer(s, { type: 'extract_end' });
    expect(s.extracting).toBe('idle');
  });

  // 기대: 실패하면 failed(짧은 안내), dismiss 하면 idle. 실패 뒤 새로 시작하면 running 으로 바뀐다.
  it('실패하면 failed, 안내를 닫으면 idle', () => {
    let s = reducer(initialState(), { type: 'extract_start' });
    s = reducer(s, { type: 'extract_fail' });
    expect(s.extracting).toBe('failed');
    s = reducer(s, { type: 'extract_dismiss' });
    expect(s.extracting).toBe('idle');
  });

  // 기대: 실패 안내 타이머가 늦게 와도, 그 사이 새로 시작한 찾기(running)는 지우지 않는다. reset 하면 idle.
  it('늦은 dismiss 는 새 찾기를 지우지 않고, reset 은 idle 로 돌린다', () => {
    let s = reducer(initialState(), { type: 'extract_fail' });
    s = reducer(s, { type: 'extract_start' });
    s = reducer(s, { type: 'extract_dismiss' });
    expect(s.extracting).toBe('running');
    s = reducer(s, { type: 'reset' });
    expect(s.extracting).toBe('idle');
  });
});
