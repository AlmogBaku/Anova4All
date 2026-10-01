// "Need help?": a bottom sheet on a phone, a centered dialog from md: up.
import { CircleHelpIcon, WifiIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Dialog, Tabs } from "radix-ui";
import { Button } from "@/components/ui/button.tsx";
import { COMMON, HELP, type Instruction } from "./copy.ts";

export type HelpTab = "find" | "reset";

/** Numbered steps, each with an optional quieter line under it. */
export function Steps({
  items,
  className,
}: {
  items: readonly Instruction[];
  className?: string;
}) {
  return (
    <ol className={`grid gap-2.5 ${className ?? ""}`}>
      {items.map((s, i) => (
        <li key={s.text} className="flex gap-3 text-[0.90625rem] leading-snug">
          <span
            aria-hidden
            className="-mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-well text-xs font-medium text-ink"
          >
            {i + 1}
          </span>
          <div>
            {s.text}
            {s.detail && (
              <span className="block text-[0.84375rem] text-ink-soft">
                {s.detail}
              </span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A quiet inset note with a leading icon. */
export function Note({
  icon,
  children,
  live,
}: {
  icon?: ReactNode;
  children: ReactNode;
  live?: boolean;
}) {
  return (
    <div
      aria-live={live ? "polite" : undefined}
      className="mt-3.5 flex items-start gap-2.5 rounded-[0.875rem] bg-well px-3 py-2.5 text-[0.8125rem] leading-[1.45] text-ink-soft [&_svg]:mt-px [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

const TAB =
  "min-h-11 flex-1 rounded-[0.625rem] text-sm text-ink-soft data-[state=active]:bg-paper data-[state=active]:font-medium data-[state=active]:text-ink data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]";

export function HelpSheet({
  open,
  onOpenChange,
  tab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: HelpTab;
  onTabChange: (tab: HelpTab) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-[1.75rem] bg-paper px-5.5 pt-2.5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-ink shadow-[0_-20px_40px_-20px_rgb(0_0_0/0.3)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[26.25rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[1.625rem] md:p-6.5 md:shadow-ticket md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=closed]:zoom-out-95"
        >
          <div
            aria-hidden
            className="mx-auto mb-3 h-[5px] w-[38px] rounded-full bg-rail md:hidden"
          />
          <div className="flex items-start justify-between gap-3">
            <Dialog.Title className="pt-1.5 text-[1.375rem] leading-tight font-medium tracking-[-0.03em]">
              {HELP.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={COMMON.close}
                className="-mt-1 -mr-2 text-ink-soft"
              >
                <XIcon className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <Tabs.Root
            value={tab}
            onValueChange={(v) => onTabChange(v as HelpTab)}
          >
            <Tabs.List className="mt-3.5 flex rounded-[0.875rem] bg-well p-1">
              <Tabs.Trigger value="find" className={TAB}>
                {HELP.tabs.find}
              </Tabs.Trigger>
              <Tabs.Trigger value="reset" className={TAB}>
                {HELP.tabs.reset}
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="find" className="mt-4">
              <Steps items={HELP.find} />
              <Note icon={<CircleHelpIcon />}>{HELP.findNote}</Note>
            </Tabs.Content>
            <Tabs.Content value="reset" className="mt-4">
              <Steps items={HELP.reset} />
              <Note icon={<WifiIcon />}>{HELP.resetNote}</Note>
            </Tabs.Content>
          </Tabs.Root>
          <Dialog.Close asChild>
            <Button size="lg" className="mt-4.5 w-full">
              {HELP.close}
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
