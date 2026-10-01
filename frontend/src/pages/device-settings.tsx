import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Confirm } from "@/components/confirm.tsx";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import {
  OrderLine,
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { useAsync } from "@/hooks/use-async.ts";
import { useAuth } from "@/contexts/auth.tsx";
import { devices } from "@/lib/data.ts";
import { NAME_MAX, validateDeviceName, type Device } from "@/lib/devices.ts";
import { errorText } from "@/lib/errors.ts";

const date = (iso: string) => new Date(iso).toLocaleDateString();

function RenameForm({
  device,
  onSaved,
}: {
  device: Device;
  onSaved: () => void;
}) {
  const [name, setName] = useState(device.name);
  const [invalid, setInvalid] = useState<string | null>(null);
  const save = useAction(async (n: string) => {
    await devices.rename(device.id, n);
    return true;
  });
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validateDeviceName(name);
    setInvalid(err);
    if (!err && (await save.run(name))) onSaved();
  };
  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-4">
      {save.error && <ErrorAlert>{save.error}</ErrorAlert>}
      <Field
        label="Name"
        maxLength={NAME_MAX}
        error={invalid}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div>
        <Button
          type="submit"
          className="w-full sm:w-auto"
          disabled={save.busy || name.trim() === device.name}
        >
          {save.busy ? "Saving…" : "Save name"}
        </Button>
      </div>
    </form>
  );
}

