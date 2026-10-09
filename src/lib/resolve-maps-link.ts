import { googleMapsLinkUrl, isShortMapsLink, MapsLinkError, parseGoogleMapsLink, type GoogleMapsPlaceDraft } from "./maps-link";

export async function resolveGoogleMapsLink(input: string): Promise<GoogleMapsPlaceDraft> {
  let url = googleMapsLinkUrl(input);
  const signal = AbortSignal.timeout(8000);
  for (let redirects = 0; redirects < 5; redirects++) {
    if (!isShortMapsLink(url)) return parseGoogleMapsLink(url.href);
    let response: Response;
    try {
      response = await fetch(url.href, { redirect: "manual", cache: "no-store", signal });
    } catch {
      throw new MapsLinkError("공유 링크를 불러오지 못했습니다. 연결을 확인하고 다시 시도해주세요.");
    }
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (response.status < 300 || response.status >= 400 || !location) {
      throw new MapsLinkError("공유 링크를 펼치지 못했습니다. Google 지도에서 장소 링크를 다시 공유해주세요.");
    }
    // Validate each redirect before requesting it; never follow arbitrary URLs.
    url = googleMapsLinkUrl(new URL(location, url).href);
  }
  throw new MapsLinkError("공유 링크가 너무 많이 연결됩니다. 장소 링크를 다시 공유해주세요.");
}
