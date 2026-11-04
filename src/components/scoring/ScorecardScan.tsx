"use client";

import { Camera, CheckCircle2, ImagePlus, Loader2, ScanLine, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CardCamera } from "@/components/scoring/CardCamera";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import type { HoleDefinition } from "@/lib/scoring";
import type {
  ScorecardScanApply,
  ScorecardScanImage,
  ScorecardScanMode,
  ScorecardScanResult,
} from "@/lib/scoring/scan/types";

interface ScanPlayer {
  playerId: string;
  playerName: string;
}

interface ScorecardScanProps {
  tournamentId: string;
  players: readonly ScanPlayer[];
  holes: readonly HoleDefinition[];
  disabled?: boolean;
  onApply: (apply: ScorecardScanApply) => void;
}

type Phase = "idle" | "hashing" | "uploading" | "reading" | "ready" | "error";

const MAX_BYTES = 12 * 1024 * 1024;
const MIME_EXTENSIONS = ["image/jpeg", "image/png", "image/webp"];

function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest("SHA-256", buffer).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join(""),
  );
}

function confidenceLabel(value: number | null): string {
  if (value === null) return "Not read";
  if (value >= 0.95) return "High";
  if (value >= 0.8) return "Check";
  return "Low";
}

function confidenceClass(value: number | null): string {
  if (value === null) return "pill";
  if (value >= 0.95) return "pill ok";
  if (value >= 0.8) return "pill warn";
  return "pill bad";
}