function Members({ device }: { device: Device }) {
  const { user } = useAuth();
  const members = useAsync(device.id, () => devices.members(device.id));
  const remove = useAction(async (userId: string) => {
    await devices.removeMember(device.id, userId);
    return true;
  });
  if (members.loading && !members.data) return <Loading />;
  if (members.error !== undefined)
    return <ErrorAlert>{errorText(members.error)}</ErrorAlert>;
  return (
    <div className="grid gap-3">
      {remove.error && <ErrorAlert>{remove.error}</ErrorAlert>}
      <ul className="grid">
        {members.data?.map((m) => (
          <li key={m.userId}>
            <OrderLine
              label={m.isOwner ? "Owner" : "Member"}
              className="min-h-12 items-center py-1.5"
            >
              <span className="flex items-center justify-end gap-3">
                <span className="[overflow-wrap:anywhere]">
                  {m.email}
                  {m.userId === user?.id && (
                    <span className="font-normal text-ink-soft"> (you)</span>
                  )}
                </span>
                {device.isOwner && !m.isOwner && (
                  <Confirm
                    trigger={
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={remove.busy}
                      >
                        Remove
                      </Button>
                    }
                    title={`Remove ${m.email}?`}
                    description="They can't control this cooker from now on. A screen they already have open closes within 20 seconds."
                    action="Remove"
                    onConfirm={() =>
                      void remove
                        .run(m.userId)
                        .then((ok) => ok && members.reload())
                    }
                  />
                )}
              </span>
            </OrderLine>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Invites({ device }: { device: Device }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Open invites only: not accepted and not expired.
  const invites = useAsync(device.id, async () => {
    const now = Date.now();
    return (await devices.invites(device.id)).filter(
      (i) => !i.acceptedAt && Date.parse(i.expiresAt) > now,
    );
  });
  const create = useAction(() => devices.createInvite(device.id));
  const revoke = useAction(async (id: string) => {
    await devices.revokeInvite(id);
    return true;
  });

  const onCreate = async () => {
    setCopied(false);
    const l = await create.run();
    if (l) {
      setLink(l);
      invites.reload();
    }
  };
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const open = invites.data ?? [];
  const linkId = useId();

  return (
    <div className="grid gap-4">
      <h3 className="caps text-sm text-ink-soft">Invite someone</h3>
      <p className="text-sm text-ink-soft">
        Invite links work once and expire after 7 days. Anyone with the link can
        join, so share it only with people you trust.
      </p>
      {create.error && <ErrorAlert>{create.error}</ErrorAlert>}
      <div>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => void onCreate()}
          disabled={create.busy}
        >
          {create.busy ? "Creating…" : "Create invite link"}
        </Button>
      </div>
      {link && (
        <div className="grid gap-1.5">
          <Label htmlFor={linkId}>Invite link</Label>
          <div className="flex gap-2">
            <Input
              id={linkId}
              readOnly
              value={link}
              aria-describedby={`${linkId}-status`}
              className="min-w-0 flex-1"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button className="h-12 shrink-0" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p
            id={`${linkId}-status`}
            aria-live="polite"
            className="text-sm text-ink-soft"
          >
            {copied
              ? "Copied to the clipboard."
              : "This link is shown only once."}
          </p>
        </div>
      )}
      {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
      {open.length > 0 && (
        <ul className="grid">
          {open.map((i) => (
            <li key={i.id}>
              <OrderLine
                label="Open link"
                className="min-h-12 items-center py-1.5"
              >
                <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  <span className="text-sm font-normal">
                    Created {date(i.createdAt)}, expires {date(i.expiresAt)}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={revoke.busy}
                    onClick={() =>
                      void revoke.run(i.id).then((ok) => ok && invites.reload())
                    }
                  >
                    Revoke
                  </Button>
                </span>
              </OrderLine>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One settings ticket: an ink head band naming it, then its sections. */
export function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Ticket aria-labelledby={id}>
      <TicketHead titleAs="h2" titleId={id} title={title} meta={meta} />
      {children}
    </Ticket>
  );
}

function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="link" className="justify-self-start">
      <Link to={to}>{children}</Link>
    </Button>
  );
}

export function DeviceSettingsPage() {
  const { deviceId = "" } = useParams();
  const navigate = useNavigate();
  const device = useAsync(deviceId, () => devices.get(deviceId));
  const unpair = useAction(async () => {
    await devices.unpair(deviceId);
    return true;
  });
  const leave = useAction(async () => {
    await devices.leave(deviceId);
    return true;
  });

  if (device.loading && !device.data) return <Loading />;
  if (!device.data) {
    return (
      <TicketPage width="sm">
        <Ticket>
          <TicketHead titleAs="h1" title="Cooker settings" tone="offline" />
          <TicketSection perforated={false} className="grid gap-5">
            <ErrorAlert>{errorText(device.error)}</ErrorAlert>
            <Button asChild variant="outline" className="w-full">
              <Link to="/" className="no-underline">
                Go to your cookers
              </Link>
            </Button>
          </TicketSection>
        </Ticket>
      </TicketPage>
    );
  }
  const d = device.data;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-3">
      <header className="grid gap-1 px-1">
        <BackLink to={`/devices/${d.id}`}>Back to {d.name}</BackLink>
        <h1 className="font-condensed text-4xl leading-none font-extrabold tracking-[-0.01em] uppercase">
          Cooker settings
        </h1>
      </header>
      <TicketPage width="md">
        {d.isOwner && (
          <Section title="Name">
            <TicketSection perforated={false}>
              <RenameForm key={d.name} device={d} onSaved={device.reload} />
            </TicketSection>
          </Section>
        )}

        <Section title="People">
          <TicketSection perforated={false} className="py-4">
            <Members device={d} />
          </TicketSection>
          {d.isOwner && (
            <TicketSection>
              <Invites device={d} />
            </TicketSection>
          )}
        </Section>

        {d.isOwner ? (
          <Section title="Unpair">
            <TicketSection perforated={false} className="grid gap-4 pb-6">
              <p>
                Removes the cooker from Anova4All for everyone, with its invites
                and cook history. To use it again, set it up over Bluetooth.
              </p>
              {unpair.error && <ErrorAlert>{unpair.error}</ErrorAlert>}
              <Confirm
                trigger={
                  <Button
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    disabled={unpair.busy}
                  >
                    Unpair cooker
                  </Button>
                }
                title={`Unpair ${d.name}?`}
                description="Everyone loses access. This can't be undone."
                action="Unpair"
                onConfirm={() =>
                  void unpair
                    .run()
                    .then((ok) => ok && navigate("/", { replace: true }))
                }
              />
            </TicketSection>
          </Section>
        ) : (
          <Section title="Leave">
            <TicketSection perforated={false} className="grid gap-4 pb-6">
              <p>You'll need a new invite to use this cooker again.</p>
              {leave.error && <ErrorAlert>{leave.error}</ErrorAlert>}
              <Confirm
                trigger={
                  <Button
                    variant="destructive"
                    size="lg"
                    className="w-full"
                    disabled={leave.busy}
                  >
                    Leave cooker
                  </Button>
                }
                title={`Leave ${d.name}?`}
                description="You lose access right away."
                action="Leave"
                onConfirm={() =>
                  void leave
                    .run()
                    .then((ok) => ok && navigate("/", { replace: true }))
                }
              />
            </TicketSection>
          </Section>
        )}
      </TicketPage>
    </div>
  );
}
