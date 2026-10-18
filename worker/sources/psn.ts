import {
  exchangeAccessCodeForAuthTokens,
  exchangeNpssoForAccessCode,
  getPurchasedGames,
  getTitleTrophies,
  getUserPlayedGames,
  getUserTitles,
  getUserTrophiesEarnedForTitle,
  type TrophyTitle,
} from "psn-api";
import type { PlaytimeItem } from "../db";
import type { FetchedTrophy } from "../trophies";

export type PsnAuth = { accessToken: string };

/** psn-api renvoie le JSON d'erreur de Sony tel quel au lieu de lever une exception. */
const errorOf = (body: unknown) => (body as { error?: { message?: string } })?.error?.message ?? "réponse inattendue";

const french = { "Accept-Language": "fr-FR" };

/** "PT228H56M33S" (ou "P1DT2H") → minutes. */
export function durationToMinutes(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [, d = "0", h = "0", min = "0", s = "0"] = m;
  return Math.floor(Number(d) * 1440 + Number(h) * 60 + Number(min) + Number(s) / 60);
}

/** Le NPSSO reste côté serveur : il n'est ni journalisé ni renvoyé. 2 appels. */
export async function psnAuth(npsso: string): Promise<PsnAuth> {
  const code = await exchangeNpssoForAccessCode(npsso);
  const { accessToken } = await exchangeAccessCodeForAuthTokens(code);
  return { accessToken };
}

/** Jeux lancés au moins une fois, avec le temps de jeu. */
export async function fetchPsnPlayed(auth: PsnAuth): Promise<PlaytimeItem[]> {
  const items: PlaytimeItem[] = [];
  for (let offset = 0; ; ) {
    const page = await getUserPlayedGames(auth, "me", { limit: 200, offset });
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

/** Jeux achetés ou récupérés (PS4 et PS5), même jamais lancés. Temps à 0 : il vient de fetchPsnPlayed. */
export async function fetchPsnPurchased(auth: PsnAuth): Promise<PlaytimeItem[]> {
  const items: PlaytimeItem[] = [];
  const size = 300;
  for (let start = 0; start < 3000; start += size) {
    const res = await getPurchasedGames(auth, { size, start });
    const games = res.data?.purchasedTitlesRetrieve?.games ?? [];
    for (const g of games) {
      if (g.isPreOrder) continue;
      items.push({
        externalId: g.conceptId ? `concept:${g.conceptId}` : `title:${g.titleId}`,
        name: g.name,
        minutes: 0,
        cover: g.image?.url || null,
      });
    }
    if (games.length < size) break;
  }
  return items;
}

/** Liste des jeux à trophées avec la progression de chacun (un seul appel pour 800 jeux). */
export async function fetchPsnTrophyTitles(auth: PsnAuth): Promise<TrophyTitle[]> {
  const titles: TrophyTitle[] = [];
  for (let offset = 0; ; ) {
    const page = await getUserTitles(auth, "me", { limit: 800, offset, headerOverrides: french });
    if (!Array.isArray(page.trophyTitles)) throw new Error(`PSN trophées : ${errorOf(page)}`);
    titles.push(...page.trophyTitles);
    offset += page.trophyTitles.length;
    if (!page.trophyTitles.length || offset >= page.totalItemCount) break;
  }
  return titles.filter((t) => !t.hiddenFlag);
}

/** "Uncharted 4 Trophies" → "Uncharted 4" : les vieux jeux ont ce suffixe dans leur liste de trophées. */
export const trophyTitleName = (name: string) => name.replace(/\s+(trophies|trophy set|trophées)$/i, "").trim();

/** Détail des trophées d'un jeu : noms en français et rareté. 2 appels. */
export async function fetchPsnTrophies(auth: PsnAuth, npCommunicationId: string, service: "trophy" | "trophy2"): Promise<FetchedTrophy[]> {
  const options = { npServiceName: service, headerOverrides: french };
  const [defs, earned] = await Promise.all([
    getTitleTrophies(auth, npCommunicationId, "all", options),
    getUserTrophiesEarnedForTitle(auth, "me", npCommunicationId, "all", options),
  ]);
  if (!Array.isArray(defs.trophies) || !Array.isArray(earned.trophies)) throw new Error(`PSN trophées : ${errorOf(defs.trophies ? earned : defs)}`);
  const progress = new Map(earned.trophies.map((t) => [t.trophyId, t]));
  return defs.trophies.map((d) => {
    const p = progress.get(d.trophyId);
    const rarity = p?.trophyEarnedRate !== undefined ? Number(p.trophyEarnedRate) : NaN;
    return {
      id: String(d.trophyId),
      name: d.trophyName || "Trophée caché",
      description: d.trophyDetail ?? null,
      icon: d.trophyIconUrl ?? null,
      grade: d.trophyType,
      hidden: Boolean(d.trophyHidden),
      earnedAt: p?.earned ? (p.earnedDateTime ?? "1970-01-01T00:00:00.000Z") : null,
      rarity: Number.isFinite(rarity) ? rarity : null,
    };
  });
}
