# 개발 명령어

## 서버 실행
이 프로젝트는 정적 HTML/JS/CSS로 구성되어 있어 간단한 HTTP 서버로 실행 가능:

```powershell
# Python 사용 (권장)
cd C:\Users\hyun\Desktop\brain-up
python -m http.server 8000

# 또는 Node.js의 http-server
npx http-server
```

브라우저에서 `http://localhost:8000` 접속

## Windows 시스템 명령어
```powershell
# 파일 탐색
dir                    # 디렉토리 목록 (ls 대신)
Get-ChildItem          # PowerShell 버전
tree /f                # 트리 구조 보기

# 파일 내용 보기
type filename          # cat 대신
Get-Content filename   # PowerShell 버전

# 파일 검색
dir /s /b *.js         # 모든 js 파일 찾기
Get-ChildItem -Recurse -Filter *.js
```

## Git 명령어
```powershell
git status
git add .
git commit -m "메시지"
git push
```

## 테스트/린트/포맷
현재 프로젝트에는 별도의 테스트, 린트, 포맷 도구가 설정되어 있지 않음.
순수 Vanilla JS로 빌드 과정 없이 직접 실행됨.

## 주의사항
- `app.js`는 레거시 단일 파일 버전 (모듈화 이전)
- 실제 사용되는 엔트리포인트는 `js/main.js` (모듈 방식)
- `index.html`에서 `<script type="module" src="./js/main.js">` 로 로드
