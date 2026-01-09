# Brain-Up 프로젝트 개요

## 프로젝트 목적
- **치매 예방 프로그램**: 인지기능 검사 및 훈련을 제공하는 웹 애플리케이션
- 한국어 기반 서비스

## 주요 기능
1. **인지기능 검사** (4가지):
   - 패턴 비교 검사 (처리속도)
   - Go/No-Go 검사 (주의·억제)
   - Digit Span 검사 (숫자 기억/작업기억)
   - 위치 기억 검사 (공간기억)

2. **훈련 모드**:
   - 숫자 기억 훈련 (digitspan-training.js)

3. **결과 분석**:
   - 개인 기준선 대비 지수 계산 (0-100 스케일)
   - 변화 추이 차트 (최근 10회)
   - 해석 문구 제공

## 기술 스택
- **프론트엔드**: Vanilla JavaScript (ES6 Modules)
- **스타일링**: CSS3 (CSS Variables 사용)
- **데이터 저장**: localStorage
- **외부 라이브러리**:
  - Font Awesome 6.5.1 (아이콘)
  - Pretendard 폰트

## 프로젝트 구조
```
brain-up/
├── index.html          # 메인 HTML
├── style.css           # 전체 스타일
├── app.js              # 레거시 단일 파일 버전 (비모듈화)
├── README.md           # 프로젝트 설명
└── js/
    ├── main.js         # 엔트리 포인트 (모듈 방식)
    ├── core/           # 핵심 유틸리티
    │   ├── utils.js    # 유틸 함수 ($, clamp, sleep 등)
    │   ├── state.js    # 앱 상태 관리
    │   ├── storage.js  # localStorage 래퍼
    │   ├── scoring.js  # 점수 계산
    │   └── sound.js    # 사운드 관련
    ├── tests/          # 검사 모듈
    │   ├── pattern.js  # 패턴 비교
    │   ├── gonogo.js   # Go/No-Go
    │   ├── digitspan.js# 숫자 기억
    │   └── spatial.js  # 위치 기억
    ├── training/       # 훈련 모듈
    │   └── digitspan-training.js
    └── ui/             # UI 컴포넌트
        ├── home.js     # 홈 화면
        ├── intro.js    # 인트로 화면
        ├── result.js   # 결과 화면
        └── calendar.js # 캘린더 UI
```

## 데이터 구조 (localStorage 키)
- `bc_anon_id_v1`: 익명 사용자 ID
- `bc_user_profile_v1`: 사용자 프로필
- `bc_pattern_history_v1`: 패턴 검사 기록
- `bc_gonogo_history_v1`: Go/No-Go 검사 기록
- `bc_digitspan_history_v1`: 숫자 기억 검사 기록
- `bc_spatial_history_v1`: 위치 기억 검사 기록
- `*_baseline_v1`: 각 검사별 기준선 데이터

## 주간 범위 (중요)
- **일요일 ~ 토요일** (일월화수목금토)
- storage.js, api.js, calendar.js, report.js, guardian.html 모두 동일하게 적용