"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn, clamp } from "@/lib/utils";
import { closeContextMenu, useContextMenuStore, type ContextMenuState, type MenuItem } from "@/system/sdk/context-menu";

type ActionItem = Exclude<MenuItem, { kind: "separator" }>;
const isAction = (i: MenuItem): i is ActionItem => i.kind !== "separator";

/** Renders the single active context menu (desktop, title bars, dock, …). */
export function ContextMenuHost() {
  const menu = useContextMenuStore((s) => s.menu);
  if (!menu) return null;
  // Keyed by position so a new menu always starts with fresh state.
  return <ContextMenu key={`${menu.position.x},${menu.position.y}`} menu={menu} />;
}

function ContextMenu({ menu }: { menu: ContextMenuState }) {
  const close = closeContextMenu;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(menu.position);
  const [active, setActive] = useState(-1);

  const enabled = menu.items
    .map((item, index) => ({ item, index }))
    .filter((e): e is { item: ActionItem; index: number } => isAction(e.item) && !e.item.disabled);

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: clamp(menu.position.x, 4, window.innerWidth - width - 4),
      y: clamp(menu.above ? menu.position.y - height : menu.position.y, 4, window.innerHeight - height - 4),
    });
    el.focus();
  }, [menu.position, menu.above]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element;
      // Triggers (e.g. the menu-bar logo) toggle the menu themselves.
      if (ref.current?.contains(target) || target.closest?.("[data-menu-trigger]")) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [close]);

  const select = (item: ActionItem) => {
    close();
    item.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = enabled.findIndex((en) => en.index === active);
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (enabled.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = at === -1 ? (step === 1 ? 0 : enabled.length - 1) : (at + step + enabled.length) % enabled.length;
      setActive(enabled[next]?.index ?? -1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const entry = enabled[at];
      if (entry) select(entry.item);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className="nx-pop-in fixed z-[9000] min-w-[200px] rounded-lg border border-line bg-surface-raised/95 p-1 shadow-popover outline-none backdrop-blur-xl"
      style={{ left: pos.x, top: pos.y }}
    >
      {menu.items.map((item, i) =>
        isAction(item) ? (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onPointerEnter={() => setActive(item.disabled ? -1 : i)}
            onClick={() => select(item)}
            className={cn(
              "flex h-7 w-full items-center gap-2.5 rounded-[5px] px-2 text-left text-[12.5px] text-fg outline-none",
              "disabled:text-subtle",
              active === i && (item.danger ? "bg-danger/90 text-white" : "bg-accent text-accent-fg"),
              item.danger && active !== i && "text-danger",
            )}
          >
            {item.icon ? <item.icon size={14} strokeWidth={1.75} className="shrink-0 opacity-80" /> : <span className="w-[14px]" />}
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && <span className="text-[11px] opacity-60">{item.shortcut}</span>}
          </button>
        ) : (
          <div key={i} role="separator" className="mx-2 my-1 h-px bg-line" />
        ),
      )}
    </div>
  );
}
