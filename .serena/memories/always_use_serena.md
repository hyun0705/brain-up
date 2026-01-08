# Serena 사용 규칙

## 항상 Serena 도구 사용하기

이 프로젝트에서는 **항상 Serena MCP 도구를 우선 사용**해야 합니다.

### 왜?
- 코드 심볼 분석이 정확함
- 리팩토링이 안전함
- 참조 찾기가 빠름
- 프로젝트 전체 구조 파악 용이

### 언제 Serena 사용?
- 파일 읽기: `serena:read_file`
- 파일 생성: `serena:create_text_file`
- 내용 수정: `serena:replace_content`
- 심볼 찾기: `serena:find_symbol`
- 참조 찾기: `serena:find_referencing_symbols`
- 패턴 검색: `serena:search_for_pattern`
- 디렉토리 확인: `serena:list_dir`

### Filesystem 도구는?
Serena가 안 될 때만 백업으로 사용.

### 프로젝트 시작 시
1. `serena:activate_project` → brain-up 활성화
2. `serena:list_memories` → 메모리 확인
3. 필요한 메모리 읽기
