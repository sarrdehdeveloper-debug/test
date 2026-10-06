"use client";

import { useEffect, useRef } from "react";

/**
 * Ctrl/⌘ + S runs `onSave` (instead of the browser's "save page") while `enabled`.
 * Ignored while a modal dialog is open, so it never saves the page behind a dialog.
 */
export function useSaveShortcut(onSave: () => void, enabled: boolean): void {
  const callback = useRef(onSave);
  useEffect(() => {
    callback.current = onSave;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "s") return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      callback.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
