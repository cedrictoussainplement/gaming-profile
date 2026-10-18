// Source unique des données du profil.
// V1 : données statiques recopiées depuis l'inventaire des comptes.
// V2 : ce fichier sera remplacé par des données live (Steam, PSN, Playnite…)
// qui respectent les mêmes types.
//
// Uniquement des infos publiques : jamais d'identifiant de connexion,
// d'e-mail ou de jeton ici.

export type PlatformId =
  | "steam"
  | "playstation"
  | "epic"
  | "ea"
  | "ubisoft"
  | "riot"
  | "battlenet"
  | "rockstar"
  | "tarkov"
  | "clash"
  | "gamecenter";

export type Role = "main" | "smurf";

/** Comment les heures arriveront en V2. */
export type SyncSource = "api" | "playnite" | "import" | "none";

export interface Account {
  id: string;
  handle: string;
  role: Role;
  /** Précision affichée sous le pseudo (mode de jeu, plateforme…). */
  label?: string;
  url?: string;
  /** Rempli en V2. */
  hours?: number;
}

export interface Platform {
  id: PlatformId;
  name: string;
  group: "pc" | "console" | "mobile";
  sync: SyncSource;
  games?: string[];
  accounts: Account[];
}

export interface Tracker {
  id: string;
  game: string;
  account: string;
  platform: string;
  role: Role;
  url: string;
  /** Deux couleurs pour la vignette du jeu (pas d'image officielle). */
  colors: [string, string];
}

export interface CommunityLink {
  id: string;
  name: string;
  handle: string;
  url: string;
}

export interface Profile {
  gamertag: string;
  tagline: string;
  platforms: Platform[];
  trackers: Tracker[];
  community: CommunityLink[];
}

