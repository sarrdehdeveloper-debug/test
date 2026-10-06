"use client";

import { useEffect, useRef } from "react";

export const UNSAVED_MESSAGE = "You have unsaved changes. Leave this page and discard them?";

/** Is this click a same-tab navigation to another page of this site? (pure, exported for tests) */
export function isInternalNavigation(
  anchor: { href: string; target?: string; hasAttribute: (name: string) => boolean },
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  current: { origin: string; pathname: string; search: string },
): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  let url: URL;
  try {
    url = new URL(anchor.href, current.origin);
  } catch {
    return false;
  }
  if (url.origin !== current.origin) return false;
  // Same page (e.g. "#section" anchors) is not a navigation.
  return url.pathname !== current.pathname || url.search !== current.search;
}

/**
 * Warn before leaving a page with unsaved edits: browser reload/close (`beforeunload`) and clicks
 * on in-app links (sidebar, breadcrumbs…) ask for confirmation. Programmatic navigation after a
 * successful save is unaffected as long as `dirty` is false by then.
 *
 *   useUnsavedChanges(isDirty);
 */
export function useUnsavedChanges(dirty: boolean, message: string = UNSAVED_MESSAGE): void {
  const state = useRef({ dirty, message });
  useEffect(() => {
    state.current = { dirty, message };
  });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need returnValue to show the prompt.
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (!state.current.dirty || event.defaultPrevented) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavigation(anchor, event, window.location)) return;
      if (window.confirm(state.current.message)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
