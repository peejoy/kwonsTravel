import type { Place, TripState } from "./model";

const place = (id: string, name: string, category: Place["category"], area: string, lat: number, lng: number, description: string, image = "", favorite = false): Place => ({
  id, name, category, area, lat, lng, description, image, favorite, notes: "", link: "",
});
export function createSeed(): TripState {
  return {
    version: 0,
    trip: { title: "우리 가족의 오키나와", startDate: "", days: 4, travelers: null, notes: "4일 일정 초안입니다. 항공편과 숙소에 맞춰 자유롭게 바꿔보세요." },
    places: [
      place("naha-airport", "나하 공항", "transport", "나하", 26.2064, 127.646, "오키나와 여행의 시작과 끝. 항공편 시간을 메모해두세요."),
      place("kokusai", "국제거리", "sight", "나하", 26.214, 127.6812, "첫날은 가볍게, 나하의 골목과 상점을 둘러보는 시간.", "/photos/kokusai.jpg", true),
      place("makishi", "마키시 공설시장", "food", "나하", 26.2146, 127.6854, "오키나와 식재료와 먹거리를 둘러볼 식사 후보. 영업 정보는 방문 전에 확인하세요."),
      place("fukushuen", "후쿠슈엔", "photo", "나하", 26.2178, 127.6743, "나하 도심에서 만나는 정원. 산책하며 가족사진을 남겨보세요.", "/photos/fukushuen.jpg"),
      place("american", "아메리칸 빌리지", "sight", "차탄", 26.3168, 127.7573, "바닷가 산책과 작은 가게들. 저녁에는 천천히 노을을 기다려요.", "/photos/american-village.jpg", true),
      place("araha", "아라하 비치", "photo", "차탄", 26.3047, 127.7584, "바다와 야자수를 배경으로 남기는 가족사진.", "/photos/araha.jpg"),
      place("sunset", "선셋 비치", "photo", "차탄", 26.3135, 127.7537, "해 질 무렵의 산책 후보. 일몰 시간과 날씨를 확인해보세요.", "", true),
      place("churaumi", "츄라우미 수족관", "sight", "모토부", 26.6943, 127.8779, "오키나와의 바다를 만나는 하루. 입장권과 운영 시간은 공식 안내를 확인하세요.", "/photos/aquarium.jpg", true),
      place("bise", "비세 후쿠기 가로수길", "photo", "모토부", 26.7042, 127.881, "나무 사이를 느리게 걷고, 조용한 골목에서 사진을 남겨요.", "/photos/bise.jpg", true),
      place("emerald", "에메랄드 비치", "photo", "모토부", 26.7015, 127.8772, "수족관 근처에서 잠깐 쉬어갈 바다.", "/photos/emerald.jpg"),
      place("shuri", "슈리성 공원", "sight", "나하", 26.217, 127.7195, "여행 마지막 날의 산책 후보. 개방 구역과 운영 정보를 확인하세요."),
      place("a-and-w", "A&W 나하 국제거리점", "food", "나하", 26.215, 127.6821, "버거와 루트비어를 맛볼 식사 후보. 위치와 영업 정보는 지도에서 확인하세요."),
    ],
    schedule: [
      ["s1", "naha-airport", 1, "12:00", 60, "항공편 도착 시간에 맞춰 수정"],
      ["s2", "makishi", 1, "14:00", 60, "늦은 점심, 시장 구경"],
      ["s3", "kokusai", 1, "15:30", 90, "가볍게 산책하고 기념품 둘러보기"],
      ["s4", "fukushuen", 1, "17:00", 45, "가족사진 남기기"],
      ["s5", "araha", 2, "10:00", 90, "바닷가 산책"],
      ["s6", "american", 2, "13:00", 180, "점심과 쇼핑, 카페"],
      ["s7", "sunset", 2, "17:00", 60, "노을 사진"],
      ["s8", "churaumi", 3, "10:00", 180, "입장권 예약 확인"],
      ["s9", "emerald", 3, "14:00", 60, "바다 보며 잠깐 쉬기"],
      ["s10", "bise", 3, "15:30", 90, "가로수길 산책"],
      ["s11", "shuri", 4, "10:00", 90, "공항 이동 시간을 여유 있게"],
      ["s12", "naha-airport", 4, "14:00", 120, "출발 항공편 시간에 맞춰 수정"],
    ].map(([id, placeId, day, time, duration, notes]) => ({ id: String(id), placeId: String(placeId), day: Number(day), time: String(time), duration: Number(duration), notes: String(notes), completed: false })),
    packing: [
      ["p1", "여권과 항공권 확인", "서류·예약"], ["p2", "숙소 예약 확인서", "서류·예약"],
      ["p3", "여행자 보험 확인", "서류·예약"], ["p4", "렌터카 예약·운전 서류 확인", "서류·예약"],
      ["p5", "편한 신발", "옷·생활"], ["p6", "여벌 옷과 수영복", "옷·생활"],
      ["p7", "모자와 자외선 차단제", "옷·생활"], ["p8", "충전기와 보조배터리", "전자기기"],
      ["p9", "일본용 전원 어댑터", "전자기기"], ["p10", "로밍 또는 eSIM 준비", "전자기기"],
      ["p11", "가족 상비약", "아이·가족"], ["p12", "간식과 물병", "아이·가족"],
    ].map(([id, label, category]) => ({ id, label, category: category as TripState["packing"][number]["category"], assignee: "", done: false })),
  };
}
