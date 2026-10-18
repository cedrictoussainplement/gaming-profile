"use client";

// Envoie chaque JSON tarkov.dev à POST /api/tarkov avec la clé INGEST_KEY.
// La clé reste dans ce navigateur (localStorage) seulement si la case est cochée.

import { useEffect, useState, type FormEvent } from "react";
import { tarkovModeLabel, tarkovModes, type TarkovMode } from "@/lib/tarkov";

const KEY_STORAGE = "ingest-key";

interface Result {
  mode: TarkovMode;
  ok: boolean;
  text: string;
}

export function TarkovImportForm() {
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [files, setFiles] = useState<Partial<Record<TarkovMode, File>>>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) {
        setKey(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (remember) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}

    setBusy(true);
    setResults([]);
    for (const mode of tarkovModes) {
      const file = files[mode];
      if (!file) continue;
      let result: Result;
      try {
        const res = await fetch(`/api/tarkov?mode=${mode}`, {
          method: "POST",
          headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
          body: await file.text(),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok) {
          const parts = [`${body.nickname}${body.level ? `, niveau ${body.level}` : ""} importé`];
          if (body.warning) parts.push(body.warning);
          if (body.hours && !body.hours.ok) parts.push(`heures non enregistrées : ${body.hours.error}`);
          result = { mode, ok: true, text: parts.join(". ") };
        } else {
          result = { mode, ok: false, text: body.error ?? `Erreur HTTP ${res.status}` };
        }
      } catch (err) {
        result = { mode, ok: false, text: err instanceof Error ? err.message : String(err) };
      }
      setResults((r) => [...r, result]);
    }
    setBusy(false);
  }

  const count = Object.values(files).filter(Boolean).length;

  return (
    <>
      <form className="card" onSubmit={submit}>
        <label>
          Clé d&apos;import (INGEST_KEY)
          <input type="password" required value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Se souvenir de la clé sur cet appareil
        </label>
        {tarkovModes.map((mode) => (
          <label key={mode}>
            {tarkovModeLabel[mode]}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => setFiles((f) => ({ ...f, [mode]: e.target.files?.[0] }))}
            />
          </label>
        ))}
        <button type="submit" disabled={busy || !key || count === 0}>
          {busy ? "Import en cours…" : count > 1 ? `Importer ${count} profils` : "Importer"}
        </button>
      </form>
      {results.length > 0 && (
        <ul className="import-results">
          {results.map((r) => (
            <li key={r.mode} className={r.ok ? "ok" : "err"}>
              {tarkovModeLabel[r.mode]} : {r.text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
