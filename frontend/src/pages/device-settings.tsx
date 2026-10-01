import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Confirm } from "@/components/confirm.tsx";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Separator } from "@/components/ui/separator.tsx";
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
    <form noValidate onSubmit={onSubmit} className="grid gap-3">
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
    <div className="grid gap-2">
      {remove.error && <ErrorAlert>{remove.error}</ErrorAlert>}
      <ul className="grid gap-2">
        {members.data?.map((m) => (
          <li
            key={m.userId}
            className="flex items-center justify-between gap-4"
          >
            <span>
              {m.email}
              {m.isOwner && (
                <span className="text-muted-foreground"> (owner)</span>
              )}
              {m.userId === user?.id && (
                <span className="text-muted-foreground"> (you)</span>
              )}
            </span>
            {device.isOwner && !m.isOwner && (
              <Confirm
                trigger={
                  <Button variant="outline" size="sm" disabled={remove.busy}>
                    Remove
                  </Button>
                }
                title={`Remove ${m.email}?`}
                description="They lose access to this cooker right away."
                action="Remove"
                onConfirm={() =>
                  void remove.run(m.userId).then((ok) => ok && members.reload())
                }
              />
            )}
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

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Invite links work once and expire after 7 days. Anyone with the link can
        join, so share it only with people you trust.
      </p>
      {create.error && <ErrorAlert>{create.error}</ErrorAlert>}
      <div>
        <Button onClick={() => void onCreate()} disabled={create.busy}>
          {create.busy ? "Creating…" : "Create invite link"}
        </Button>
      </div>
      {link && (
        <div className="grid gap-2">
          <Field
            label="Invite link"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              Copy link
            </Button>
            <span aria-live="polite" className="text-sm text-muted-foreground">
              {copied ? "Copied" : "This link is shown only once."}
            </span>
          </div>
        </div>
      )}
      {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
      {open.length > 0 && (
        <ul className="grid gap-2">
          {open.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span>
                Created {date(i.createdAt)}, expires {date(i.expiresAt)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.busy}
                onClick={() =>
                  void revoke.run(i.id).then((ok) => ok && invites.reload())
                }
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3" aria-labelledby={title}>
      <h2 id={title} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
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
      <div className="grid gap-4">
        <ErrorAlert>{errorText(device.error)}</ErrorAlert>
        <Link to="/" className="underline">
          Go to your cookers
        </Link>
      </div>
    );
  }
  const d = device.data;

  return (
    <div className="grid gap-6">
      <div>
        <Link to={`/devices/${d.id}`} className="text-sm underline">
          Back to {d.name}
        </Link>
        <h1 className="text-2xl font-semibold">Cooker settings</h1>
      </div>

      {d.isOwner && (
        <Section title="Name">
          <RenameForm key={d.name} device={d} onSaved={device.reload} />
        </Section>
      )}

      <Separator />
      <Section title="People">
        <Members device={d} />
      </Section>

      {d.isOwner && (
        <>
          <Separator />
          <Section title="Invite someone">
            <Invites device={d} />
          </Section>
        </>
      )}

      <Separator />
      {d.isOwner ? (
        <Section title="Unpair">
          <p className="text-sm text-muted-foreground">
            Removes the cooker from Anova4All for everyone, with its invites and
            cook history. To use it again, set it up over Bluetooth.
          </p>
          {unpair.error && <ErrorAlert>{unpair.error}</ErrorAlert>}
          <div>
            <Confirm
              trigger={
                <Button variant="destructive" disabled={unpair.busy}>
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
          </div>
        </Section>
      ) : (
        <Section title="Leave">
          <p className="text-sm text-muted-foreground">
            You'll need a new invite to use this cooker again.
          </p>
          {leave.error && <ErrorAlert>{leave.error}</ErrorAlert>}
          <div>
            <Confirm
              trigger={
                <Button variant="destructive" disabled={leave.busy}>
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
          </div>
        </Section>
      )}
    </div>
  );
}
