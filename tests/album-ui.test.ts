import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AlbumView from "@/components/album/album-view";
import { cancelReservation, uploadPrepared } from "@/lib/album/client";
import { emptyMetadata } from "@/lib/album/model";
import { MetadataFields } from "@/components/album/metadata-fields";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("offers album upload separately from place registration", () => {
  const html = renderToStaticMarkup(createElement(AlbumView, { places: [], onAuthRequired: () => {} }));
  expect(html).toContain("여행 앨범"); expect(html).toContain("사진 올리기");
});
it("uploads normalized bytes directly and finalizes only after upload succeeds", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://album.example");
  const order: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    order.push(url);
    if (url === "/api/album") { expect(JSON.parse(String(init.body)).metadata.lat).toBeNull(); return Response.json({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "https://album.example/storage/v1/object/upload/sign/family-travel-photos/photo?token=test", uploadExpiresAt: "2099-01-01T00:00:00Z" }); }
    if (url.startsWith("https:")) { expect(init.body).toBeInstanceOf(Blob); return Response.json({}); }
    return Response.json({ photo: { id: "result" } });
  });
  expect((await uploadPrepared(new Blob(["jpeg"]), emptyMetadata)).id).toBe("result");
  expect(order).toHaveLength(3); expect(order[2]).toContain("/finalize");
});
it("rejects an upload permission to an unrelated host", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://album.example");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "https://evil.example/image", uploadExpiresAt: "2099-01-01T00:00:00Z" })));
  await expect(uploadPrepared(new Blob(["jpeg"]), emptyMetadata)).rejects.toThrow(/업로드/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("reconciles a lost finalize response before cancelling a completed photo", async () => {
  const fetcher = vi.fn(async () => Response.json({ photo: { id: "ready-photo" } })); vi.stubGlobal("fetch", fetcher);
  expect(await cancelReservation({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "", uploadExpiresAt: "" })).toEqual({ photo: { id: "ready-photo" } });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps cancellation errors retryable instead of acknowledging deletion", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "pending" }, { status: 404 })).mockResolvedValueOnce(Response.json({ error: "사진 정리 실패" }, { status: 503 })));
  await expect(cancelReservation({ id: "11111111-1111-4111-8111-111111111111", revision: 0, uploadUrl: "", uploadExpiresAt: "" })).rejects.toMatchObject({ status: 503 });
});
it("ignores map picks while upload metadata is locked", () => {
  const changes = vi.fn();
  const view = MetadataFields({ value: emptyMetadata, onChange: changes, places: [], disabled: true });
  const children = view.props.children as ReactElement<{ onPick?: (lat: number, lng: number) => void }>[];
  const map = children.find((child) => typeof child?.props?.onPick === "function")!;
  map.props.onPick!(26.3, 127.7);
  expect(changes).not.toHaveBeenCalled();
});
