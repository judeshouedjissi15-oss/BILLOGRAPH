"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceNavItem = {
  value: string;
  label: string;
  icon: LucideIcon;
};

type WorkspaceSidebarProps = {
  items: WorkspaceNavItem[];
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

export function WorkspaceSidebar({
  items,
  value,
  onValueChange,
  children,
}: WorkspaceSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const selectItem = (nextValue: string) => {
    onValueChange(nextValue);
    setMobileOpen(false);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between lg:hidden">
        <p className="text-sm font-semibold">Navigation de l&apos;espace</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={mobileOpen}
          aria-controls="workspace-sidebar"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="size-4" aria-hidden="true" /> : <PanelLeftOpen className="size-4" aria-hidden="true" />}
          {mobileOpen ? "Fermer" : "Rubriques"}
        </Button>
      </div>

      <div className={cn("gap-6 lg:grid", collapsed ? "lg:grid-cols-[4.25rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)]")}>
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            aria-label="Fermer le menu latéral"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          id="workspace-sidebar"
          aria-label="Navigation de l'espace"
          className={cn(
            "z-50 flex-col rounded-xl border bg-card p-2 shadow-sm transition-[width] duration-200 lg:sticky lg:top-24 lg:flex lg:h-[calc(100vh-7rem)] lg:overflow-y-auto",
            mobileOpen
              ? "fixed inset-y-0 left-0 flex w-[min(18rem,85vw)] overflow-y-auto rounded-none p-3"
              : "hidden",
            collapsed && "lg:w-[4.25rem]",
          )}
        >
          <div className={cn("mb-2 hidden items-center justify-between px-2 py-2 lg:flex", collapsed && "justify-center px-0")}>
            {!collapsed && <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espace de travail</span>}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={collapsed ? "Développer le menu latéral" : "Réduire le menu latéral"}
              onClick={() => setCollapsed((state) => !state)}
            >
              {collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <PanelLeftClose className="size-4" aria-hidden="true" />}
            </Button>
          </div>
          <nav className="flex-1 space-y-1">
            {items.map(({ value: itemValue, label, icon: Icon }) => {
              const active = value === itemValue;
              return (
                <button
                  key={itemValue}
                  type="button"
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  onClick={() => selectItem(itemValue)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
