import { Link, NavLink, Outlet } from "react-router";
import { Toaster } from "@/components/ui/sonner.tsx";
import { useAuth } from "@/contexts/auth.tsx";
import { cn } from "@/lib/utils.ts";

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "caps inline-flex h-11 items-center border-b-[3px] px-3 text-sm transition-colors",
    isActive
      ? "border-ink text-ink"
      : "border-transparent text-ink-soft hover:text-ink",
  );

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-paper focus:p-3"
      >
        Skip to content
      </a>
      <header>
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-4xl items-center gap-2 px-4 pt-3 pb-2 sm:px-6"
        >
          <Link
            to="/"
            className="flex h-11 items-center gap-2.5 pr-2 text-ink no-underline"
          >
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt=""
              className="h-8 w-auto dark:invert"
            />
            <span className="font-condensed text-2xl leading-none font-extrabold tracking-[-0.01em] uppercase">
              Anova4All
            </span>
          </Link>
          {user && (
            <div className="ml-auto flex items-center">
              <NavLink to="/" end className={navClass}>
                Cookers
              </NavLink>
              <NavLink to="/account" className={navClass}>
                Account
              </NavLink>
            </div>
          )}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-4xl px-3 pt-4 pb-16 sm:px-6">
        <Outlet />
      </main>
      <Toaster position="top-center" />
    </div>
  );
}
