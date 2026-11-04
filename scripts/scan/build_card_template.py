"""Build the stored card template used by feature-based card detection.

Input is one rectified (1800 x 1000) photo of a *clean* IGCC card. The script
stores SIFT keypoints and descriptors, not the image, so no photograph of a filled
card is committed. A blank card is strongly preferred: handwriting adds features
that will never match another card. `--blank-handwriting` white-outs the name
column, the header and the signature strip using the template geometry; it removes
handwriting but also removes printed features, so only use it if the clean scan is
not available and check the match counts afterwards.

    python build_card_template.py --card path/to/rectified-card.png
    python build_card_template.py --card scan.png --blank-handwriting --output models/igcc-card-template.npz
"""

from __future__ import annotations

import argparse
from pathlib import Path

import cv2

from igcc_scan.features import CardTemplateMatcher
from igcc_scan.geometry import IGCC_PAPER

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "models" / "igcc-card-template.npz"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--card", required=True, type=Path, help="rectified card photo")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--width", type=int, default=900, help="reference width in pixels")
    parser.add_argument(
        "--blank-handwriting",
        action="store_true",
        help="white out the name column, header and signature strip before extracting features",
    )
    args = parser.parse_args()

    image = cv2.imread(str(args.card))
    if image is None:
        raise SystemExit(f"Could not read {args.card}")
    height = int(round(args.width * IGCC_PAPER.height / IGCC_PAPER.width))
    image = cv2.resize(image, (args.width, height), interpolation=cv2.INTER_AREA)
    if args.blank_handwriting:
        scale = args.width / IGCC_PAPER.width
        name_x0 = int(round(IGCC_PAPER.name_column[0] * scale))
        name_x1 = int(round(IGCC_PAPER.name_column[1] * scale))
        image[:, name_x0:name_x1] = 255
        image[: int(round(IGCC_PAPER.table.y0 * scale)), :] = 255
        image[int(round(IGCC_PAPER.table.y1 * scale)) + int(round(30 * scale)) :, :] = 255

    matcher = CardTemplateMatcher.from_image(image)
    matcher.save(args.output)
    print(
        f"wrote {args.output} with {matcher.keypoints.shape[0]} keypoints "
        f"from a {args.width}x{height} reference"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
