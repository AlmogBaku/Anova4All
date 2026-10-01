import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, Plus, Share } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { Confirm } from "@/components/confirm.tsx";
import { Field } from "@/components/field.tsx";
import { ErrorAlert, Loading } from "@/components/status.tsx";
import {
  Avatar,
  GroupedList,
  ListItem,
  ListItemContent,
  ListItemEnd,
  ListItemSecondary,
  SectionHeader,
} from "@/components/settings/grouped-list.tsx";
import { Sheet, SheetContent } from "@/components/settings/sheet.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { useAction } from "@/hooks/use-action.ts";
import { useAsync } from "@/hooks/use-async.ts";
import { useDeviceStream } from "@/hooks/use-device-stream.ts";
import { useAuth } from "@/contexts/auth.tsx";
import { linkView } from "@/lib/api/device-stream.ts";
import { devices } from "@/lib/data.ts";
import { NAME_MAX, validateDeviceName, type Device } from "@/lib/devices.ts";
import { errorText } from "@/lib/errors.ts";

const date = (iso: string) => new Date(iso).toLocaleDateString();

/** The cooker's live status line: online with the water temperature, or why not. */
function LiveStatus({ deviceId }: { deviceId: string }) {
  const stream = useDeviceStream(deviceId);
  const state = stream.status?.state;
  switch (linkView(stream)) {
    case "online":
      return state
        ? `Online · ${state.current_temperature} °${state.unit.toUpperCase()}`
        : "Online";
    case "cooker_offline":
      return "Offline";
    case "stream_down":
      return "Reconnecting…";
    case "connecting":
      return "Checking…";
    default:
      return "Unavailable";
  }
}

