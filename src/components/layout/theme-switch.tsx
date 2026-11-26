"use client";

import { Menu } from "@base-ui/react/menu";
import { Check, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useSyncExternalStore } from "react";
import {
  DARK_QUERY,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeChoices,
  toThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const icons: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, auto: SunMoon };

const listeners = new Set<() => void>();
/** The choice, for when the browser will not store anything: it lasts until the page is left. */
let unstored: ThemeChoice | null = null;

function readChoice(): ThemeChoice {
  if (unstored) return unstored;
  try {
    return toThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

/** Puts the theme on <html>: the choice, or else what the device asks for. */
function applyTheme() {
  const theme = resolveTheme(readChoice(), window.matchMedia(DARK_QUERY).matches);
  document.documentElement.setAttribute("data-theme", theme);
}

function chooseTheme(choice: ThemeChoice) {
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    unstored = null;
  } catch {
    unstored = choice;
  }
  applyTheme();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  // The choice can change in another tab, and the device can change its own setting (many
  // switch to dark in the evening): both are followed at once.
  const follow = () => {
    applyTheme();
    listener();
  };
  const device = window.matchMedia(DARK_QUERY);
  listeners.add(listener);
  window.addEventListener("storage", follow);
  device.addEventListener("change", follow);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", follow);
    device.removeEventListener("change", follow);
  };
}

function useThemeChoice(): ThemeChoice {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "auto" as const);
  // The script in <head> has already set the theme. This repeats it for the one case where
  // React resets the attributes of <html>: its double mount in development.
  useLayoutEffect(applyTheme, []);
  return choice;
}

const menuItem =
  "text-foreground data-[highlighted]:bg-muted flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] font-medium outline-none select-none";

/**
 * Light, dark, or whatever the device asks for. In a header it is a button that opens the
 * three choices; `inline` shows the three side by side, for a menu that is already open.
 */
export function ThemeSwitch({
  inline = false,
  className,
}: {
  inline?: boolean;
  className?: string;
}) {
  const t = useTranslations("Theme");
  const choice = useThemeChoice();

  if (inline) {
    return (
      <div
        role="group"
        aria-label={t("label")}
        className={cn(
          "border-border bg-card grid grid-cols-3 gap-0.5 rounded-full border p-[3px]",
          className,
        )}
      >
        {themeChoices.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={choice === option}
            onClick={() => chooseTheme(option)}
            className={cn(
              "flex min-h-[38px] items-center justify-center rounded-full px-2.5 text-[0.8125rem] font-semibold transition-colors",
              choice === option
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(option)}
          </button>
        ))}
      </div>
    );
  }

  const Current = icons[choice];
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={t("current", { choice: t(choice) })}
        className={cn(
          "text-foreground hover:bg-muted data-[popup-open]:bg-muted flex size-11 flex-none items-center justify-center rounded-lg transition-colors",
          className,
        )}
      >
        <Current aria-hidden="true" className="size-[22px]" strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={8} className="z-50">
          <Menu.Popup className="border-border bg-card flex w-52 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border p-1.5 shadow-(--shadow-raised) outline-none">
            <Menu.RadioGroup
              aria-label={t("label")}
              value={choice}
              onValueChange={(value) => chooseTheme(toThemeChoice(value as string))}
            >
              {themeChoices.map((name) => {
                const Icon = icons[name];
                return (
                  <Menu.RadioItem key={name} value={name} closeOnClick className={menuItem}>
                    <Icon aria-hidden="true" className="size-[18px]" />
                    {t(name)}
                    <Menu.RadioItemIndicator className="text-primary ml-auto flex">
                      <Check aria-hidden="true" className="size-[18px]" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                );
              })}
            </Menu.RadioGroup>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
