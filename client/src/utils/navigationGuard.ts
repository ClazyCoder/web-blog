/**
 * 네비게이션 가드 - 에디터에서 미저장 변경사항이 있을 때 페이지 이탈을 막는 유틸리티
 * Context/Provider 없이 동작하여 초기화 순서 문제를 방지
 */

type GuardFn = () => boolean;

let currentGuard: GuardFn | null = null;

/** 네비게이션 가드 등록 (에디터에서 호출) */
export function setNavigationGuard(guard: GuardFn) {
    currentGuard = guard;
}

/** 네비게이션 가드 해제 (에디터 언마운트 시 호출) */
export function clearNavigationGuard() {
    currentGuard = null;
}

/** 네비게이션 허용 여부 확인 - 가드가 있고 미저장 변경사항이 있으면 confirm 표시 */
export function confirmNavigation(): boolean {
    if (currentGuard && currentGuard()) {
        return window.confirm('작성 중인 내용이 저장되지 않았습니다. 페이지를 떠나시겠습니까?');
    }
    return true;
}