export function ScorecardScan({
  tournamentId,
  players,
  holes,
  disabled = false,
  onApply,
}: ScorecardScanProps) {
  const [mode, setMode] = useState<ScorecardScanMode>("individual");
  const [playerId, setPlayerId] = useState(players[0]?.playerId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sha256, setSha256] = useState("");
  const [bytes, setBytes] = useState(0);
  const [mime, setMime] = useState("");
  const [image, setImage] = useState<ScorecardScanImage | null>(null);
  const [result, setResult] = useState<ScorecardScanResult | null>(null);
  const [rowIndex, setRowIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [captureKey, setCaptureKey] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!players.some((player) => player.playerId === playerId)) {
      setPlayerId(players[0]?.playerId ?? "");
    }
  }, [playerId, players]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const selectedResult = useMemo(() => {
    if (!result) return null;
    return (
      result.players.find((player) => player.rowIndex === rowIndex) ?? result.players[0] ?? null
    );
  }, [result, rowIndex]);

  const busy = phase === "hashing" || phase === "uploading" || phase === "reading";

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setSha256("");
    setBytes(0);
    setMime("");
    setImage(null);
    setResult(null);
    setRowIndex(0);
    setPhase("idle");
    setMessage("");
    setCaptureKey("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function chooseFile(selected: File | null) {
    if (!selected) return;
    if (!MIME_EXTENSIONS.includes(selected.type)) {
      setMessage("Use a JPEG, PNG or WebP photo.");
      setPhase("error");
      return;
    }
    if (selected.size <= 0 || selected.size > MAX_BYTES) {
      setMessage("The photo must be between 1 byte and 12 MB.");
      setPhase("error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setBytes(selected.size);
    setMime(selected.type);
    setImage(null);
    setResult(null);
    setPhase("hashing");
    setMessage("");
    try {
      const buffer = await selected.arrayBuffer();
      setSha256(await sha256Hex(buffer));
      setPhase("idle");
    } catch {
      setSha256("");
      setPhase("error");
      setMessage("The photo fingerprint could not be computed.");
    }
  }

  async function uploadAndRead() {
    if (!file || !tournamentId || !sha256) return;
    setPhase("uploading");
    setMessage("");
    try {
      const presign = await fetch("/api/scoring/scan/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          mime,
          bytes,
          sha256,
        }),
      });
      const upload = (await presign.json()) as {
        ok?: boolean;
        message?: string;
        key?: string;
        uploadUrl?: string;
        headers?: Record<string, string>;
      };
      if (!presign.ok || !upload.ok || !upload.key || !upload.uploadUrl) {
        setPhase("error");
        setMessage(upload.message ?? "The photo could not be uploaded.");
        return;
      }

      const put = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.headers,
        body: file,
      });
      if (!put.ok) {
        setPhase("error");
        setMessage(`The photo upload failed (${put.status}).`);
        return;
      }

      const uploaded: ScorecardScanImage = {
        path: upload.key,
        sha256,
        mime,
        bytes,
        previewUrl: previewUrl ?? "",
      };
      setImage(uploaded);
      setCaptureKey(crypto.randomUUID());
      setPhase("reading");

      const extract = await fetch("/api/scoring/scan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId,
          key: upload.key,
          mode,
          template: "igcc-paper",
        }),
      });
      const extracted = (await extract.json()) as {
        ok?: boolean;
        available?: boolean;
        message?: string;
        result?: ScorecardScanResult;
      };
      if (!extract.ok || !extracted.ok) {
        setPhase("error");
        setMessage(extracted.message ?? "The card reader could not read the photo.");
        return;
      }
      if (!extracted.available || !extracted.result) {
        setPhase("ready");
        setMessage(
          extracted.message ?? "The photo is saved. Enter the scores below and submit the card.",
        );
        return;
      }
      setResult(extracted.result);
      setRowIndex(extracted.result.players[0]?.rowIndex ?? 0);
      setPhase("ready");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "The scan failed.");
    }
  }

  function apply() {
    if (!playerId) {
      setMessage("Choose the player whose card this is.");
      setPhase("error");
      return;
    }
    const strokes: Record<number, string> = {};
    const confidence: Record<number, number | null> = {};
    if (selectedResult) {
      for (const hole of selectedResult.holes) {
        strokes[hole.hole] = hole.strokes === null ? "" : String(hole.strokes);
        confidence[hole.hole] = hole.confidence;
      }
    }
    onApply({
      playerId,
      strokes,
      confidence,
      image,
      extraction: result
        ? { engine: result.engine, engineVersion: result.engineVersion, raw: result.raw }
        : null,
      captureKey: captureKey || crypto.randomUUID(),
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="field min-w-[14rem]">
          <span>Card type</span>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value as ScorecardScanMode)}
            disabled={busy || disabled}
          >
            <option value="individual">Individual card</option>
            <option value="group">Group sheet</option>
          </select>
        </label>
        {/* A typed search, not a plain dropdown: an event can carry more than a hundred players. */}
        <Combobox
          label="Player"
          className="min-w-[16rem] flex-1"
          value={playerId}
          options={players.map((player) => ({ id: player.playerId, label: player.playerName }))}
          onChange={setPlayerId}
          placeholder="Type a player's name"
          emptyMessage="No player in this round matches that name."
          disabled={busy || disabled || players.length === 0}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* No `capture` attribute: the camera is the app's own window, and this input is the
            "upload a photo" choice inside it. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)}
          disabled={busy || disabled}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCameraOpen(true)}
          disabled={busy || disabled}
        >
          <Camera className="size-4" aria-hidden="true" />
          Take photo
        </Button>
        {file && (
          <>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void uploadAndRead()}
              disabled={busy || disabled || !sha256}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="size-4" aria-hidden="true" />
              )}
              {phase === "reading" ? "Reading card…" : "Upload and read"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={reset}
              disabled={busy || disabled}
            >
              Clear
            </Button>
          </>
        )}
        {!file && (
          <span className="hint">
            <ImagePlus className="mr-1 inline size-4" aria-hidden="true" />A clear, flat photo.
            Include all 18 holes.
          </span>
        )}
      </div>

      {message && (
        <p className={phase === "error" ? "notice bad" : "notice info"} role="status">
          {message}
        </p>
      )}

      {previewUrl && (
        <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="overflow-hidden rounded-md border border-line bg-surface-sunken">
            <img
              src={previewUrl}
              alt="Uploaded scorecard"
              className="max-h-[28rem] w-full object-contain"
            />
          </div>
          <div className="grid content-start gap-2">
            {selectedResult ? (
              <>
                {result && result.players.length > 1 && (
                  <label className="field max-w-xs">
                    <span>Player row on the card</span>
                    <select
                      value={rowIndex}
                      onChange={(event) => setRowIndex(Number(event.target.value))}
                      disabled={busy}
                    >
                      {result.players.map((row) => (
                        <option key={row.rowIndex} value={row.rowIndex}>
                          Row {row.rowIndex + 1}
                          {row.name ? ` · ${row.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Hole</th>
                        <th>Read</th>
                        <th>Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.holes.map((hole) => {
                        const definition = holes.find(
                          (candidate) => candidate.number === hole.hole,
                        );
                        return (
                          <tr key={hole.hole}>
                            <td>
                              H{hole.hole}
                              {definition ? ` · par ${definition.par}` : ""}
                            </td>
                            <td className="mono">{hole.strokes ?? "—"}</td>
                            <td>
                              <span className={confidenceClass(hole.confidence)}>
                                {confidenceLabel(hole.confidence)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="hint">
                  Read total{" "}
                  <b className="mono">
                    {selectedResult.holes.reduce((sum, hole) => sum + (hole.strokes ?? 0), 0)}
                  </b>
                  . Check every value against the photo before submitting.
                </p>
              </>
            ) : (
              <div className="notice info">
                <b>Use the photo with manual entry. </b>
                Enter the scores in the card form, then submit. The original photo stays attached.
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={apply}
                disabled={busy || disabled || !playerId || !image}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Use with card
              </Button>
            </div>
          </div>
        </div>
      )}

      {!file && (
        <p className="hint">
          <ScanLine className="mr-1 inline size-4" aria-hidden="true" />
          Take photo opens this device's camera and lists every camera it finds. Upload a photo is a
          button in the same window. The card reader is optional: if it is unavailable, the photo
          can still be attached and the scores entered by hand.
        </p>
      )}

      {cameraOpen && (
        <CardCamera
          onCapture={(captured) => {
            setCameraOpen(false);
            void chooseFile(captured);
          }}
          onUpload={() => {
            setCameraOpen(false);
            // Still inside the click that asked for it, so the file picker opens.
            inputRef.current?.click();
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