function RenameSheet({
  device,
  open,
  onOpenChange,
  onSaved,
}: {
  device: Device;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
    if (!err && (await save.run(name))) {
      onSaved();
      onOpenChange(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Rename cooker">
        <form noValidate onSubmit={onSubmit} className="grid gap-4">
          {save.error && <ErrorAlert>{save.error}</ErrorAlert>}
          <Field
            label="Name"
            maxLength={NAME_MAX}
            error={invalid}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={save.busy || name.trim() === device.name}
          >
            {save.busy ? "Saving…" : "Save name"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function MemberSheet({
  device,
  member,
  open,
  onOpenChange,
  onRemoved,
}: {
  device: Device;
  member: { userId: string; email: string; isOwner: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved: () => void;
}) {
  const remove = useAction(async () => {
    await devices.removeMember(device.id, member.userId);
    return true;
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={member.email}>
        <div className="grid gap-4">
          {remove.error && <ErrorAlert>{remove.error}</ErrorAlert>}
          <p className="text-sm text-ink-soft">
            Remove {member.email} from this cooker? They can't control it from
            now on. A screen they already have open closes within 20 seconds.
          </p>
          <Confirm
            trigger={
              <Button variant="destructive" size="lg" className="w-full">
                Remove member
              </Button>
            }
            title={`Remove ${member.email}?`}
            description="They can't control this cooker from now on. A screen they already have open closes within 20 seconds."
            action="Remove"
            onConfirm={() =>
              void remove.run().then((ok) => {
                if (ok) {
                  onRemoved();
                  onOpenChange(false);
                }
              })
            }
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InviteSheet({
  device,
  open,
  onOpenChange,
}: {
  device: Device;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
  const share = async () => {
    if (!link || !navigator.share) return;
    try {
      await navigator.share({ url: link });
    } catch {
      // User cancelled
    }
  };
  const open_invites = invites.data ?? [];
  const linkId = useId();

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setLink(null);
          setCopied(false);
        }
      }}
    >
      <SheetContent title="Invite someone">
        <p className="text-sm text-ink-soft">
          The link works once and expires in 7 days. Anyone with it can control
          this cooker.
        </p>
        {create.error && <ErrorAlert>{create.error}</ErrorAlert>}
        {!link && (
          <Button
            size="lg"
            className="w-full"
            onClick={() => void onCreate()}
            disabled={create.busy}
          >
            {create.busy ? "Creating…" : "Create invite link"}
          </Button>
        )}
        {link && (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={linkId} className="sr-only">
                Invite link
              </Label>
              <Input
                id={linkId}
                readOnly
                value={link}
                aria-describedby={`${linkId}-status`}
                className="h-12 min-w-0 bg-well text-[0.8125rem] text-ink-soft"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div className="flex gap-2.5">
              {"share" in navigator && (
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={() => void share()}
                >
                  <Share />
                  Share
                </Button>
              )}
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => void copy()}
              >
                <Copy />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p
              id={`${linkId}-status`}
              aria-live="polite"
              className="text-center text-sm text-ink-soft"
            >
              {copied
                ? "Copied to the clipboard."
                : "This link is shown only once."}
            </p>
          </div>
        )}
        {revoke.error && <ErrorAlert>{revoke.error}</ErrorAlert>}
        {open_invites.length > 0 && (
          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Open invites</h3>
            <ul className="grid gap-2">
              {open_invites.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-ink-soft">
                    Created {date(i.createdAt)} · Expires {date(i.expiresAt)}
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
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Members({ device }: { device: Device }) {
  const { user } = useAuth();
  const members = useAsync(device.id, () => devices.members(device.id));
  const [selectedMember, setSelectedMember] = useState<{
    userId: string;
    email: string;
    isOwner: boolean;
  } | null>(null);

  if (members.loading && !members.data) return <Loading />;
  if (members.error !== undefined)
    return <ErrorAlert>{errorText(members.error)}</ErrorAlert>;

  return (
    <>
      {members.data?.map((m) => {
        const isYou = m.userId === user?.id;
        const canRemove = device.isOwner && !m.isOwner;
        return (
          <ListItem
            key={m.userId}
            onClick={canRemove ? () => setSelectedMember(m) : undefined}
            role={canRemove ? "button" : undefined}
            aria-label={
              canRemove
                ? `Remove ${m.email}`
                : `${m.email}, ${m.isOwner ? "Owner" : "Member"}`
            }
          >
            <Avatar>{m.email.charAt(0).toUpperCase()}</Avatar>
            <ListItemContent>
              <div className="font-medium">{m.email}</div>
              <ListItemSecondary>
                {m.isOwner ? "Owner" : "Member"}
                {isYou && " · you"}
              </ListItemSecondary>
            </ListItemContent>
            {canRemove && (
              <ListItemEnd>
                <ChevronRight className="size-4 text-hairline" />
              </ListItemEnd>
            )}
          </ListItem>
        );
      })}
      {selectedMember && (
        <MemberSheet
          device={device}
          member={selectedMember}
          open={!!selectedMember}
          onOpenChange={(open) => !open && setSelectedMember(null)}
          onRemoved={() => {
            setSelectedMember(null);
            members.reload();
          }}
        />
      )}
    </>
  );
}

/**
 * One settings ticket on its own short length of rail, so every ticket on the
 * page hangs rather than only the first. Padding matches TicketPage.
 */
export function Section({
  title,
  meta,
  children,
}: {
  /** Omitted: no heading (and no label), for a lone action group. */
  title?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className="grid gap-2">
      {title && <SectionHeader id={id}>{title}</SectionHeader>}
      {meta && <p className="px-2 text-sm text-ink-soft">{meta}</p>}
      <GroupedList>{children}</GroupedList>
    </section>
  );
}

export function DeviceSettingsPage() {
  const { deviceId = "" } = useParams();
  const navigate = useNavigate();
  const device = useAsync(deviceId, () => devices.get(deviceId));
  const [renameOpen, setRenameOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
      <div className="mx-auto grid w-full max-w-xl gap-6 px-6 py-8">
        <ErrorAlert>{errorText(device.error)}</ErrorAlert>
        <Button asChild variant="outline" className="w-full">
          <Link to="/" className="no-underline">
            Go to your cookers
          </Link>
        </Button>
      </div>
    );
  }
  const d = device.data;

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5 px-6 pb-8 pt-3">
      <header className="grid gap-0.5">
        <Button
          asChild
          variant="link"
          className="h-auto min-h-0 justify-start px-0 py-1.5 text-ink-soft"
        >
          <Link to={`/devices/${d.id}`}>
            <ChevronLeft className="size-4" />
            Back
          </Link>
        </Button>
        <h1 className="px-1 text-[1.875rem] font-medium leading-[1.15] tracking-[-0.03em]">
          {d.name}
        </h1>
      </header>

      <Section title="Cooker">
        {d.isOwner && (
          <ListItem
            onClick={() => setRenameOpen(true)}
            role="button"
            aria-label="Rename cooker"
          >
            <ListItemContent>Name</ListItemContent>
            <ListItemEnd>
              {d.name}
              <ChevronRight className="size-3.5 text-hairline" />
            </ListItemEnd>
          </ListItem>
        )}
        <ListItem>
          <ListItemContent>Status</ListItemContent>
          <ListItemEnd>
            <LiveStatus deviceId={d.id} />
          </ListItemEnd>
        </ListItem>
      </Section>

      <Section title="People">
        <Members device={d} />
        {d.isOwner && (
          <ListItem
            onClick={() => setInviteOpen(true)}
            role="button"
            aria-label="Invite someone"
            className="text-ink"
          >
            <Avatar className="text-ink">
              <Plus className="size-3.5" />
            </Avatar>
            <ListItemContent>Invite someone</ListItemContent>
          </ListItem>
        )}
      </Section>

      {(unpair.error ?? leave.error) && (
        <ErrorAlert>{unpair.error ?? leave.error}</ErrorAlert>
      )}

      {d.isOwner ? (
        <Section>
          <Confirm
            trigger={
              <ListItem
                role="button"
                aria-label="Unpair this cooker"
                className="text-destructive"
              >
                <ListItemContent>Unpair this cooker</ListItemContent>
              </ListItem>
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
        </Section>
      ) : (
        <Section>
          <Confirm
            trigger={
              <ListItem
                role="button"
                aria-label="Leave this cooker"
                className="text-destructive"
              >
                <ListItemContent>Leave this cooker</ListItemContent>
              </ListItem>
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
        </Section>
      )}

      {d.isOwner && (
        <RenameSheet
          device={d}
          open={renameOpen}
          onOpenChange={setRenameOpen}
          onSaved={device.reload}
        />
      )}
      {d.isOwner && (
        <InviteSheet
          device={d}
          open={inviteOpen}
          onOpenChange={setInviteOpen}
        />
      )}
    </div>
  );
}
