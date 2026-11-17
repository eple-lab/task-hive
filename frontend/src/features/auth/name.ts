/**
 * 손님 이름 검사 (순수 함수라 테스트하기 쉽다).
 *
 * - 앞뒤 공백을 지우고, 안 보이는 제어 문자는 뺀다.
 * - 1~20자(화면 안내와 같은 값). 서버는 따로 한 번 더 검사한다(화면 검사는 편의일 뿐, 믿지 않는다).
 * - 통과하면 정리한 이름, 아니면 null.
 */
export const NAME_MAX = 20;

export function cleanGuestName(raw: string): string | null {
  // eslint 없이도 의도가 보이도록 제어 문자 범위를 코드 포인트로 걸러 낸다.
  const noControl = Array.from(raw)
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c >= 0x20 && c !== 0x7f;
    })
    .join('');
  const name = noControl.trim();
  if (name.length === 0 || Array.from(name).length > NAME_MAX) return null;
  return name;
}