export const profile: Profile = {
  gamertag: "reask",
  tagline: "FPS, battle royale et extraction shooters, sur PC et PS5.",
  platforms: [
    {
      id: "steam",
      name: "Steam",
      group: "pc",
      sync: "api",
      accounts: [
        { id: "steam-ogreask", handle: "ogreask", role: "main", url: "https://steamcommunity.com/id/ogreask/" },
        { id: "steam-reask_oner", handle: "reask_oner", role: "smurf", url: "https://steamcommunity.com/id/reask_oner" },
      ],
    },
    {
      id: "playstation",
      name: "PlayStation",
      group: "console",
      sync: "api",
      accounts: [
        { id: "psn-fr__eask_", handle: "fr__eask_", role: "main", url: "https://psnprofiles.com/fr__eask_" },
        { id: "psn-fr_reask", handle: "fr_reask", role: "smurf", url: "https://psnprofiles.com/fr_reask" },
      ],
    },
    {
      id: "epic",
      name: "Epic Games",
      group: "pc",
      sync: "playnite",
      games: ["Fortnite"],
      accounts: [
        { id: "epic-ogreask", handle: "ogreask", role: "main", url: "https://fortnitetracker.com/profile/all/ogreask" },
        { id: "epic-reask_oner", handle: "reask_oner", role: "smurf", url: "https://fortnitetracker.com/profile/all/reask_oner" },
      ],
    },
    {
      id: "ea",
      name: "EA app",
      group: "pc",
      sync: "playnite",
      games: ["Battlefield 2042", "Apex Legends"],
      accounts: [{ id: "ea-reask_oner", handle: "reask_oner", role: "main" }],
    },
    {
      id: "ubisoft",
      name: "Ubisoft Connect",
      group: "pc",
      sync: "playnite",
      games: ["Rainbow Six Siege"],
      accounts: [{ id: "ubisoft-reask_oner", handle: "reask_oner", role: "main" }],
    },
    {
      id: "riot",
      name: "Riot Games",
      group: "pc",
      sync: "playnite",
      games: ["Valorant"],
      accounts: [{ id: "riot-reask", handle: "reask#2736", role: "main" }],
    },
    {
      id: "battlenet",
      name: "Battle.net",
      group: "pc",
      sync: "playnite",
      accounts: [{ id: "battlenet-reask", handle: "reask#21834", role: "main" }],
    },
    {
      id: "rockstar",
      name: "Rockstar Games",
      group: "pc",
      sync: "none",
      games: ["GTA V"],
      accounts: [
        {
          id: "rockstar-fr_reask",
          handle: "fr_reask",
          role: "main",
          label: "Lié au PSN fr__eask_",
          url: "https://socialclub.rockstargames.com/member/fr_reask",
        },
      ],
    },
    {
      id: "tarkov",
      name: "Escape from Tarkov",
      group: "pc",
      sync: "import",
      accounts: [
        { id: "tarkov-regular", handle: "reask0ner", role: "main", label: "PvP classique", url: "#tarkov" },
        { id: "tarkov-pve", handle: "reask0ner", role: "main", label: "PvE", url: "#tarkov" },
        { id: "tarkov-season", handle: "reask0ner", role: "main", label: "PvP saison", url: "#tarkov" },
        { id: "tarkov-arena", handle: "reask0ner", role: "main", label: "Arena", url: "#tarkov" },
      ],
    },
    {
      id: "clash",
      name: "Clash of Clans",
      group: "mobile",
      sync: "api",
      accounts: [
        { id: "coc-eask", handle: "eask", role: "main", label: "#8GR2UC8L", url: "https://clashofstats.com/fr/players/eask-8GR2UC8L" },
      ],
    },
    {
      id: "gamecenter",
      name: "Game Center",
      group: "mobile",
      sync: "none",
      accounts: [{ id: "gc-cece_tsst", handle: "cece_tsst", role: "main" }],
    },
  ],
  trackers: [
    { id: "apex-psn", game: "Apex Legends", account: "fr__eask_", platform: "PS5", role: "main", url: "https://apex.tracker.gg/apex/profile/psn/fr__eask_/overview", colors: ["#da292a", "#5a1012"] },
    { id: "apex-psn-smurf", game: "Apex Legends", account: "fr_reask", platform: "PS5", role: "smurf", url: "https://apex.tracker.gg/apex/profile/psn/fr_reask/overview", colors: ["#da292a", "#5a1012"] },
    { id: "apex-pc", game: "Apex Legends", account: "reask_oner", platform: "PC", role: "main", url: "https://apex.tracker.gg/apex/profile/origin/reask_oner/overview", colors: ["#da292a", "#5a1012"] },
    { id: "bf2042", game: "Battlefield 2042", account: "reask_oner", platform: "PC", role: "main", url: "https://battlefieldtracker.com/bf2042/profile/origin/reask_oner/overview", colors: ["#1f6fb2", "#0b1d33"] },
    { id: "bfv", game: "Battlefield V", account: "reask_oner", platform: "PC", role: "main", url: "https://battlefieldtracker.com/bfv/profile/origin/reask_oner/overview", colors: ["#c77d2e", "#2a1a0b"] },
    { id: "bf4", game: "Battlefield 4", account: "reask_oner", platform: "PC", role: "main", url: "https://gametools.network/stats/pc/name/reask_oner?game=bf4", colors: ["#e0a526", "#1d2a33"] },
    { id: "r6", game: "Rainbow Six Siege", account: "reask_oner", platform: "PC", role: "main", url: "https://r6.tracker.network/r6siege/profile/ubi/reask_oner/overview", colors: ["#3a4a5c", "#0e141b"] },
    { id: "cs2", game: "Counter-Strike 2", account: "reask_oner", platform: "PC", role: "smurf", url: "https://tracker.gg/cs2/profile/steam/76561199388154157", colors: ["#de9b35", "#1c2733"] },
    { id: "fortnite", game: "Fortnite", account: "ogreask", platform: "PC · PS5", role: "main", url: "https://fortnitetracker.com/profile/all/ogreask", colors: ["#9d4dbb", "#2b6fe0"] },
    { id: "fortnite-smurf", game: "Fortnite", account: "reask_oner", platform: "PC · PS5", role: "smurf", url: "https://fortnitetracker.com/profile/all/reask_oner", colors: ["#9d4dbb", "#2b6fe0"] },
    { id: "otg", game: "Off the Grid", account: "fr__eask_", platform: "PS5", role: "main", url: "https://tracker.gg/off-the-grid/profile/psn/fr__eask_/overview?gamemode=extraction-royale-trios", colors: ["#16a37f", "#0b2a2a"] },
    { id: "wardogs", game: "WARDOGS", account: "reask#1160", platform: "PC", role: "main", url: "https://wardogs.tools/player/68d18de7-dc5d-4613-b91b-dcb8fb512fe3", colors: ["#7a8b3c", "#1d2412"] },
    { id: "valorant", game: "Valorant", account: "reask#2736", platform: "PC", role: "main", url: "https://tracker.gg/valorant/profile/riot/reask%232736", colors: ["#ff4655", "#0f1923"] },
  ],
  community: [
    { id: "twitch", name: "Twitch", handle: "reask0ner", url: "https://www.twitch.tv/reask0ner" },
    { id: "discord", name: "Discord", handle: "reask_oner", url: "https://discord.com/users/reask_oner" },
    { id: "playtracker", name: "PlayTracker", handle: "reask", url: "https://playtracker.net/profile/reask" },
    { id: "linktree-ogreask", name: "Linktree", handle: "ogreask", url: "https://linktr.ee/ogreask" },
    { id: "linktree-reask_oner", name: "Linktree", handle: "reask_oner", url: "https://linktr.ee/reask_oner" },
  ],
};
