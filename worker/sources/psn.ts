import { exchangeAccessCodeForAuthTokens, exchangeNpssoForAccessCode, getUserPlayedGames } from "psn-api";
import type { PlaytimeItem } from "../db";

/** "PT228H56M33S" (ou "P1DT2H") → minutes. */
export function durationToMinutes(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return Math.floor(Number(d) * 1440 + Number(h) * 60 + Number(min) + Number(s) / 60);
}

/** Le NPSSO reste côté serveur : il n'est ni journalisé ni renvoyé. */
export async function fetchPsn(npsso: string): Promise<PlaytimeItem[]> {
  const code = await exchangeNpssoForAccessCode(npsso);
  const { accessToken } = await exchangeAccessCodeForAuthTokens(code);
  const items: PlaytimeItem[] = [];
  for (let offset = 0; ; ) {
    const page = await getUserPlayedGames({ accessToken }, "me", { limit: 200, offset });
    for (const t of page.titles) {
      items.push({
        // Le concept regroupe les versions PS4 et PS5 d'un même jeu.
        externalId: t.concept?.id ? `concept:${t.concept.id}` : `title:${t.titleId}`,
        name: t.concept?.name || t.name,
        minutes: durationToMinutes(t.playDuration),
        lastPlayed: t.lastPlayedDateTime ?? null,
        cover: t.imageUrl || null,
      });
    }
    offset += page.titles.length;
    if (!page.titles.length || offset >= page.totalItemCount) break;
  }
  return items;
}
