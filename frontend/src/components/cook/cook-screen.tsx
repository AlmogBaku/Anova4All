import { Link } from "react-router";
import { ErrorAlert, Loading, Notice } from "@/components/status.tsx";
import {
  OrderLine,
  Ticket,
  TicketHead,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
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
}: {
  name: string;
  settingsHref: string;
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
  const live = mode !== "loading" && mode !== "offline";
  // A reading is current only while the stream is up.
  const fresh = live && link === "online";

  return (
    <Ticket aria-labelledby="cooker-name">
      <TicketHead
        titleAs="h1"
        titleId="cooker-name"
        title={name}
        meta={MODE_LABEL[mode]}
        tone={heating ? "heat" : mode === "offline" ? "offline" : "idle"}
      />

      {link !== "online" && (
        <TicketSection perforated={false} className="pb-0">
          <LinkStatus link={link} retryInMs={retryInMs} />
        </TicketSection>
      )}

      <TicketSection
        perforated={false}
        aria-labelledby="now-heading"
        className="grid gap-2 pt-4"
      >
        <h2 id="now-heading" className="caps text-sm text-ink-soft">
          Water
        </h2>
        <p
          className={cn(
            "font-condensed text-[6.5rem] leading-[0.82] font-extrabold tracking-[-0.03em] tabular-nums sm:text-[8.5rem]",
            !fresh && "text-ink-soft",
          )}
        >
          {view.current ?? "--"}
          <span className="ml-1 align-top text-[0.4em] leading-none">
            {unit}
          </span>
          <span className="sr-only"> water temperature</span>
        </p>
        <div className="mt-2 grid">
          {heating ? (
            <>
              <OrderLine label="Set">
                {values.temperature} {unit}
              </OrderLine>
              {view.stopsAt && (
                <OrderLine label="Stops at">{time(view.stopsAt)}</OrderLine>
              )}
            </>
          ) : (
            live && <p className="text-ink-soft">Not heating</p>
          )}
        </div>
      </TicketSection>

      {view.autoStopped && (
        <TicketSection className="grid gap-3" role="status">
          <h2 className="caps text-base">Stopped automatically</h2>
          <p>
            The timer ended and heating stopped. The cooker may still be
            beeping.
          </p>
          <Button
            variant="outline"
            className="w-full sm:w-auto sm:justify-self-start"
            disabled={view.busy}
            onClick={() => void controller.stop()}
          >
            Silence
          </Button>
        </TicketSection>
      )}

      <form
        aria-label="Cook settings"
        onSubmit={(e) => {
          e.preventDefault();
          // Enter starts an idle cook; it never stops a running one.
          if (!heating) void controller.start();
        }}
      >
        <TicketSection className="grid gap-5">
          <h2 className="caps text-sm text-ink-soft">
            {heating ? "Order (changes apply now)" : "Order"}
          </h2>
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
            noTimer={canEdit && values.minutes === 0}
            error={invalid.autoStop}
            onChange={(on) => controller.editAutoStop(on)}
          />
          {view.error && <ErrorAlert>{view.error}</ErrorAlert>}
        </TicketSection>

        <TicketSection className="grid gap-3 pb-6">
          {heating ? (
            <Button
              type="button"
              variant="heat"
              size="lg"
              className="w-full"
              disabled={view.busy}
              onClick={() => void controller.stop()}
            >
              {view.busy ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={view.busy || mode !== "idle" || link === "stream_down"}
            >
              {view.busy ? "Starting…" : "Start"}
            </Button>
          )}
          <div className="flex min-h-11 items-center justify-between gap-3">
            <p aria-live="polite" className="text-sm text-ink-soft">
              {heating && view.saving ? "Saving…" : ""}
            </p>
            <Button asChild variant="link">
              <Link to={settingsHref}>Cooker settings</Link>
            </Button>
          </div>
        </TicketSection>
      </form>
    </Ticket>
  );
}
