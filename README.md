# AssetBox

3D 파일을 드래그하면 즉시 미리보기 + 자동 정리 + 기본 최적화까지 해주는 데스크톱 툴

## 왜 만들었나

3D 아티스트가 FBX 하나 확인하려면 Blender나 Maya를 켜야 합니다. 텍스처 연결은 수동이고, 폴더 정리도 안 되어 있고, 썸네일도 없어서 파일 찾기가 힘듭니다. AssetBox는 이 과정을 **드래그 앤 드롭 한 번**으로 줄입니다.

## 주요 기능

**3D 프리뷰**
- FBX, GLB, OBJ 파일 드래그 앤 드롭
- 회전 / 줌 / 팬 지원 (모델 크기에 맞게 자동 조정)
- Studio 환경 라이팅

**텍스처 자동 매칭**
- `_basecolor`, `_normal`, `_roughness` 등 네이밍 규칙 기반
- 같은 폴더에서 자동 탐색
- 내장 텍스처(GLB 등) 자동 인식

**Asset 검사 (Validation)**
- Tris / Verts / File Size / Texture Size 체크
- Good / Warning / Bad 등급 표시
- 기준 초과 시 임계값 안내

| 항목 | Good | Warning | Bad |
|------|------|---------|-----|
| Tris | < 100K | 100K ~ 500K | 500K+ |
| Verts | < 100K | 100K ~ 300K | 300K+ |
| File Size | < 50MB | 50 ~ 100MB | 100MB+ |
| Max Texture | < 4096px | 4096 ~ 8192px | 8192px+ |

**썸네일 생성**
- 현재 뷰포트를 PNG로 캡처 (그리드 제외)
- 모델 파일 옆에 `_thumbnail.png`로 저장


## 기술 스택

| 영역 | 기술 |
|------|------|
| Desktop | Tauri v2 |
| Frontend | React 18 + TypeScript |
| 3D Rendering | Three.js (@react-three/fiber, @react-three/drei) |
| Styling | TailwindCSS v4 |
| Backend | Rust |
| Test | Vitest + Testing Library |
| Build | Vite |

## 시작하기

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install)
- Tauri v2 시스템 요구사항 ([macOS](https://v2.tauri.app/start/prerequisites/#macos) / [Windows](https://v2.tauri.app/start/prerequisites/#windows) / [Linux](https://v2.tauri.app/start/prerequisites/#linux))

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run tauri dev

# 프로덕션 빌드
npm run tauri build
```

### 테스트

```bash
# 전체 테스트 실행
npm test

# 워치 모드
npm run test:watch
```

## 프로젝트 구조

```
src/                          # Frontend (React + TypeScript)
├── components/
│   ├── DropZone.tsx          # 드래그 앤 드롭 영역
│   ├── Viewer3D.tsx          # Three.js 3D 뷰어
│   ├── ModelLoader.ts        # FBX/GLB/OBJ 로더
│   ├── TextureMatcher.ts     # 텍스처 자동 매칭
│   ├── InfoPanel.tsx         # 플로팅 정보 오버레이
│   ├── ValidationBadge.tsx   # Good/Warning/Bad 뱃지
│   └── ThumbnailButton.tsx   # 썸네일 생성
├── hooks/
│   ├── useFileDropHandler.ts # Tauri 파일 드롭 이벤트
│   ├── useAssetValidation.ts # 검증 로직
│   └── useTauriCommand.ts    # Tauri IPC 래퍼
├── lib/
│   └── textureRules.ts       # 텍스처 네이밍 규칙
└── types/
    └── asset.ts              # TypeScript 타입 정의

src-tauri/                    # Backend (Rust)
├── src/
│   ├── lib.rs                # Tauri 앱 설정
│   ├── commands/
│   │   ├── file_scan.rs      # 디렉토리 스캔 & 텍스처 탐색
│   │   └── thumbnail.rs      # 썸네일 PNG 저장
│   └── models/
│       └── asset_info.rs     # Rust 데이터 구조체

tests/                        # Frontend 테스트
├── components/
├── hooks/
└── lib/
```

## 라이선스

[Apache License 2.0](LICENSE)
