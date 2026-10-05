"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NavLink } from "./NavLink";

export interface MobileMenuProps {
  items: { href: string; label: string }[];
  labels: { open: string; close: string; nav: string; cta: string };
  className?: string;
}

/** Hamburger menu for < lg screens. Closes on navigation, Escape, or the toggle. */
export function MobileMenu({ items, labels, className }: MobileMenuProps) {
  const pathname = usePathname();
  // The menu is open only for the path it was opened on, so it closes itself after navigation.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpenPath(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPath(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className={cn("lg:hidden", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenPath(open ? null : pathname)}
        className="grid size-10 place-items-center rounded-full border border-gold-light/30 text-gold-light transition-colors hover:border-gold-light/70"
      >
        <span className="sr-only">{open ? labels.close : labels.open}</span>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          {open ? (
            <path d="M6 6l12 12M18 6 6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h10" />
          )}
        </svg>
      </button>

      <div
        id={panelId}
        hidden={!open}
        data-tone="night"
        className="absolute inset-x-0 top-full h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gold-light/15 bg-night-sky"
      >
        <nav aria-label={labels.nav} className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <ul className="divide-y divide-gold-light/10">
            {items.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  onClick={close}
                  className="flex items-center justify-between py-4 font-serif text-2xl text-ivory transition-colors hover:text-gold-light aria-[current=page]:text-gold-light"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-col gap-4">
            <Button href="/reading" size="lg" fullWidth onClick={close}>
              {labels.cta}
            </Button>
            <LanguageSwitcher variant="pill" className="justify-center" onSwitch={close} />
          </div>
        </nav>
      </div>
    </div>
  );
}
