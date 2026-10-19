"""Generate line-level narration for the AVP demo with a local Kokoro voice.

Run with the AVP venv:
  C:\\Users\\Lenovo\\.avp\\venv\\Scripts\\python.exe demo-video/audio/generate.py

Each `lines[]` entry in steps.json is synthesized separately, then joined with short gaps. The
timeline.json it writes is the single clock for captions, cursor, spotlight and zoom, so the voice and
the picture cannot drift. No cloud service is used.
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
VIDEO = ROOT / "demo-video"
MODEL = Path(r"C:\Users\Lenovo\.avp\models\kokoro-v1.0.onnx")
VOICES = Path(r"C:\Users\Lenovo\.avp\models\voices-v1.0.bin")

LEAD = 0.25
GAP = 0.22
TAIL = 0.4
DEFAULT_PAUSE = GAP


def line_parts(line) -> tuple[str, float]:
    if isinstance(line, str):
        return line, DEFAULT_PAUSE
    return line.get("text", ""), float(line.get("pauseAfter", DEFAULT_PAUSE))

PRONOUNCE = {
    "TeeLine": "Tee line",
    "IGCC": "I G C C",
    "NGAP": "N G A P",
    "WHS": "W H S",
}


def spoken(text: str) -> str:
    for written, say in PRONOUNCE.items():
        text = text.replace(written, say)
    return text


def main() -> None:
    steps = json.loads((VIDEO / "steps.json").read_text(encoding="utf-8"))
    audio_dir = VIDEO / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    kokoro = Kokoro(str(MODEL), str(VOICES))
    timeline = {"scenes": {}}
    total = 0.0

    for index, scene in enumerate(steps["scenes"], start=1):
        rate = 24000
        chunks = [np.zeros(int(rate * LEAD), dtype=np.float32)]
        cursor = LEAD
        lines = []

        for raw_line in scene["lines"]:
            line, pause = line_parts(raw_line)
            if not line:
                continue
            samples, rate = kokoro.create(
                spoken(line),
                voice=steps["meta"]["voice"],
                speed=steps["meta"]["speed"],
                lang="en-us",
            )
            samples = samples.astype(np.float32)
            duration = len(samples) / rate
            lines.append(
                {
                    "start": round(cursor, 3),
                    "end": round(cursor + duration, 3),
                    "pauseAfter": round(pause, 3),
                    "text": line,
                }
            )
            chunks.append(samples)
            cursor += duration
            gap = np.zeros(int(rate * pause), dtype=np.float32)
            chunks.append(gap)
            cursor += pause

        tail = np.zeros(int(rate * TAIL), dtype=np.float32)
        chunks.append(tail)
        cursor += TAIL
        audio = np.concatenate(chunks)
        path = audio_dir / f"{scene['id']}.wav"
        sf.write(path, audio, rate)

        timeline["scenes"][scene["id"]] = {
            "audio": f"audio/{scene['id']}.wav",
            "duration": round(len(audio) / rate, 3),
            "lines": lines,
        }
        total += len(audio) / rate
        words = sum(len(line_parts(line)[0].split()) for line in scene["lines"])
        print(f"{index:02d} {scene['id']:<14} {len(audio) / rate:>6.2f}s  {words:>3} words")

    (VIDEO / "audio" / "timeline.json").write_text(
        json.dumps(timeline, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\ntotal narration: {total:.2f}s ({total / 60:.2f} min)")


if __name__ == "__main__":
    main()
