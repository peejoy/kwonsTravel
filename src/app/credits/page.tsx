const photos = [
  { name: "아메리칸 빌리지", author: "Lee Geonju", file: "American_Village_in_Okinawa.jpg", license: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  { name: "국제거리", author: "663highland", file: "Kokusai-dori08s3s4440.jpg", license: "CC BY 2.5", url: "https://creativecommons.org/licenses/by/2.5/" },
  { name: "츄라우미 수족관", author: "Daryan Shamkhali", file: "Okinawa_Churaumi_Aquarium,_Motobu-chō,_Japan_(Unsplash).jpg", license: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  { name: "아라하 비치", author: "Abasaa", file: "Araha_Beach.JPG", license: "Public domain", url: "https://commons.wikimedia.org/wiki/File:Araha_Beach.JPG" },
  { name: "비세 후쿠기 가로수길", author: "Abasaa", file: "Bise_Fukugi_Tree_Road_01.JPG", license: "Public domain", url: "https://commons.wikimedia.org/wiki/File:Bise_Fukugi_Tree_Road_01.JPG" },
  { name: "에메랄드 비치", author: "Abasaa", file: "Okinawa_Emerald_Beach.JPG", license: "Public domain", url: "https://commons.wikimedia.org/wiki/File:Okinawa_Emerald_Beach.JPG" },
  { name: "후쿠슈엔", author: "LordAmeth", file: "Fukushuen_Garden.JPG", license: "CC BY-SA 3.0", url: "https://creativecommons.org/licenses/by-sa/3.0/" },
];
export default function Credits() {
  return <main className="credits-page"><a href="/">여행으로 돌아가기</a><h1 style={{ marginTop: 25 }}>사진 출처</h1><p>사진은 웹 표시를 위해 크기를 줄였으며, 화면에 따라 일부가 잘려 보일 수 있습니다. 사진의 라이선스는 앱 코드와 별도로 적용됩니다.</p>{photos.map((photo) => <section key={photo.name}><h2>{photo.name}</h2><p>사진: {photo.author}<br /><a href={`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.file)}`} target="_blank" rel="noopener noreferrer">Wikimedia Commons 원본</a><br /><a href={photo.url} target="_blank" rel="noopener noreferrer">{photo.license}</a></p></section>)}</main>;
}
