# 우리 가족의 오키나와

한국어 가족 여행 관리 앱입니다. 날짜별 일정과 지도, 저장한 장소, 맛집, 사진 명소, 준비물 담당자와 완료 상태를 관리합니다. 장소·일정·준비물은 추가, 수정, 삭제할 수 있고 여행 파일을 내려받거나 다시 불러올 수 있습니다.

## 현재 상태

- 로컬 앱은 사용할 수 있습니다. 사용자가 제공한 지도 키는 Git에서 제외되는 `.env.local`에만 저장했습니다.
- Supabase 프로젝트는 생성됐습니다. 데이터베이스 설정과 서버용 키 연결, Vercel 배포는 아직 완료되지 않았습니다.
- 로컬 미리보기는 이 컴퓨터의 `.data/trip.json`에 저장합니다. Supabase 연결 전에는 변경 내용이 다른 기기로 공유되지 않습니다.
- 첫 데이터는 날짜와 인원이 미정인 4일 일정 초안입니다. 장소 위치와 일정은 직접 수정할 수 있습니다. 맛집 평점, 영업 시간, 실시간 교통 정보는 자동으로 가져오지 않습니다.

소스 저장소: [peejoy/kwonsTravel](https://github.com/peejoy/kwonsTravel)

## 로컬 실행

```bash
npm install
npm run dev -- --port 3000
```

브라우저에서 `http://localhost:3000`을 엽니다. `.env.local`에서 `FAMILY_PASSWORD`가 비어 있으면 로컬 미리보기로 바로 열립니다. 로컬에서도 비밀번호를 사용하려면 아래 가족 비밀번호와 세션 서명을 함께 설정하세요.

## 구글 지도

`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`를 설정하면 구글 지도에 해당 날짜의 방문 장소가 표시됩니다. 방문 순서 선은 장소를 직접 연결한 선이며 실제 도로 경로가 아닙니다. 길찾기는 구글맵 앱 또는 웹으로 연결합니다.

Google Cloud에서 Maps JavaScript API와 결제 계정을 활성화해야 합니다. 키의 웹사이트 제한에 `http://localhost:3000/*`와 실제 배포 도메인을 추가하고, API 제한에는 Maps JavaScript API를 선택하세요. 브라우저용 지도 키는 화면 실행 중 브라우저에 전달되므로 도메인 제한이 중요합니다. `NEXT_PUBLIC_GOOGLE_MAP_ID`에는 자체 지도 ID를 설정할 수 있습니다. 현재 `DEMO_MAP_ID`를 사용합니다.

- [Google Maps 설정 안내](https://developers.google.com/maps/documentation/javascript/get-api-key)
- [키 제한 안내](https://developers.google.com/maps/api-security-best-practices)

구글 지도 연결에 실패하면 기본 OpenStreetMap 지도를 표시합니다. 기본 지도는 일반적인 대화형 열람에만 사용하며, 출처를 표시합니다. 공용 타일 서버의 오프라인 다운로드나 대량 수집 기능은 없습니다.

## Supabase 연결

1. [Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트를 만듭니다.
2. SQL Editor에서 `supabase/schema.sql`을 실행합니다.
3. 프로젝트 URL과 서버용 Secret API Key를 `.env.local`에 설정합니다. 공개 Publishable Key는 이 앱의 서버용 키로 사용할 수 없습니다.
4. `FAMILY_PASSWORD`와 `SESSION_SECRET`을 설정하고 개발 서버를 재시작합니다.

```dotenv
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAP_ID=DEMO_MAP_ID
FAMILY_PASSWORD=
SESSION_SECRET=
SUPABASE_URL=
SUPABASE_SECRET_KEY=
```

가족 비밀번호는 8자 이상이어야 합니다. `SESSION_SECRET`은 32바이트 이상이며 다음 명령으로 생성할 수 있습니다. 비밀번호를 바꾸면서 기존 로그인을 모두 해제하려면 세션 서명도 새 값으로 바꾸세요.

```bash
openssl rand -hex 32
```

가족 데이터는 `family_trip` 테이블의 한 문서에 저장합니다. 모든 조회와 수정은 로그인 확인 후 서버가 수행합니다. 공개 데이터베이스 접근은 RLS와 권한 설정으로 차단됩니다. 동시 수정 시 먼저 저장한 내용을 보호하고, 나중 요청은 충돌 안내를 표시합니다. 편집 중인 입력은 보존하며 재시도 시 변경한 필드만 적용합니다.

비밀번호 확인은 접속자별로 10분에 8회까지 허용합니다. 배포에서는 Supabase의 원자적 함수와 `family_login_attempts` 테이블을 사용하므로 Vercel 서버가 바뀌어도 제한을 공유합니다. 접속 주소는 세션 서명으로 해시 처리하며 원본 IP는 저장하지 않습니다. 로그인 성공 시 해당 제한 기록을 지웁니다. 최신 `schema.sql`의 로그인 제한 테이블과 함수까지 적용해야 합니다.

서버용 Secret Key와 가족 비밀번호는 공개 저장소나 채팅에 올리지 말고 로컬 `.env.local` 또는 Vercel 환경 변수에 직접 입력하세요. `.env.local`, `.data/`와 `.vercel/`은 Git에서 제외됩니다.

로컬에서 만든 여행을 이어가려면 연결하기 전에 앱의 **여행 설정 → 여행 파일 다운로드**로 백업하세요. 공유 앱에 로그인한 뒤 **여행 파일 불러오기**에서 그 파일을 선택하면 됩니다. 불러오기 전에 대체될 여행 내용을 확인하는 창이 표시됩니다.

## Vercel 배포

1. 소스를 Git 저장소에 올리고 [Vercel](https://vercel.com/new)에서 해당 저장소를 Import합니다. 또는 프로젝트 폴더에서 `npx vercel`을 사용할 수 있습니다.
2. Framework Preset은 Next.js입니다. 별도 빌드·출력 폴더 변경은 필요 없습니다.
3. 위 환경 변수 6개를 Vercel 프로젝트 설정에 등록합니다. Supabase 서버용 키, 가족 비밀번호와 세션 서명에는 `NEXT_PUBLIC_`를 붙이지 않습니다.
4. Deploy 후 구글 지도 키의 웹사이트 허용 목록에 배포 URL을 추가합니다.
5. 가족에게 배포 주소와 가족 비밀번호를 전달합니다. 로그인 후 모두 같은 여행을 수정할 수 있습니다. 변경 내용은 15초 간격 또는 창에 다시 포커스할 때 갱신됩니다.

배포 환경에서는 비밀번호·세션 서명·Supabase가 없으면 앱이 설정 오류를 표시하며 데이터 접근을 차단합니다. Vercel의 임시 파일시스템을 여행 저장소로 사용하지 않습니다. 환경 변수를 수정한 뒤에는 재배포해야 합니다.

[Vercel의 Next.js 배포 안내](https://vercel.com/docs/frameworks/full-stack/nextjs)

## 검증

```bash
npm test
npm run typecheck
npm run build
```

핵심 검증은 데이터 참조와 입력 검증, 세션 서명·만료, 인증·Origin 제한, 생산 환경 설정 누락, 동시 저장 충돌을 다룹니다. `scripts/check-browser.mjs`는 별도 임시 데이터와 3002번 테스트 서버로 Chrome에서 화면, 저장 후 재접속, 편집, 삭제, 비밀번호 로그인을 확인합니다. Codex의 번들 Playwright를 사용하며 일반 개발 환경에서는 Playwright 설치 경로를 조정해야 합니다.

실제 Supabase 프로젝트에 대한 연결 및 Vercel 배포 검증은 계정 설정 후 진행해야 합니다.

## 사진 출처

앱의 `/credits` 페이지에 각 사진의 작성자, 원본과 라이선스를 표시했습니다. 사진은 웹 표시를 위해 크기를 줄였고, 화면 비율에 따라 일부가 잘려 보일 수 있습니다. 사진 라이선스는 앱 코드와 별도로 적용됩니다.
