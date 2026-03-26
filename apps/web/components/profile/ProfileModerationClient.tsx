"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteProfileGuestbookEntry,
  fetchProfileGuestbook,
  hideProfileGuestbookEntry,
  restoreProfileGuestbookEntry,
  type ApiProfileGuestbookEntry
} from "../../lib/indexerApi";
import {
  actionStateStatusItem,
  errorActionState,
  idleActionState,
  pendingActionState,
  successActionState,
  type ActionState
} from "../../lib/actionState";
import StatusStack from "../StatusStack";
import { truncateAddress } from "../../lib/marketplace";

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function getModerationActorLabel(actorAddress: string | null | undefined, ownerAddress: string): string {
  const normalizedActor = String(actorAddress || "").trim().toLowerCase();
  if (!normalizedActor) return "Unknown moderator";
  if (normalizedActor == ownerAddress) return "Owner";
  return "Moderator " + truncateAddress(normalizedActor as `0x${string}`);
}

function getEntryStatus(entry: ApiProfileGuestbookEntry): "Visible" | "Hidden" | "Deleted" {
  if (entry.deletedAt) return "Deleted";
  if (entry.hiddenAt) return "Hidden";
  return "Visible";
}

export default function ProfileModerationClient() {
  const [profileName, setProfileName] = useState("");
  const [actorAddress, setActorAddress] = useState("");
  const [entries, setEntries] = useState<ApiProfileGuestbookEntry[]>([]);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<ActionState>(idleActionState());
  const [mutationState, setMutationState] = useState<ActionState>(idleActionState());

  const normalizedProfileName = useMemo(() => profileName.trim(), [profileName]);
  const normalizedActorAddress = useMemo(() => actorAddress.trim().toLowerCase(), [actorAddress]);
  const counts = useMemo(
    () => ({
      visible: entries.filter((entry) => !entry.hiddenAt && !entry.deletedAt).length,
      hidden: entries.filter((entry) => entry.hiddenAt && !entry.deletedAt).length,
      deleted: entries.filter((entry) => entry.deletedAt).length
    }),
    [entries]
  );

  async function loadEntries() {
    if (!normalizedProfileName) {
      setLoadState(errorActionState("Profile name is required."));
      return;
    }
    if (!isAddress(normalizedActorAddress)) {
      setLoadState(errorActionState("A valid actor wallet address is required to load moderation history."));
      return;
    }
    setLoadState(pendingActionState("Loading guestbook moderation view..."));
    try {
      const response = await fetchProfileGuestbook(normalizedProfileName, {
        includeHidden: true,
        actorAddress: normalizedActorAddress
      });
      setEntries(response.entries || []);
      setLoadState(successActionState("Guestbook moderation data loaded."));
    } catch (error) {
      setLoadState(errorActionState(error instanceof Error ? error.message : "Failed to load guestbook moderation data."));
    }
  }

  async function hideEntry(entryId: string) {
    if (!normalizedProfileName || !isAddress(normalizedActorAddress)) {
      setMutationState(errorActionState("A valid actor wallet address is required."));
      return;
    }
    setActiveEntryId(entryId);
    setMutationState(pendingActionState("Hiding guestbook entry..."));
    try {
      const response = await hideProfileGuestbookEntry({
        name: normalizedProfileName,
        entryId,
        currentOwnerAddress: normalizedActorAddress
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? { ...entry, hiddenAt: response.entry.hiddenAt || new Date().toISOString(), hiddenBy: response.entry.hiddenBy || normalizedActorAddress }
            : entry
        )
      );
      setMutationState(successActionState("Guestbook entry hidden."));
    } catch (error) {
      setMutationState(errorActionState(error instanceof Error ? error.message : "Failed to hide guestbook entry."));
    } finally {
      setActiveEntryId(null);
    }
  }

  async function restoreEntry(entryId: string) {
    if (!normalizedProfileName || !isAddress(normalizedActorAddress)) {
      setMutationState(errorActionState("A valid actor wallet address is required."));
      return;
    }
    setActiveEntryId(entryId);
    setMutationState(pendingActionState("Restoring guestbook entry..."));
    try {
      const response = await restoreProfileGuestbookEntry({
        name: normalizedProfileName,
        entryId,
        currentOwnerAddress: normalizedActorAddress
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                hiddenAt: response.entry.hiddenAt || null,
                hiddenBy: response.entry.hiddenBy || null,
                deletedAt: response.entry.deletedAt || null,
                deletedBy: response.entry.deletedBy || null
              }
            : entry
        )
      );
      setMutationState(successActionState("Guestbook entry restored."));
    } catch (error) {
      setMutationState(errorActionState(error instanceof Error ? error.message : "Failed to restore guestbook entry."));
    } finally {
      setActiveEntryId(null);
    }
  }

  async function deleteEntry(entryId: string) {
    if (!normalizedProfileName || !isAddress(normalizedActorAddress)) {
      setMutationState(errorActionState("A valid actor wallet address is required."));
      return;
    }
    setActiveEntryId(entryId);
    setMutationState(pendingActionState("Deleting guestbook entry..."));
    try {
      await deleteProfileGuestbookEntry({
        name: normalizedProfileName,
        entryId,
        currentOwnerAddress: normalizedActorAddress
      });
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId ? { ...entry, deletedAt: new Date().toISOString(), deletedBy: normalizedActorAddress } : entry
        )
      );
      setMutationState(successActionState("Guestbook entry deleted."));
    } catch (error) {
      setMutationState(errorActionState(error instanceof Error ? error.message : "Failed to delete guestbook entry."));
    } finally {
      setActiveEntryId(null);
    }
  }

  return (
    <section className="wizard">
      <div className="card formCard profileStudioCard">
        <h2>Profile Moderation</h2>
        <p className="sectionLead">
          Owner and moderator tools for Myspace-style guestbook entries. This workspace now loads the public queue plus hidden and deleted history for the actor wallet.
        </p>
        <div className="gridMini">
          <label>
            Profile name
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="demo" />
          </label>
          <label>
            Actor wallet
            <input value={actorAddress} onChange={(event) => setActorAddress(event.target.value)} placeholder="0x..." />
          </label>
        </div>
        <div className="row">
          <button type="button" onClick={() => void loadEntries()} disabled={loadState.status === "pending"}>
            {loadState.status === "pending" ? "Loading..." : "Load Guestbook"}
          </button>
          {normalizedProfileName ? (
            <Link href={"/profile/" + encodeURIComponent(normalizedProfileName)} className="ctaLink secondaryLink">
              Open profile
            </Link>
          ) : null}
        </div>
        <StatusStack items={[actionStateStatusItem(loadState, "guestbook-moderation-load"), actionStateStatusItem(mutationState, "guestbook-moderation-mutation")]} />
      </div>

      <div className="card formCard profileStudioCard">
        <h3>Guestbook Queue</h3>
        <p className="hint">Visible: {counts.visible} | Hidden: {counts.hidden} | Deleted: {counts.deleted}</p>
        {entries.length === 0 ? <p className="hint">No guestbook entries loaded yet.</p> : null}
        {entries.length > 0 ? (
          <div className="listTable">
            {entries.map((entry) => {
              const isBusy = activeEntryId === entry.id;
              const status = getEntryStatus(entry);
              return (
                <div key={entry.id} className="listRow profileDirectoryRow">
                  <span>
                    <strong>Author</strong> {entry.authorName}
                    {entry.authorAddress ? <span className="mono"> {truncateAddress(entry.authorAddress as `0x${string}`)}</span> : null}
                  </span>
                  <span>
                    <strong>Posted</strong> {new Date(entry.createdAt).toLocaleString()}
                  </span>
                  <span>
                    <strong>Status</strong> {status}
                  </span>
                  <span>{entry.message}</span>
                  {entry.hiddenAt ? <span className="hint">Hidden {new Date(entry.hiddenAt).toLocaleString()} by {getModerationActorLabel(entry.hiddenBy, normalizedActorAddress)}</span> : null}
                  {entry.deletedAt ? <span className="hint">Deleted {new Date(entry.deletedAt).toLocaleString()} by {getModerationActorLabel(entry.deletedBy, normalizedActorAddress)}</span> : null}
                  <div className="row">
                    {!entry.hiddenAt && !entry.deletedAt ? (
                      <button type="button" disabled={isBusy} onClick={() => void hideEntry(entry.id)}>
                        Hide Entry
                      </button>
                    ) : null}
                    {entry.hiddenAt || entry.deletedAt ? (
                      <button type="button" disabled={isBusy} onClick={() => void restoreEntry(entry.id)}>
                        Restore Entry
                      </button>
                    ) : null}
                    {!entry.deletedAt ? (
                      <button type="button" disabled={isBusy} onClick={() => void deleteEntry(entry.id)}>
                        Delete Entry
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}
