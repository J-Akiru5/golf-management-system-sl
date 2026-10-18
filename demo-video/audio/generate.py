"""Generate the narration for the AVP demo with a local Kokoro voice.

Run with the AVP venv:
  C:\\Users\\Lenovo\\.avp\\venv\\Scripts\\python.exe demo-video/audio/generate.py

Reads demo-video/steps.json, writes one wav per scene to demo-video/audio/ and a durations.json the
recorder and the assembler read. No cloud service is used.
"""
import json
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
VIDEO = ROOT / "demo-video"
MODEL = Path(r"C:\Users\Lenovo\.avp\models\kokoro-v1.0.onnx")
VOICES = Path(r"C:\Users\Lenovo\.avp\models\voices-v1.0.bin")

PRONOUNCE = {
    "TeeLine": "Tee line",
    "IGCC": "I G C C",
    "NGAP": "N G A P",
    "WHS": "W H S",
}


def spoken(text: str) -> str:
    for written, say in PRONOUNCE.items():
        text = re.sub(rf"\b{re.escape(written)}\b", say, text)
    return text


def main() -> None:
    steps = json.loads((VIDEO / "steps.json").read_text(encoding="utf-8"))
    audio_dir = VIDEO / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    kokoro = Kokoro(str(MODEL), str(VOICES))
    durations = {}

    for index, scene in enumerate(steps["scenes"], start=1):
        text = spoken(scene["narration"])
        samples, rate = kokoro.create(
            text,
            voice=steps["meta"]["voice"],
            speed=steps["meta"]["speed"],
            lang="en-us",
        )
        # A little air before and after each line, so scenes do not sound clipped together.
        lead = np.zeros(int(rate * 0.25), dtype=np.float32)
        tail = np.zeros(int(rate * 0.35), dtype=np.float32)
        audio = np.concatenate([lead, samples.astype(np.float32), tail])
        path = audio_dir / f"{scene['id']}.wav"
        sf.write(path, audio, rate)
        durations[scene["id"]] = round(len(audio) / rate, 3)
        words = len(scene["narration"].split())
        print(f"{index:02d} {scene['id']:<14} {durations[scene['id']]:>6.2f}s  {words:>3} words")

    (VIDEO / "audio" / "durations.json").write_text(
        json.dumps(durations, indent=2) + "\n", encoding="utf-8"
    )
    total = sum(durations.values())
    print(f"\ntotal narration: {total:.2f}s ({total / 60:.2f} min)")


if __name__ == "__main__":
    main()
