/**
 * What the card reader was measured at.
 *
 * The figures come from the ONNX model trained on the labelled cells of Roboflow project
 * `igcc-scorecard-digits-v2` version 4; `docs/SCORECARD_SCAN_MODEL.md` explains how it was built and
 * how to measure it again. They are per cell, and Roboflow split by cell, so cells from the same
 * card sit in more than one split and a card the model has never seen can read worse.
 *
 * Update this file and the doc together when the model is retrained. The desk's amber check flag is
 * the guard; these numbers never stand in for it.
 */
export interface ReaderAccuracy {
  /** The model file the figures belong to. */
  readonly model: string;
  /** When it was measured, for the reader of the screen. */
  readonly measuredOn: string;
  /** Labelled cells the model was measured on. */
  readonly cells: number;
  /** Share of held-out cells read correctly. */
  readonly validation: number;
  /** Share of the test split read correctly. */
  readonly test: number;
}

export const READER_ACCURACY: ReaderAccuracy = {
  model: "igcc-scorecard-digits",
  measuredOn: "5 November 2026",
  cells: 1951,
  validation: 0.8657,
  test: 0.8372,
};

/** A fraction as the one-decimal percentage the screens show. */
export function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** The scoring screen's sentence: the accuracy, and nothing else. */
export function readerAccuracyLine(accuracy: ReaderAccuracy = READER_ACCURACY): string {
  return `Reader accuracy ${percent(accuracy.validation)} of validation cells, ${percent(
    accuracy.test,
  )} of test cells.`;
}
