"use client";

// Envoie les stats recopiées à la main à POST /api/trackers/import avec la clé INGEST_KEY.
// Même clé mémorisée que la page d'import Tarkov.

import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { profile } from "@/data/profile";
import type { TrackersResponse } from "@/lib/trackers";

const KEY_STORAGE = "ingest-key";

const parseLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.match(/^\s*([^:]+?)\s*:\s*(.+?)\s*$/))
    .flatMap((m) => (m ? [{ label: m[1], value: m[2] }] : []));

export function StatsImportForm() {
  const params = useSearchParams();
  const [id, setId] = useState(params.get("id") ?? "otg");
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [headline, setHeadline] = useState("");
  const [lines, setLines] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORAGE);
      if (saved) {
        setKey(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  // Reprend la saisie précédente du tracker choisi pour ne modifier que ce qui a changé.
  useEffect(() => {
    fetch("/api/trackers")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: TrackersResponse | null) => {
        const s = body?.trackers.find((t) => t.id === id)?.summary;
        setHeadline(s?.headline ?? "");
        setLines(s ? s.highlights.map((h) => `${h.label} : ${h.value}`).join("\n") : "");
      })
      .catch(() => {});
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (remember) localStorage.setItem(KEY_STORAGE, key);
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/trackers/import?id=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ headline, stats: parseLines(lines) }),
      });
      const body = await res.json().catch(() => ({}));
      setResult(res.ok ? { ok: true, text: `${body.summary.highlights.length} stats enregistrées.` } : { ok: false, text: body.error ?? `Erreur HTTP ${res.status}` });
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) });
    }
    setBusy(false);
  }

  const tracker = profile.trackers.find((t) => t.id === id);

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
        <label>
          Tracker
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {profile.trackers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.game} · {t.account} ({t.platform})
              </option>
            ))}
          </select>
        </label>
        {tracker && (
          <p>
            <a href={tracker.url} target="_blank" rel="noopener noreferrer">
              Ouvrir la page du tracker
            </a>
          </p>
        )}
        <label>
          Rang ou titre (facultatif)
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Diamant 2" />
        </label>
        <label>
          Stats, une par ligne
          <textarea rows={8} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={"Victoires : 42\nK/D : 1,8\nParties : 310"} />
        </label>
        <button type="submit" disabled={busy || !key || parseLines(lines).length === 0}>
          {busy ? "Envoi…" : "Enregistrer"}
        </button>
      </form>
      {result && (
        <ul className="import-results">
          <li className={result.ok ? "ok" : "err"}>{result.text}</li>
        </ul>
      )}
    </>
  );
}
