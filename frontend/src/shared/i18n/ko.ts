/**
 * 화면 문구(한국어).
 *
 * 왜 한곳에 모으나
 * - 한국어가 기본이고 나중에 다른 언어를 더한다(R-CHAT-6, Q-09). 같은 모양의 en.ts 등을 추가하면 된다.
 * - 문구를 고칠 때 컴포넌트를 뒤지지 않아도 된다.
 *
 * 아직 안 된 것: 언어 전환. 지금은 이 파일만 쓴다.
 */
export const ko = {
  appName: 'Task Hive',
  loading: '불러오는 중이에요…',
  waking: '서버를 깨우는 중이에요 (최대 1분)',
  retry: '다시 시도',
  logout: '나가기',
  theme: { toLight: '밝은 화면으로', toDark: '어두운 화면으로' },

  start: {
    tagline: '저녁에 일기 쓰듯 이야기하면, 할 일이 벌집에 쌓여요.',
    google: '구글로 시작',
    googleSoon: '구글 로그인은 2단계에 열려요',
    guest: '로그인 없이 시작',
    namePrompt: '뭐라고 불러드릴까요?',
    namePlaceholder: '부를 이름 (20자까지)',
    guestNotice:
      '로그인 없이 쓰면 이 브라우저에서만 이어지고, 내려받거나 24시간이 지나면 지워져요.',
    guestAgree: '알겠어요, 시작할게요',
    dataTitle: '내 데이터는 어디에 있나요?',
    dataLines: [
      '대화 내용은 서버에 저장하지 않아요. 새로고침하면 사라져요.',
      '대화는 내가 입력한 Colab 주소(외부)로 전송돼요.',
      '할 일만 서버에 저장돼요. 손님은 24시간 뒤 지워져요.',
    ],
  },

  chat: {
    externalNotice: '이 대화는 입력하신 Colab 주소(외부)로 전송돼요. 서버에는 저장하지 않아요.',
    notConnected: 'Colab에 연결되지 않았어요. 오른쪽 "연결"에서 주소를 넣어 주세요. 벌집은 그대로 쓸 수 있어요.',
    connected: '연결됨',
    disconnected: '연결 안 됨',
    placeholder: '오늘 있었던 일을 편하게 적어 주세요',
    send: '보내기',
    stop: '멈추기',
    speakOn: '말하기 켜짐',
    speakOff: '말하기 꺼짐',
    thinking: '생각하는 중…',
    undo: '되돌리기',
    undone: '되돌렸어요.',
    yesAll: '응, 다 했어',
    no: '아니야',
  },

  hive: {
    title: '하이브',
    empty: '오늘 이야기를 들려주세요. 할 일이 생기면 여기에 벌집이 생겨요.',
    toList: '리스트로 보기',
    toHive: '벌집으로 보기',
    sheet: 'task-hive todo 구글시트 가기',
    exportMd: 'MD로 내려받기',
    exportWarn: '내려받으면 서버의 내 데이터가 지워져요. 계속할까요?',
    archive: '보관함',
    full: '벌집이 꽉 찼어요. 완료한 태스크를 보관함으로 옮기면 자리가 생겨요.',
    done: 'DONE',
    noDue: '날짜 없음',
    detail: {
      complete: '완료로 표시',
      reopen: '완료 취소',
      delete: '지우기',
      toArchive: '보관함으로',
      fromArchive: '벌집으로 되돌리기',
      addSub: '하위 태스크 추가',
      subPlaceholder: '하위 태스크 제목',
      close: '닫기',
      confirmDelete: '이 태스크를 지울까요? 하위 태스크도 함께 지워져요.',
      confirmComplete: '안 끝난 하위 태스크가 있어요. 모두 완료로 표시할까요?',
    },
  },

  panel: {
    title: '상태창',
    connect: {
      title: '연결',
      url: 'ngrok 주소',
      urlPlaceholder: 'https://….ngrok-free.app',
      key: '접속 키',
      keyPlaceholder: '노트북이 보여 준 키',
      check: '연결 확인',
      checking: '확인하는 중…',
      disconnect: '연결 끊기',
      help: '본인이 띄운 Colab 주소만 넣으세요. 남의 주소를 넣으면 대화가 그 사람에게 가요.',
      ok: (ms: number) => `연결됐어요 (응답 ${ms}ms)`,
      model: '대화 모델',
    },
    candidates: {
      title: '후보',
      empty: '대화하다 할 일이 보이면 여기에 모아 둘게요.',
      add: '담기',
      remove: '빼기',
      evidence: '근거',
    },
    pending: {
      title: '하이브 등록 예정',
      empty: '후보에서 "담기"를 누르면 여기에 모여요.',
      move: '지금까지 모은 task 벌집으로 옮기기',
      moving: '옮기는 중…',
      subtasks: (n: number) => `하위 ${n}개`,
      due: '날짜',
    },
    calendar: {
      title: '캘린더',
      toggle: '구글 캘린더 가져오기',
      soon: '구글 로그인이 열리는 2단계에 연결돼요. 내가 만든 캘린더의 지난 7일과 앞으로 30일만, 읽기만 해요.',
    },
    diary: {
      title: '일기',
      toggle: '구글에 일기 저장',
      soon: '구글 저장은 2단계에 연결돼요. 지금은 요약을 화면에서 볼 수 있어요.',
      button: '오늘의 일기 정리하기',
      working: '일기를 정리하는 중…',
      intro: '오늘은 이런 일이 있었네요.',
      ask: '오늘의 일기를 등록할까요? (구글 저장은 2단계에 열려요. 지금은 내려받기에 함께 담겨요)',
      save: '등록해',
      later: '나중에',
      saved: '일기를 기억해 뒀어요. 내려받기에 함께 담을게요.',
      skipped: '알겠어요, 나중에 할게요.',
      needTalk: '먼저 오늘 이야기를 조금 들려주세요.',
    },
    voice: {
      title: '목소리 설정',
      enabled: '말하기 켜기',
      voice: '목소리',
      auto: '한국어 기본 음성',
      pitch: '저음',
      pitchHelp: '낮을수록 굵은 목소리가 돼요.',
      echo: '에코',
      echoHelp: '에코는 Colab 목소리가 붙은 뒤에 쓸 수 있어요. 지금은 브라우저 기본 음성으로 읽어요.',
      rate: '속도',
      volume: '볼륨',
      preview: '미리 듣기',
      previewText: '안녕하세요. 오늘 하루는 어땠어요?',
      sentence: '문장마다 바로 읽기',
      stopOnTyping: '내가 입력하면 멈추기',
      reset: '기본값으로',
      unsupported: '이 브라우저는 말하기를 지원하지 않아요.',
      presets: '분위기',
      presetCalm: '차분한 밤',
      presetClear: '또렷하게',
      presetWhisper: '속삭이듯',
    },
    llm: {
      title: '대화 설정',
      temperature: '온도',
      temperatureHelp: '낮으면 일관적, 높으면 다양하지만 엉뚱해질 수 있어요.',
      maxTokens: '최대 토큰',
      maxTokensHelp: '답의 최대 길이예요. 너무 작으면 답이 중간에 잘려요.',
    },
    city: { title: '도시', help: '첫 인사의 날씨에 써요. 위치 권한은 쓰지 않아요.' },
    lang: { title: '언어', soon: '다른 언어는 준비 중이에요.' },
  },

  notices: {
    addedPending: (title: string) => `'${title}'을(를) 등록 예정에 담았어요.`,
    removedCandidate: (title: string) => `'${title}'을(를) 후보에서 뺐어요.`,
    removedPending: (title: string) => `'${title}'을(를) 등록 예정에서 뺐어요.`,
    moved: (n: number) => `${n}개를 벌집에 올렸어요 🐝`,
    checkedTask: (title: string) => `'${title}'을(를) 완료로 표시했어요.`,
    checkedSub: (task: string, sub: string) => `'${task}'의 '${sub}'을(를) 완료로 표시했어요.`,
    askAll: (title: string, n: number) => `'${title}'에 남은 하위 태스크가 ${n}개 있어요. 모두 완료로 표시할까요?`,
    featureAsk: (name: string) => `${name} 기능을 연결할까요?`,
    featureSoon: (name: string) => `${name}은(는) 구글 로그인이 열리는 2단계에 연결돼요. 그때 다시 물어볼게요.`,
    featureLater: (name: string) =>
      `알겠어요. ${name}은(는) 꺼 둘게요. 상태창에서 언제든 켜서 쓸 수 있어요. 대화하며 일기 적듯 할 일을 적을 수 있어요.`,
  },

  featureNames: {
    calendar: '구글 캘린더 가져오기',
    diary_google: '구글에 일기 저장',
    task_sheet: '구글 시트로 내보내기',
  },

  admin: {
    title: 'Task Hive 성능 검토',
    back: '본 화면으로',
    note: '숫자만 모아요. 대화 내용과 태스크 제목은 담지 않아요.',
    empty: '아직 지표가 없어요.',
    forbidden: '이 화면을 볼 수 없어요.',
  },
} as const;

/** 지금은 한국어만. 언어 전환을 넣을 때 이 값을 상태에서 고르게 바꾼다. */
export const t = ko;
