"use client";

import styles from "./staff.module.css";

/**
 * The staff app's page-shaped loading state. Every screen draws the same title and skeleton
 * blocks, so moving between screens does not jump from a spinner to a full page.
 */
export function StaffLoading({ title, label }: { title: string; label: string }) {
  return (
    <div>
      <h1 className={styles.h1}>{title}</h1>
      <div
        className={styles.skeletonStack}
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={label}
      >
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
        <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
        <div className={`${styles.skeleton} ${styles.skeletonCard}`} />
      </div>
    </div>
  );
}
