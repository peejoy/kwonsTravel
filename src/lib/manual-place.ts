import { placeSchema, type Category } from "./model";
import { googleMapsLinkUrl } from "./maps-link";

export type ManualPlaceFields = {
  id: string; name: string; area: string; description: string; notes: string;
  lat: string; lng: string; category: Category; favorite: boolean; mapLink: string;
};

export function manualPlace(fields: ManualPlaceFields) {
  if (!fields.lat.trim() || !fields.lng.trim()) throw new Error("지도에서 위치를 선택하거나 위도·경도를 입력해주세요.");
  const googleMapsUrl = fields.mapLink.trim() ? googleMapsLinkUrl(fields.mapLink).href : "";
  const result = placeSchema.safeParse({ ...fields, lat: Number(fields.lat), lng: Number(fields.lng), googleMapsUrl, image: "", link: "" });
  if (!result.success) throw new Error("장소 이름과 위치, 입력 정보를 확인해주세요.");
  return result.data;
}
