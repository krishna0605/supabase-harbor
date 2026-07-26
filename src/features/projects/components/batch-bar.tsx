"use client";

import { motion } from "motion/react";
import { Play, RefreshCw, ShieldPlus, X } from "lucide-react";

export function BatchBar({
  selectedCount,
  restorableCount,
  enrollableCount,
  pending,
  onRestore,
  onEnroll,
  onRefresh,
  onClear,
}: {
  selectedCount: number;
  restorableCount: number;
  enrollableCount: number;
  pending: boolean;
  onRestore: () => void;
  onEnroll: () => void;
  onRefresh: () => void;
  onClear: () => void;
}) {
  return (
    <motion.div
      className="batch-bar"
      role="region"
      aria-label="Actions for selected projects"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
    >
      <span className="batch-count">
        {selectedCount} selected
      </span>

      <button
        type="button"
        className="button button-primary button-small"
        onClick={onRestore}
        disabled={pending || restorableCount === 0}
      >
        <Play size={14} />
        Restore {restorableCount}
      </button>

      <button
        type="button"
        className="button button-secondary button-small"
        onClick={onEnroll}
        disabled={pending || enrollableCount === 0}
      >
        <ShieldPlus size={14} />
        Enroll {enrollableCount}
      </button>

      <button
        type="button"
        className="button button-secondary button-small"
        onClick={onRefresh}
        disabled={pending}
      >
        <RefreshCw size={14} className={pending ? "spin" : ""} />
        Refresh
      </button>

      <button
        type="button"
        className="button button-quiet button-small"
        onClick={onClear}
        aria-label="Clear selection"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
