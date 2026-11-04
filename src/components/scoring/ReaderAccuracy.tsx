import { ScanLine } from "lucide-react";
import { percent, READER_ACCURACY, readerAccuracyLine } from "@/lib/scoring/scan/accuracy";
import { WEAK_CONFIDENCE } from "@/lib/scoring/scan/review";

/**
 * The reader's measured accuracy, in two sizes.
 *
 * `ReaderAccuracyLine` is the scoring screen: the figures only, so the desk has a number beside the
 * scan button. `ReaderAccuracySheet` is the Settings note: what was measured, what the figures do
 * not mean, and the guard that keeps a doubtful cell off a submitted card.
 */
export function ReaderAccuracyLine() {
  return (
    <p className="hint m-0">
      <ScanLine className="mr-1.5 inline size-3.5 align-[-2px] text-fairway" aria-hidden="true" />
      {readerAccuracyLine()}
    </p>
  );
}

export function ReaderAccuracySheet() {
  return (
    <section className="card grid gap-2" aria-labelledby="reader-accuracy">
      <h3 id="reader-accuracy" className="flex items-center gap-2 text-[15px]">
        <ScanLine className="size-4 text-fairway" aria-hidden="true" /> Card reader accuracy
      </h3>
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        <div>
          <dt className="text-ink-muted">Validation cells</dt>
          <dd className="mono m-0 text-[17px] font-semibold">
            {percent(READER_ACCURACY.validation)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Test cells</dt>
          <dd className="mono m-0 text-[17px] font-semibold">{percent(READER_ACCURACY.test)}</dd>
        </div>
      </dl>
      <p className="hint">
        Every score cell is read on its own. These are the figures from {READER_ACCURACY.measuredOn}
        , measured on {READER_ACCURACY.cells.toLocaleString("en-US")} labelled cells with model{" "}
        <span className="mono">{READER_ACCURACY.model}</span>, so they are the share of single cells
        read correctly, not the share of cards that came out clean.
      </p>
      <p className="hint">
        The labelled cells were split by cell, so cells from the same card sit in more than one
        split, and a card the model has never seen can read worse than this. The usual mistakes are
        4, 5 and 6.
      </p>
      <p className="hint">
        None of it removes the check. A cell the reader is less than {percent(WEAK_CONFIDENCE)} sure
        of, or could not read at all, arrives amber and the desk compares it with the photo before
        submitting.
      </p>
    </section>
  );
}
