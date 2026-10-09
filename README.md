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

## 링크로 장소 등록과 네비

**장소 추가 → Google 지도 링크 → 불러오기 → 장소 등록**에서 공유 링크의 장소 이름과 목적지 좌표를 확인합니다. 새 장소는 Google 지도 링크로만 등록하며, 미리보기에서 위치를 확인하고 분류·즐겨찾기를 선택할 수 있습니다. 맛집·사진 명소 화면에서 추가하면 해당 분류가 기본 선택됩니다. 이미 등록된 장소의 이름·위치·메모·사진 등은 기존 수정 화면에서 변경할 수 있습니다. `maps.app.goo.gl`, `goo.gl/maps` 짧은 링크와 Google의 일반 장소 링크를 지원합니다. 원본 링크는 여행 파일 백업에도 포함되며 예약·공식 사이트 주소와 별도로 보관합니다.

새 등록은 이름과 정확한 목적지 좌표를 모두 확인한 링크만 허용합니다. 검색어·지도 화면 중심 위치만 있는 링크, 이름 없는 좌표 검색 링크, 경로·공유 목록 링크는 새 장소를 등록할 수 없습니다. 이때 Google 지도에서 개별 장소의 공유 링크를 다시 복사해주세요. 링크를 변경하거나 지우면 이전 미리보기는 해제되고 재확인이 필요합니다. 기존 장소 수정에서는 직접 위치를 조정할 수 있습니다. 평점·영업 시간은 자동으로 가져오지 않으며 Google 지도 페이지를 수집하지 않습니다.

## 장소 사진의 1회 저장 (로컬 전용)

`GOOGLE_PLACES_API_KEY`가 설정된 로컬 앱에서는 링크를 불러올 때 Places API (New)로 장소 주변의 사진을 조회하고 대표사진 1장을 `.data/place-photos/`에 저장합니다. 같은 장소의 저장본이 있으면 Google API를 다시 호출하지 않습니다. 사진이 없는 조회 결과도 기억하므로 반복 호출하지 않습니다. 새 장소 등록을 취소한 미리보기의 사진도 캐시에 남으며 아래 전체 삭제에 포함됩니다. API 오류·미설정·사진 없음은 장소 등록을 막지 않습니다.

**저장한 장소 → 사진 가져오기 아이콘**은 현재 검색·분류·즐겨찾기 조건에 맞는 장소 중 사진이 없는 항목만 순서대로 가져옵니다. 이미 설정된 기본 사진·직접 지정한 사진은 덮어쓰지 않습니다. **장소 수정 → 사진 주소 옆 사진 가져오기 아이콘**으로 한 장소만 가져올 수도 있습니다. 카드와 일정에는 Google Maps 출처를, 장소 상세에는 제공자와 원본 링크를 표시합니다.

Google Cloud에서 Places API (New)와 결제를 활성화하고, 서버 사진 조회용 키를 `.env.local`에 `GOOGLE_PLACES_API_KEY`로 입력합니다. 기존 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`는 브라우저 지도용이며 서버용 키로 자동 재사용하지 않습니다. 사진 키에는 `NEXT_PUBLIC_`를 붙이지 않고 API 제한을 Places API (New)로 지정하세요. 환경 변수를 바꾼 뒤 개발 서버를 재시작합니다. Text Search는 위치·사진 필드만 요청하며 평점 등은 가져오지 않습니다. 기본 새 사진 조회 한도는 UTC 기준 일일 50회이며 `GOOGLE_PHOTO_DAILY_LIMIT`로 0~200 범위에서 변경할 수 있습니다. 성공한 사진 한 장은 일반적으로 장소 조회와 사진 조회를 각 1회 사용하며, 이미지 리디렉션 요청이 추가될 수 있습니다. Google Cloud 자체 할당량도 설정하세요. 앱의 한도는 청구 금액 상한을 보장하지 않습니다.

**여행 설정 → 저장 사진 전체 삭제**는 확인 후 가져온 사진 파일·미리보기 캐시·사진 없는 조회 캐시와 여행의 저장 사진 참조만 삭제합니다. 장소·일정·준비물과 기본 사진은 유지하며 자동 삭제는 하지 않습니다. 삭제 후 다시 가져오면 새 API 요청이 발생합니다. API 사용량 기록은 삭제하지 않습니다.

현재 기능은 로컬 저장 전용입니다. Vercel/공유 모드에서는 API 조회와 임시 파일 저장을 하지 않으므로 배포 전에 별도의 영구 사진 저장소 연결이 필요합니다. 여행 JSON에는 사진 주소와 출처만 포함되며 실제 이미지 파일은 들어 있지 않습니다. 다른 컴퓨터나 배포 환경에 JSON만 옮기면 저장 사진은 복원되지 않습니다. 개인 사진 파일과 API 키는 공개 GitHub에 업로드하지 않습니다.

**약관 주의:** Google Places의 저장·캐싱 제한은 개인 사용이나 여행 후 삭제 계획으로 면제되지 않습니다. 이 저장 기능의 제공은 해당 사용이 Google 약관상 허용됨을 의미하지 않습니다. 사용 전에 사진 이용 권한과 관련 조건을 확인하세요.

- [Places API 설정](https://developers.google.com/maps/documentation/places/web-service/get-api-key)
- [사진 API](https://developers.google.com/maps/documentation/places/web-service/place-photos)
- [Google Places 저장 정책](https://developers.google.com/maps/documentation/places/web-service/policies)

일정의 화살표 아이콘, 지도 아래 **길안내**, 장소 카드·상세의 **길안내**는 현재 기기 위치를 출발점으로 Google Maps를 엽니다. 장소 상세에서 자동차·도보·대중교통을 선택할 수 있습니다. Google Maps 앱이 없거나 현재 위치를 사용할 수 없으면 웹 또는 경로 미리보기로 열릴 수 있습니다. 앱 내 음성 안내나 실제 도로 경로 계산 기능은 아닙니다. 이 길안내 링크에는 별도의 API 키가 필요하지 않습니다. [Google Maps URL 공식 안내](https://developers.google.com/maps/documentation/urls/get-started)

링크 해석 API는 가족 로그인과 동일 출처 요청을 확인하며, 짧은 링크의 모든 리디렉션을 Google 지도 도메인으로 제한합니다. 비밀 키와 로그인 쿠키를 Google에 전달하지 않습니다.

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
