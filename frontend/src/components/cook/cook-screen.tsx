import { Link } from "react-router";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { LinkView } from "@/lib/api/device-stream.ts";
import type { CookController, CookView } from "./controller.ts";
import { timerLabel } from "./duration.ts";
import {
  AutoStopField,
  DurationField,
  TemperatureField,
  UnitField,
} from "./fields.tsx";

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
          Check that it's plugged in and connected to Wi-Fi. This page updates
          when it's back.
        </Notice>
      );
    case "stream_down":
      return (
        <Notice title="Connection lost">
          Reconnecting{retryInMs ? ` in ${Math.ceil(retryInMs / 1000)} s` : ""}…
          The values below may be out of date.
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

export function CookScreen({
  view,
  controller,
  link,
  retryInMs,
}: {
  view: CookView;
  controller: CookController;
  link: LinkView;
  retryInMs?: number;
}) {
  const { values, invalid, mode } = view;
  const heating = mode === "heating";
  const canEdit =
    (mode === "idle" || heating) && link !== "stream_down" && !view.busy;
  const unit = `°${values.unit.toUpperCase()}`;

  return (
    <div className="grid gap-6">
      <LinkStatus link={link} retryInMs={retryInMs} />

      {view.autoStopped && (
        <Notice title="Stopped automatically">
          <p>
            The timer ended and heating stopped. The cooker may still be
            beeping.
          </p>
          <Button
            className="mt-2"
            variant="outline"
            disabled={view.busy}
            onClick={() => void controller.stop()}
          >
            Silence
          </Button>
        </Notice>
      )}

      {mode !== "loading" && mode !== "offline" && (
        <section aria-labelledby="now-heading" className="grid gap-1">
          <h2
            id="now-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            {heating ? "Heating" : "Not heating"}
          </h2>
          {view.current !== undefined && (
            <p className="text-3xl tabular-nums">
              {view.current} {unit}
              <span className="sr-only"> water temperature</span>
            </p>
          )}
          {heating && view.stopsAt && <p>Stops at {time(view.stopsAt)}</p>}
        </section>
      )}

      <form
        className="grid gap-4"
        aria-label="Cook settings"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter starts an idle cook; it never stops a running one.
          if (!heating) void controller.start();
        }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <TemperatureField
            value={values.temperature}
            unit={values.unit}
            error={invalid.temperature}
            disabled={!canEdit}
            onChange={(t) => controller.editTemperature(t)}
          />
          <UnitField
            unit={values.unit}
            disabled={!canEdit}
            onChange={(u) => controller.editUnit(u)}
          />
        </div>
        <DurationField
          label={timerLabel(heating, values.minutes)}
          minutes={values.minutes}
          error={invalid.minutes}
          disabled={!canEdit}
          onChange={(m) => controller.editMinutes(m)}
        />
        <AutoStopField
          checked={values.autoStop}
          disabled={!canEdit || values.minutes === 0}
          error={invalid.autoStop}
          onChange={(on) => controller.editAutoStop(on)}
        />

        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {heating && view.saving
            ? "Saving…"
            : heating
              ? "Changes apply to the cooker automatically."
              : ""}
        </p>
        {view.error && <ErrorAlert>{view.error}</ErrorAlert>}

        <div>
          {heating ? (
            <Button
              type="button"
              variant="destructive"
              disabled={view.busy}
              onClick={() => void controller.stop()}
            >
              {view.busy ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={view.busy || mode !== "idle" || link === "stream_down"}
            >
              {view.busy ? "Starting…" : "Start"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
