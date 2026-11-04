"use client";

import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CARD_ASPECT, cardCaptureWidth, cardFrame } from "@/lib/scoring/scan/frame";

interface CardCameraProps {
  /** The captured, cropped photo, ready for the existing upload path. */
  onCapture: (file: File) => void;
  /** Leave the camera and open the file picker instead. */
  onUpload: () => void;
  onClose: () => void;
}

type Status = "starting" | "live" | "error";

/**
 * The camera window behind Take photo.
 *
 * It asks the browser for a video device and lists every camera it finds, so a laptop webcam, a USB
 * camera or (later) a dashcam can be chosen without extra app code. A card-shaped guide shows what
 * will be kept, and the capture is cropped to that guide before it leaves the browser. Upload is a
 * button in the same window, so a photo already on disk never needs the camera.
 *
 * Nothing is sent from here: the captured file goes through the existing fingerprint, upload and
 * read path in `ScorecardScan`.
 */
export function CardCamera({ onCapture, onUpload, onClose }: CardCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [message, setMessage] = useState("");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // "" asks for the default camera; an id is a camera the desk chose from the list.
  const [deviceId, setDeviceId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [portrait, setPortrait] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      setStatus("starting");
      setMessage("");
      stopStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("This browser has no camera API.", "NotSupportedError");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            // Autoplay is allowed for a muted inline video; if it is not, the frame stays blank
            // and the desk can still upload a photo.
          });
        }
        setActiveId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setDevices(all.filter((device) => device.kind === "videoinput"));
        if (!cancelled) setStatus("live");
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(cameraMessage(error));
      }
    }
    void start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [deviceId, stopStream]);

  useEffect(() => {
    const query = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(query.matches && window.innerWidth < 768);
    update();
    query.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function capture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setMessage("The camera is not showing a picture yet. Wait a moment, or upload a photo.");
      return;
    }
    const frame = cardFrame(video.videoWidth, video.videoHeight);
    if (!frame) return;
    const canvas = document.createElement("canvas");
    canvas.width = cardCaptureWidth(frame);
    canvas.height = Math.max(1, Math.round(canvas.width / CARD_ASPECT));
    const context = canvas.getContext("2d");
    if (!context) {
      setMessage("The photo could not be taken. Upload it instead.");
      return;
    }
    context.drawImage(
      video,
      frame.sx,
      frame.sy,
      frame.sw,
      frame.sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage("The photo could not be saved. Try again, or upload it instead.");
          return;
        }
        onCapture(
          new File([blob], `scorecard-${Date.now()}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          }),
        );
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(12,18,15,.84)] p-3 sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-camera-title"
        className="grid w-full max-w-3xl gap-3 rounded-xl bg-surface p-4 text-ink shadow-lift"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="card-camera-title" className="font-display text-xl font-bold">
              Take the card photo
            </h2>
            <p className="hint mt-0.5">
              Fill the frame with the whole card, all 18 holes, and keep your shadow off it.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close camera"
            className="grid size-9 shrink-0 place-items-center rounded-md border border-line-strong hover:bg-surface-sunken"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-black">
          <div className="relative mx-auto aspect-[9/5] max-h-[58vh] w-full">
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
              aria-label="Camera preview"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-[4%] rounded-sm border border-[rgba(247,245,238,.45)]"
            >
              <span className="absolute -top-px -left-px size-6 border-t-2 border-l-2 border-[#e0bc65]" />
              <span className="absolute -top-px -right-px size-6 border-t-2 border-r-2 border-[#e0bc65]" />
              <span className="absolute -bottom-px -left-px size-6 border-b-2 border-l-2 border-[#e0bc65]" />
              <span className="absolute -right-px -bottom-px size-6 border-r-2 border-b-2 border-[#e0bc65]" />
            </div>
            {status !== "live" && (
              <div className="absolute inset-0 grid place-items-center gap-2 p-6 text-center text-sm text-[#e7ece7]">
                {status === "starting" ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Starting the camera…
                  </span>
                ) : (
                  <span>No camera picture. You can still upload a photo.</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            variant="gold"
            size="sm"
            onClick={capture}
            disabled={status !== "live"}
            data-help="scores-scan"
          >
            <Camera className="size-4" aria-hidden="true" />
            Capture card
          </Button>
          <Button variant="secondary" size="sm" onClick={onUpload}>
            <ImagePlus className="size-4" aria-hidden="true" />
            Upload a photo
          </Button>
          {devices.length > 0 && (
            <label className="field ml-auto min-w-[13rem]">
              <span>Camera source</span>
              <select
                value={activeId || deviceId}
                onChange={(event) => {
                  setDeviceId(event.target.value);
                  setActiveId(event.target.value);
                }}
                disabled={status === "starting"}
              >
                <option value="">Default camera</option>
                {devices.map((device, index) => (
                  <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {message && (
          <p className="notice bad" role="status">
            {message}
          </p>
        )}
        {portrait && (
          <p className="hint">
            Turn the phone sideways: the card is wider than it is tall, so landscape gives a larger,
            sharper photo.
          </p>
        )}
        <p className="hint">
          The photo stays on this device until you choose Upload and read on the card screen.
        </p>
      </div>
    </div>
  );
}

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The camera is blocked. Allow camera access in the browser, or upload a photo instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera was found on this device. Upload a photo instead.";
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return "The camera is busy in another app. Close it, or upload a photo instead.";
  }
  if (name === "NotSupportedError") {
    return "This browser cannot open a camera. Upload a photo instead.";
  }
  return "The camera could not start. Upload a photo instead.";
}
