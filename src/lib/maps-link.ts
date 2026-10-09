export type GoogleMapsPlaceDraft = { name: string; googleMapsUrl: string; lat?: number; lng?: number };

export class MapsLinkError extends Error {
  constructor(message = "Google 지도의 장소 공유 링크를 입력해주세요.") {
    super(message);
    this.name = "MapsLinkError";
  }
}

const googleHosts = new Set([
  "google.com", "www.google.com", "maps.google.com",
  "google.co.jp", "www.google.co.jp", "maps.google.co.jp",
  "google.co.kr", "www.google.co.kr", "maps.google.co.kr",
]);

export function googleMapsLinkUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new MapsLinkError(); }
  if (url.href.length > 2048 || url.protocol !== "https:" || url.username || url.password || url.port) throw new MapsLinkError();
  const short = (url.hostname === "maps.app.goo.gl" && /^\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname))
    || (url.hostname === "goo.gl" && /^\/maps\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname));
  const maps = googleHosts.has(url.hostname) && (/^\/maps(?:\/|$)/.test(url.pathname)
    || (url.hostname.startsWith("maps.") && url.pathname === "/"));
  if (!short && !maps) throw new MapsLinkError();
  if (/^\/maps\/dir(?:\/|$)/.test(url.pathname)) throw new MapsLinkError("경로 링크 대신 목적지의 장소 공유 링크를 입력해주세요.");
  return url;
}

export function isShortMapsLink(url: URL): boolean {
  return url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl";
}

function coordinates(value: string): { lat: number; lng: number } | undefined {
  const match = value.match(/^(?:loc:)?\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/i);
  if (!match) return;
  const lat = Number(match[1]), lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new MapsLinkError("장소 좌표를 확인할 수 없습니다. 다른 공유 링크를 입력해주세요.");
  return { lat, lng };
}

export function parseGoogleMapsLink(input: string): GoogleMapsPlaceDraft {
  const url = googleMapsLinkUrl(input);
  if (isShortMapsLink(url)) return { name: "", googleMapsUrl: url.href };
  let pathName: string, data: string;
  try {
    const segments = url.pathname.split("/");
    const namedPath = segments[1] === "maps" && (segments[2] === "place" || segments[2] === "search");
    const segment = namedPath ? segments[3] || "" : "";
    pathName = decodeURIComponent(segment.replace(/\+/g, " "));
    const pathData = segments.slice(namedPath ? 4 : 2).find((part) => part.startsWith("data="))?.slice(5) || "";
    data = `${decodeURIComponent(pathData)}${url.searchParams.get("data") || ""}`;
  } catch { throw new MapsLinkError(); }
  const query = url.searchParams.get("query") || url.searchParams.get("q") || "";
  const name = (coordinates(pathName) ? "" : pathName) || (coordinates(query) ? "" : query);
  // @lat,lng is the camera center, not necessarily the place's coordinates.
  const pins = [...data.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  const pin = pins.at(-1);
  const location = pin ? coordinates(`${pin[1]},${pin[2]}`) : coordinates(query) || coordinates(pathName);
  if (!location && !name.trim()) throw new MapsLinkError("이 링크에서 장소를 찾을 수 없습니다. 장소의 공유 링크를 입력해주세요.");
  return { name: name.trim().slice(0, 120), googleMapsUrl: url.href, ...location };
}
