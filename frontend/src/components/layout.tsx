import { CookingPotIcon, UserRoundIcon } from "lucide-react";
import type { ComponentType } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { cn } from "@/lib/utils.ts";

// The app shell fills the screen like a native app: a slim top bar, the page,
// and (on phones) a bottom tab bar. Only the page area scrolls, and only when
// it truly must.

const TABS: {
  to: string;
  label: string;
  end?: boolean;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { to: "/", label: "Cookers", end: true, Icon: CookingPotIcon },
  { to: "/account", label: "Account", Icon: UserRoundIcon },
];

export function Logo() {
  return (
    <Link
      to="/"
      className="flex h-11 items-center gap-2 pr-2 text-ink no-underline"
    >
      <img
        src={`${import.meta.env.BASE_URL}logo.svg`}
        alt=""
        className="h-8 w-auto dark:brightness-[2.2] dark:contrast-[0.9]"
      />
      <span className="text-[1.0625rem] leading-none font-semibold tracking-[-0.02em]">
        Anova<span className="text-heat">4</span>All
      </span>
    </Link>
  );
}

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-paper focus:p-3"
      >
        Skip to content
      </a>
      <header className="shrink-0 pt-[env(safe-area-inset-top)]">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-1 sm:px-6 sm:py-2"
        >
          <Logo />
          {user && (
            <div className="ml-auto hidden items-center gap-1 rounded-full bg-well p-1 sm:flex">
              {TABS.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium no-underline transition-colors",
                      isActive
                        ? "bg-paper text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                        : "text-ink-soft hover:text-ink",
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
      </header>
      <main
        id="main"
        className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col overflow-y-auto overscroll-contain px-3 pt-1 pb-3 sm:px-6 sm:pt-3 sm:pb-6"
      >
        <Outlet />
      </main>
      {user && (
        <nav
          aria-label="Tabs"
          className="shrink-0 border-t border-hairline bg-paper/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:hidden"
        >
          <div className="grid grid-cols-2">
            {TABS.map(({ to, label, end, Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium no-underline",
                    isActive ? "text-heat" : "text-ink-soft",
                  )
                }
              >
                <Icon className="size-[1.375rem]" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
      <Toaster position="top-center" />
    </div>
  );
}
