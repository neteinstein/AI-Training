/**
 * How the back-office's small buttons look. Kept in a plain module, not in a Client Component
 * file: Server Components use these class names for links, and a value exported from a client
 * file reaches the server as a reference, not as the text it holds.
 */
export type ButtonLook = "icon" | "text" | "danger" | "outline" | "neutral" | "primary" | "bare";

export const actionLooks: Record<ButtonLook, string> = {
  icon: "text-foreground hover:bg-muted flex size-11 flex-none items-center justify-center rounded-lg transition-colors",
  text: "text-primary hover:bg-accent inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold transition-colors",
  danger:
    "text-destructive hover:bg-highlight-tint inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold transition-colors",
  outline:
    "border-primary text-primary hover:bg-accent inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-[1.5px] px-4 text-[0.9375rem] font-semibold transition-colors",
  neutral:
    "border-input bg-card text-foreground hover:bg-muted inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3.5 text-[0.9375rem] font-semibold transition-colors",
  primary:
    "bg-primary text-primary-foreground hover:bg-primary-hover inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[0.9375rem] font-semibold transition-colors",
  bare: "",
};
