import { SettingsIcon } from "lucide-react";
import { Link } from "react-router";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { LinkView } from "@/lib/api/device-stream.ts";
import type { TemperatureUnit } from "@/lib/api/types.ts";
import type { CookController, CookView } from "./controller.ts";
import { Dial } from "./dial.tsx";
import { timerLabel } from "./duration.ts";
import { AutoStopField, DurationField, TemperatureField } from "./fields.tsx";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function LinkStatus({
  link,
  retryInMs,
}: {
  link: LinkView;
  retryInMs?: number;
}) {
  switch (link) {
    case "connecting":
      return <Loading label="Connecting to the cooker…" />;
    case "cooker_offline":
      return (
        <Notice title="The cooker is offline">
          Check that it's plugged in and on Wi-Fi. This page updates when it's
          back.
        </Notice>
      );
    case "stream_down":
      return (
        <Notice title="Connection lost">
          Reconnecting{retryInMs ? ` in ${Math.ceil(retryInMs / 1000)} s` : ""}…
          Values may be out of date.
        </Notice>
      );
    case "signed_out":
      return (
        <ErrorAlert title="Your session ended">
          <Link to="/login" className="underline">
            Log in again
          </Link>
        </ErrorAlert>
      );
    default:
      return null;
  }
}

const MODE_LABEL: Record<CookView["mode"], string> = {
  loading: "Connecting",
  offline: "Offline",
  idle: "Idle",
  heating: "Heating",
};

export function CookScreen({
  name,
  settingsHref,
  view,
  controller,
  link,
  retryInMs,
  readingUnit,
}: {
  name: string;
  settingsHref: string;
  view: CookView;
  controller: CookController;
  link: LinkView;
  retryInMs?: number;
  /** The unit the cooker reports its water temperature in. */
  readingUnit?: TemperatureUnit;
}) {
  const { values, invalid, mode } = view;
  const heating = mode === "heating";
  const canEdit =
    (mode === "idle" || heating) && link !== "stream_down" && !view.busy;
  const live = mode !== "loading" && mode !== "offline";
  // A reading is current only while the stream is up.
  const fresh = live && link === "online";
  return (
    <section
      aria-labelledby="cooker-name"
      className="grid gap-3 rounded-[1.75rem] bg-paper p-4 shadow-ticket sm:grid-cols-[1fr_minmax(0,22rem)] sm:items-center sm:gap-8 sm:p-8"
    >
      <header className="flex items-center justify-between gap-3 sm:col-span-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              heating
                ? "bg-heat shadow-[0_0_0_4px_color-mix(in_oklab,var(--heat)_18%,transparent)]"
                : mode === "offline"
                  ? "bg-rail"
                  : "bg-ink-soft/50",
            )}
          />
          <h1
            id="cooker-name"
            className="truncate text-lg leading-tight font-medium tracking-[-0.02em]"
          >
            {name}
          </h1>
          <span className="sr-only">, {MODE_LABEL[mode]}</span>
        </div>
        <Link
          to={settingsHref}
          aria-label="Cooker settings"
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-well hover:text-ink"
        >
          <SettingsIcon className="size-5" strokeWidth={1.5} />
        </Link>
      </header>

      <div className="grid gap-3">
        {link !== "online" && <LinkStatus link={link} retryInMs={retryInMs} />}
        <Dial
          current={view.current}
          readingUnit={readingUnit}
          target={values.temperature}
          unit={values.unit}
          heating={heating}
          fresh={fresh}
          live={live}
          modeLabel={MODE_LABEL[mode]}
          stopsAt={heating && view.stopsAt ? time(view.stopsAt) : undefined}
          disabled={!canEdit}
          onChange={(t) => controller.editTemperature(t)}
          onUnitChange={(u) => controller.editUnit(u)}
        />
      </div>

      <form
        aria-label="Cook settings"
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter starts an idle cook; it never stops a running one.
          if (!heating) void controller.start();
        }}
      >
        {view.autoStopped && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 rounded-[1.1rem] bg-well px-4 py-3"
          >
            <p className="text-[0.875rem]">
              <span className="font-medium">Stopped automatically.</span>{" "}
              <span className="text-ink-soft">It may still be beeping.</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={view.busy}
              onClick={() => void controller.stop()}
            >
              Silence
            </Button>
          </div>
        )}
        <TemperatureField
          value={values.temperature}
          unit={values.unit}
          error={invalid.temperature}
          disabled={!canEdit}
          onChange={(t) => controller.editTemperature(t)}
        />
        <DurationField
          label={timerLabel(heating, values.minutes)}
          minutes={values.minutes}
          error={invalid.minutes}
          disabled={!canEdit}
          onChange={(m) => controller.editMinutes(m)}
        />
        {heating && view.timerWaiting && (
          <p className="px-1 text-[0.8125rem] text-ink-soft">
            Timer starts at {values.temperature} °{values.unit.toUpperCase()}
          </p>
        )}
        <AutoStopField
          checked={values.autoStop}
          disabled={!canEdit || values.minutes === 0}
          noTimer={canEdit && values.minutes === 0}
          error={invalid.autoStop}
          onChange={(on) => controller.editAutoStop(on)}
        />
        {view.error && <ErrorAlert>{view.error}</ErrorAlert>}
        {heating ? (
          <Button
            type="button"
            variant="heat"
            size="lg"
            className="mt-1 w-full"
            disabled={view.busy}
            onClick={() => void controller.stop()}
          >
            {view.busy ? "Stopping…" : "Stop"}
          </Button>
        ) : (
          <Button
            type="submit"
            size="lg"
            className="mt-1 w-full"
            disabled={view.busy || mode !== "idle" || link === "stream_down"}
          >
            {view.busy ? "Starting…" : "Start"}
          </Button>
        )}
        <p
          aria-live="polite"
          className="min-h-4 text-center text-xs text-ink-soft"
        >
          {heating && view.saving
            ? "Saving…"
            : heating
              ? "Changes apply now"
              : ""}
        </p>
      </form>
    </section>
  );
}
