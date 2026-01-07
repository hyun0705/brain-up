# 코드 스타일 및 컨벤션

## JavaScript 스타일
- **모듈 시스템**: ES6 Modules (`import`/`export`)
- **변수 선언**: `const` 우선, 필요시 `let` 사용
- **함수**: 일반 함수 선언 (`function name()`) 및 화살표 함수 혼용
- **비동기**: `async/await` 패턴 사용
- **문자열**: 템플릿 리터럴 (백틱) 사용
- **세미콜론**: 사용

## 네이밍 컨벤션
- **파일명**: kebab-case (`digitspan-training.js`)
- **함수명**: camelCase (`renderMainIntro`, `computePatternSummary`)
- **상수**: UPPER_SNAKE_CASE (`LS_KEYS`, `TEST_DURATION_MS`)
- **상태 객체**: camelCase (`state.currentTest`, `state.trialIndex`)

## UI 패턴
- DOM 조작: `innerHTML`로 전체 교체
- 선택자: `$()` 헬퍼 함수 (`querySelector` 래퍼)
- 이벤트: `element.onclick = handler` 패턴

## CSS 스타일
- CSS Variables 사용 (`--bg`, `--accent`, `--text` 등)
- 클래스명: 간결한 단어 (`card`, `pill`, `notice`, `controls`)
- 반응형: `@media` 쿼리 사용

## 코드 구조
- 각 검사는 `start*Test()` → `render*Intro()` → 연습 → `render*Ready()` → 본검사 → `finish*Test()` 흐름
- 상태는 `state` 객체에 중앙 관리
- 결과는 localStorage에 히스토리 배열로 저장

## 주석
- 한글 주석 사용
- 섹션 구분: `// ---------------------------`
