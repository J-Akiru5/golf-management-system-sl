"use client";

import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import styles from "./staff.module.css";

/**
 * The staff app's sheet: it comes up from the bottom on a phone, where a thumb already is, and
 * turns into a centred panel on a desk-sized screen. It always has a visible close button, a
 * labelled title, and scrolls inside itself so a long roster cannot push the page.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  labelledBy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** An element id elsewhere on the page that already names the sheet, instead of a title. */
  labelledBy?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.sheetOverlay} />
        <Dialog.Content
          className={`${styles.bottomSheetPanel} ${styles.sheetSurface}`}
          aria-labelledby={labelledBy}
        >
          <div className={styles.sheetGrab} aria-hidden="true" />
          <div className={styles.sheetHead}>
            <div className={styles.sheetHeadText}>
              <Dialog.Title className={styles.sheetTitle}>{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={styles.sheetDescription}>
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className={styles.srOnly}>{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className={styles.sheetClose} aria-label="Close">
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className={styles.sheetScroll}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
