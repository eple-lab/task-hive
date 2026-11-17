/**
 * 대화의 흐름을 맡는 훅. 채팅창과 상태창이 함께 쓴다.
 *
 * 하는 일
 * - send(): 사용자 말을 보내고, AI 답을 글자 단위로 받아 채팅창에 붙이고, (켜져 있으면) 문장 단위로 읽는다.
 * - 답이 끝나면 /api/extract 로 "할 일 후보"와 "완료 신호"를 받아 처리한다.
 * - runAction(): 말풍선 아래 버튼(되돌리기, 응 다 했어, 연결/나중에 …)을 처리한다.
 * - moveToHive(): 등록 예정 목록을 벌집에 올린다. 성공 응답을 받은 뒤에만 벌 애니메이션을 시작한다.
 * - notify(): 상태창에서 한 일을 채팅창에 남긴다(R-CHAT-5 "모든 대화는 채팅창에 동일하게").
 *
 * 지키는 규칙
 * - D-08: 대화는 브라우저 메모리(store)에만 둔다. 서버에는 요청할 때만 보낸다.
 * - P-06: AI는 "제안"만 한다. 후보는 사용자가 담아야 등록되고, 완료 체크는 서버가 소유를 검사한다.
 * - D-21: "그건 한 것 같아" → 하위 태스크가 없거나 특정 항목이면 바로 체크 + 되돌리기,
 *         하위 태스크가 남은 태스크 전체면 확인받고 체크. 삭제는 대화로 하지 못한다.
 * - D-16: 구글 기능 토글은 켜진 모습으로 보이고 하나씩 "연결할까요?"를 묻는다.
 *         지금은 구글 로그인이 없어(google_available=false) 뼈대만 있다.
 */
import { useCallback, useEffect, useRef } from 'react';
import { ApiError, api } from '../../shared/api/client';
import type { FeatureKey, Features, WireMessage } from '../../shared/api/types';
import { t } from '../../shared/i18n/ko';
import { useStore, type ChatAction, type ChatMessage, type State } from '../../shared/state/store';
import { splitSentences } from '../voice/speech';
import { useSpeaker } from '../voice/useVoice';

/** 서버에 보내는 최근 대화 줄 수. 너무 길면 작은 모델이 느려지고 비용(토큰)이 는다. */
const HISTORY_LIMIT = 20;
/** 할 일 추출에 보내는 최근 대화 줄 수 */
const EXTRACT_LIMIT = 6;
/** 한 번에 처리하는 완료 신호 수. 잘못 알아들었을 때 여러 개가 바뀌는 것을 막는다. */
const MAX_COMPLETIONS = 3;

const FEATURE_ORDER: FeatureKey[] = ['calendar', 'diary_google', 'task_sheet'];
/** 서버 저장이 안 될 때만 쓰는 브라우저 보관 키. 켬/끔 값만 담는다(개인정보 아님). */
const FEATURES_KEY = 'th.features';

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : '문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
}

/** 채팅 기록에서 서버로 보낼 줄만 고른다(시스템 알림·오류·흘러나오는 중인 줄은 뺀다). */
export function toWire(messages: ChatMessage[], limit: number): WireMessage[] {
  const wire: WireMessage[] = [];
  for (const m of messages) {
    if (m.role === 'system' || m.error || m.streaming || !m.content.trim()) continue;
    wire.push({ role: m.role, content: m.content });
  }
  return wire.slice(-limit);
}

function loadLocalFeatures(): Partial<Features> {
  try {
    const raw = window.localStorage.getItem(FEATURES_KEY);
    return raw ? (JSON.parse(raw) as Partial<Features>) : {};
  } catch {
    return {};
  }
}

function saveLocalFeature(key: FeatureKey, value: boolean): void {
  try {
    window.localStorage.setItem(FEATURES_KEY, JSON.stringify({ ...loadLocalFeatures(), [key]: value }));
  } catch {
    /* 저장이 막혀 있으면 이번 화면에서만 기억한다 */
  }
}

