"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Copy, LogOut, UserPlus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-provider";
import { useHousehold, switchHousehold } from "@/lib/household-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export default function HouseholdPage() {
  const { user } = useAuth();
  const { householdId, household, members, loading } = useHousehold();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const myRole = members.find((m) => m.user_id === user?.id)?.role;
  const isOwner = myRole === "owner";
  const otherCount = members.filter((m) => m.user_id !== user?.id).length;

  async function renameHousehold(e: FormEvent) {
    e.preventDefault();
    if (!householdId || !name.trim()) return;
    setSavingName(true);
    const { error } = await supabase
      .from("households")
      .update({ name: name.trim() })
      .eq("id", householdId);
    setSavingName(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Household renamed");
      setName("");
    }
  }

  async function makeInvite() {
    if (!householdId) return;
    setCreatingInvite(true);
    const { data, error } = await supabase.rpc("create_household_invite", { hid: householdId });
    setCreatingInvite(false);
    if (error) toast.error(error.message);
    else setInvite(data as string);
  }

  async function copyInvite() {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select the code and copy it manually");
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    const { data, error } = await supabase.rpc("redeem_household_invite", { invite_code: code });
    if (error) {
      setJoining(false);
      toast.error(error.message);
      return;
    }
    toast.success("Joined — loading the shared data…");
    await switchHousehold(data as string); // resets local cache + reloads
  }

  async function leave() {
    if (!householdId) return;
    setLeaving(true);
    const { error } = await supabase.rpc("leave_household", { hid: householdId });
    if (error) {
      setLeaving(false);
      toast.error(error.message);
      return;
    }
    toast.success("Left the household");
    await switchHousehold(null);
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Household</h1>
        <p className="text-sm text-muted-foreground">
          Share one set of finances with a partner. Everyone in a household sees and edits the same
          accounts, budgets, and transactions.
        </p>
      </div>

      <Card className="space-y-4 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Users className="size-4 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{household?.name ?? "My household"}</p>
            <p className="text-xs text-muted-foreground">
              {members.length === 1
                ? "Just you"
                : `You and ${otherCount} other member${otherCount === 1 ? "" : "s"}`}
              {myRole ? ` · ${myRole}` : ""}
            </p>
          </div>
        </div>

        {isOwner && (
          <form className="flex items-end gap-2" onSubmit={renameHousehold}>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="hh-name">Rename</Label>
              <Input
                id="hh-name"
                placeholder={household?.name ?? "Household name"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={savingName || !name.trim()}>
              Save
            </Button>
          </form>
        )}
      </Card>

      <Card className="space-y-3 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <UserPlus className="size-4 text-muted-foreground" /> Invite someone
        </div>
        <p className="text-xs text-muted-foreground">
          Generate a code and share it. They enter it under “Join a household” on their own device.
          Codes expire after 7 days.
        </p>
        {invite ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-input bg-muted/50 px-3 py-2 text-center text-lg font-semibold tracking-[0.2em] tabular-nums">
              {invite}
            </code>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyInvite}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={creatingInvite || !householdId}
            onClick={makeInvite}
          >
            <UserPlus className="size-3.5" />
            {creatingInvite ? "Creating…" : "Create invite code"}
          </Button>
        )}
      </Card>

      <Card className="space-y-3 px-4 py-4">
        <div className="text-sm font-medium">Join a household</div>
        <p className="text-xs text-muted-foreground">
          Entering a code moves this device into that household. Your current data stays on your own
          household — you can be in more than one.
        </p>
        <form className="flex items-end gap-2" onSubmit={join}>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="hh-join">Invite code</Label>
            <Input
              id="hh-join"
              placeholder="ABCD1234"
              className="tracking-[0.2em] uppercase"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={joining || !joinCode.trim()}>
            {joining ? "Joining…" : "Join"}
          </Button>
        </form>
      </Card>

      {members.length > 1 && (
        <Card className="space-y-3 px-4 py-4">
          <div className="text-sm font-medium">Leave this household</div>
          <p className="text-xs text-muted-foreground">
            You&rsquo;ll stop seeing its shared finances on this device. The data stays for the
            remaining members.
          </p>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="gap-1.5"
            disabled={leaving}
            onClick={leave}
          >
            <LogOut className="size-3.5" />
            {leaving ? "Leaving…" : "Leave household"}
          </Button>
        </Card>
      )}
    </div>
  );
}