export function useConversation() {
  const { state, dispatch } = useStore();
  const speaker = useSpeaker();

  // 비동기 콜백 안에서 "지금의" 상태를 보기 위한 참조. (콜백이 만들어질 때의 옛 상태를 보지 않게)
  const stateRef = useRef<State>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /** 진행 중인 답을 끊기 위한 손잡이 */
  const abortRef = useRef<AbortController | null>(null);

  /** 채팅창에 시스템 알림을 남긴다. */
  const notify = useCallback(
    (content: string, actions?: ChatAction[]) => {
      dispatch({ type: 'add_message', message: { role: 'system', content, actions } });
    },
    [dispatch],
  );

  /** AI 말풍선을 추가하고 (켜져 있으면) 읽는다. */
  const say = useCallback(
    (content: string, actions?: ChatAction[]) => {
      dispatch({ type: 'add_message', message: { role: 'assistant', content, actions } });
      speaker.enqueue(content);
    },
    [dispatch, speaker],
  );

  /** 아직 묻지 않은 구글 기능이 있으면 하나만 묻는다(D-16: 순서대로 하나씩). */
  const askNextFeature = useCallback(() => {
    const me = stateRef.current.me;
    // 손님에게는 구글 기능을 묻지 않는다(docs/04 5.4: 손님에게는 토글이 보이지 않는다).
    if (!me || me.mode !== 'google') return;
    const local = loadLocalFeatures();
    const next = FEATURE_ORDER.find((k) => me.features[k] === null && local[k] === undefined);
    if (!next) return;
    say(t.notices.featureAsk(t.featureNames[next]), [
      { kind: 'feature_connect', label: '연결', feature: next },
      { kind: 'feature_later', label: '나중에', feature: next },
    ]);
  }, [say]);

  /** 화면에 처음 들어왔을 때: 태스크를 불러오고, 인사하고, 구글 기능을 묻는다. */
  const startSession = useCallback(async () => {
    try {
      dispatch({ type: 'set_tasks', tasks: await api.tasks() });
    } catch {
      /* 태스크를 못 불러와도 대화는 시작할 수 있다 */
    }
    try {
      const g = await api.greeting();
      say(g.text);
    } catch {
      say(`${stateRef.current.me?.name ?? ''}님, 반가워요. 오늘은 어땠어요?`);
    }
    askNextFeature();
  }, [askNextFeature, dispatch, say]);

  /** /api/extract 결과를 화면에 반영한다. 실패해도 대화는 이어진다. */
  const runExtract = useCallback(async () => {
    const wire = toWire(stateRef.current.messages, EXTRACT_LIMIT);
    if (wire.length === 0) return;
    let result;
    try {
      result = await api.extract(wire);
    } catch {
      return; // 추출은 덤이다. 실패했다고 대화를 방해하지 않는다.
    }

    if (result.candidates.length > 0) {
      dispatch({
        type: 'add_candidates',
        items: result.candidates.map((c) => ({ ...c, source: 'chat' as const })),
      });
    }

    for (const c of result.completions.slice(0, MAX_COMPLETIONS)) {
      const task = stateRef.current.tasks.find((x) => x.id === c.task_id);
      if (!task || task.completed) continue; // 모르는 태스크·이미 끝난 태스크는 무시
      try {
        if (c.subtask_id !== null) {
          // 특정 하위 태스크를 말한 경우 → 바로 체크 + 되돌리기
          const sub = task.subtasks.find((s) => s.id === c.subtask_id);
          if (!sub || sub.completed) continue;
          const updated = await api.patchSubtask(task.id, sub.id, { completed: true });
          dispatch({ type: 'upsert_task', task: updated });
          notify(t.notices.checkedSub(task.title, sub.title), [
            { kind: 'undo_subtask', label: t.chat.undo, taskId: task.id, subtaskId: sub.id },
          ]);
          continue;
        }
        const open = task.subtasks.filter((s) => !s.completed);
        if (open.length > 0) {
          // 하위 태스크가 남아 있는데 태스크 전체를 말한 경우 → 확인받는다(일괄 완료)
          say(t.notices.askAll(task.title, open.length), [
            { kind: 'confirm_all', label: t.chat.yesAll, taskId: task.id },
            { kind: 'dismiss', label: t.chat.no },
          ]);
          continue;
        }
        // 하위 태스크가 없는 태스크 → 바로 체크 + 되돌리기
        const updated = await api.patchTask(task.id, { completed: true });
        dispatch({ type: 'upsert_task', task: updated });
        notify(t.notices.checkedTask(task.title), [{ kind: 'undo_task', label: t.chat.undo, taskId: task.id }]);
      } catch (e) {
        dispatch({ type: 'add_message', message: { role: 'system', content: errorText(e), error: true } });
      }
    }
  }, [dispatch, notify, say]);

  /** 사용자 말을 보낸다. */
  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      const cur = stateRef.current;
      if (!content || cur.busy) return;

      speaker.stop(); // 새 말을 보내면 읽던 것은 멈춘다
      const wire: WireMessage[] = [...toWire(cur.messages, HISTORY_LIMIT - 1), { role: 'user', content }];
      dispatch({ type: 'add_message', message: { role: 'user', content } });
      dispatch({ type: 'set_busy', busy: true });
      dispatch({ type: 'add_message', message: { role: 'assistant', content: '', streaming: true } });

      const controller = new AbortController();
      abortRef.current = controller;
      const started = performance.now();
      let firstTokenAt: number | null = null;
      let speakBuffer = ''; // 아직 읽지 않은 글자
      let failed: string | null = null;

      try {
        const llm = cur.me?.settings.llm;
        await api.chatStream(
          { messages: wire, temperature: llm?.temperature, max_tokens: llm?.max_tokens, model: llm?.model ?? null },
          (ev) => {
            if (ev.type === 'answer') {
              if (firstTokenAt === null) firstTokenAt = performance.now();
              dispatch({ type: 'append_stream', text: ev.text });
              speakBuffer += ev.text;
              // 문장이 끝날 때마다 바로 읽기 시작한다(설정이 켜져 있을 때).
              if (stateRef.current.voice.sentenceStreaming) {
                const [done, rest] = splitSentences(speakBuffer);
                for (const s of done) speaker.enqueue(s);
                speakBuffer = rest;
              }
            } else if (ev.type === 'error') {
              failed = ev.message;
            }
          },
          controller.signal,
        );
      } catch (e) {
        // 사용자가 "멈추기"를 누른 경우는 오류가 아니다.
        if (!(e instanceof DOMException && e.name === 'AbortError')) failed = errorText(e);
      } finally {
        abortRef.current = null;
      }

      if (speakBuffer.trim() && !failed) speaker.enqueue(speakBuffer);
      dispatch({ type: 'end_stream', error: failed ?? undefined });
      dispatch({ type: 'set_busy', busy: false });

      // 브라우저에서만 알 수 있는 숫자: 첫 글자까지 걸린 시간(성능 화면용). 내용은 보내지 않는다.
      if (firstTokenAt !== null) void api.clientMetric('chat_ttfb_client', Math.round(firstTokenAt - started));

      if (!failed) {
        // store 가 방금 끝난 답을 반영한 뒤에 추출하도록 한 박자 늦춘다.
        window.setTimeout(() => void runExtract(), 0);
      }
    },
    [dispatch, runExtract, speaker],
  );

  /** 흘러나오는 답을 멈춘다. */
  const stop = useCallback(() => {
    abortRef.current?.abort();
    speaker.stop();
  }, [speaker]);

  /** 구글 기능 토글 값을 저장한다. 서버 저장이 안 되면 브라우저에 둔다(eple 확정 2026-11-17). */
  const saveFeature = useCallback(
    async (key: FeatureKey, value: boolean) => {
      try {
        dispatch({ type: 'set_me', me: await api.putSettings({ features: { [key]: value } }) });
      } catch {
        saveLocalFeature(key, value);
        const me = stateRef.current.me;
        if (me) dispatch({ type: 'set_me', me: { ...me, features: { ...me.features, [key]: value } } });
      }
    },
    [dispatch],
  );

  /** 말풍선 아래 버튼을 눌렀을 때. 버튼과 글 입력은 같은 결과를 낸다(docs/04 3장). */
  const runAction = useCallback(
    async (messageId: number, action: ChatAction) => {
      dispatch({ type: 'actions_done', id: messageId });
      // 버튼을 누르면 사용자 말풍선으로도 남긴다.
      if (action.kind !== 'undo_task' && action.kind !== 'undo_subtask') {
        dispatch({ type: 'add_message', message: { role: 'user', content: action.label } });
      }
      try {
        switch (action.kind) {
          case 'undo_task': {
            dispatch({ type: 'upsert_task', task: await api.patchTask(action.taskId, { completed: false }) });
            notify(t.chat.undone);
            break;
          }
          case 'undo_subtask': {
            const updated = await api.patchSubtask(action.taskId, action.subtaskId, { completed: false });
            dispatch({ type: 'upsert_task', task: updated });
            notify(t.chat.undone);
            break;
          }
          case 'confirm_all': {
            const task = stateRef.current.tasks.find((x) => x.id === action.taskId);
            if (!task) break;
            // 서버가 태스크 완료 시 하위 태스크를 함께 완료하는지에 기대지 않고, 하나씩 체크한 뒤 태스크를 완료한다.
            let latest = task;
            for (const s of task.subtasks.filter((x) => !x.completed)) {
              latest = await api.patchSubtask(task.id, s.id, { completed: true });
            }
            if (!latest.completed) latest = await api.patchTask(task.id, { completed: true });
            dispatch({ type: 'upsert_task', task: latest });
            notify(t.notices.checkedTask(task.title));
            break;
          }
          case 'dismiss':
            break;
          case 'feature_connect':
            // 2단계에서: 여기서 구글 동의 화면으로 보낸다(/auth/google/connect?feature=…).
            say(t.notices.featureSoon(t.featureNames[action.feature]));
            saveLocalFeature(action.feature, true); // 같은 질문을 되풀이하지 않게 "물어봤음"만 기억
            askNextFeature();
            break;
          case 'feature_later':
            await saveFeature(action.feature, false);
            say(t.notices.featureLater(t.featureNames[action.feature]));
            askNextFeature();
            break;
          case 'diary_save':
            // 2단계에서: /api/diary/save 로 구글 시트·Docs 에 쓴다(D-15). 지금은 안내만 한다.
            say(t.panel.diary.saved);
            break;
          case 'diary_later':
            say(t.panel.diary.skipped);
            break;
        }
      } catch (e) {
        dispatch({ type: 'add_message', message: { role: 'system', content: errorText(e), error: true } });
      }
    },
    [askNextFeature, dispatch, notify, saveFeature, say],
  );

  /** 등록 예정 목록을 벌집에 올린다(R-HIVE-3, R-HIVE-4). 성공하면 true. */
  const moveToHive = useCallback(async (): Promise<boolean> => {
    const pending = stateRef.current.pending;
    if (pending.length === 0) return false;
    try {
      const created = await api.bulk(
        pending.map((p) => ({ title: p.title, due_date: p.due_date, subtasks: p.subtasks, source: p.source })),
      );
      for (const task of created) dispatch({ type: 'upsert_task', task });
      dispatch({ type: 'clear_pending' });
      // 서버 저장이 성공한 뒤에만 벌이 난다. 실패하면 애니메이션 없이 오류를 알린다(docs/04 4장).
      dispatch({ type: 'start_flight', taskIds: created.map((x) => x.id) });
      notify(t.notices.moved(created.length));
      return true;
    } catch (e) {
      dispatch({ type: 'add_message', message: { role: 'system', content: errorText(e), error: true } });
      return false;
    }
  }, [dispatch, notify]);

  /** "오늘의 일기" 버튼: 대화를 잠시 멈추고 요약을 보여 준 뒤 등록할지 묻는다(R-DIARY-2, R-DIARY-3). */
  const requestDiary = useCallback(async () => {
    const cur = stateRef.current;
    if (cur.busy) return;
    const wire = toWire(cur.messages, HISTORY_LIMIT);
    if (!wire.some((m) => m.role === 'user')) {
      notify(t.panel.diary.needTalk);
      return;
    }
    dispatch({ type: 'set_busy', busy: true });
    notify(t.panel.diary.working);
    try {
      const d = await api.diarySummary(wire);
      const lines = [t.panel.diary.intro, '', d.summary_line, d.body];
      if (d.did.length > 0) lines.push('', `오늘 한 일: ${d.did.join(', ')}`);
      if (d.todo.length > 0) lines.push(`내일 할 일: ${d.todo.join(', ')}`);
      say(lines.filter((l, i) => l !== '' || i === 1).join('\n'));
      say(t.panel.diary.ask, [
        { kind: 'diary_save', label: t.panel.diary.save },
        { kind: 'diary_later', label: t.panel.diary.later },
      ]);
    } catch (e) {
      dispatch({ type: 'add_message', message: { role: 'system', content: errorText(e), error: true } });
    } finally {
      dispatch({ type: 'set_busy', busy: false });
    }
  }, [dispatch, notify, say]);

  return { send, stop, runAction, notify, say, startSession, moveToHive, requestDiary, saveFeature };
}
