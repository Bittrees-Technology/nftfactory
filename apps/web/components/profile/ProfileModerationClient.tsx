"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteProfileGuestbookEntry,
  fetchProfileGuestbook,
  hideProfileGuestbookEntry,
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

export default function ProfileModerationClient() {
  const [profileName, setProfileName] = useState("");
  const [actorAddress, setActorAddress] = useState("");
  const [entries, setEntries] = useState<ApiProfileGuestbookEntry[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<ActionState>(idleActionState());
  const [mutationState, setMutationState] = useState<ActionState>(idleActionState());

  const normalizedProfileName = useMemo(() => profileName.trim(), [profileName]);
  const normalizedActorAddress = useMemo(() => actorAddress.trim().toLowerCase(), [actorAddress]);

  async function loadEntries() {
    if (!normalizedProfileName) {
      setLoadState(errorActionState("Profile name is required."));
      return;
    }
    setLoadState(pendingActionState("Loading guestbook moderation view..."));
    try {
      const response = await fetchProfileGuestbook(normalizedProfileName);
      setEntries(response.entries || []);
      setVisibleCount((response.entries || []).length);
      setHiddenCount(0);
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
      setEntries((current) => current.map((entry) => (entry.id === entryId ? { ...entry, hiddenAt: response.entry.hiddenAt || new Date().toISOString() } : entry)));
      setVisibleCount((current) => Math.max(0, current - 1));
      setHiddenCount((current) => current + 1);
      setMutationState(successActionState("Guestbook entry hidden."));
    } catch (error) {
      setMutationState(errorActionState(error instanceof Error ? error.message : "Failed to hide guestbook entry."));
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
      setEntries((current) => current.filter((entry) => entry.id !== entryId));
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
          Owner and moderator tools for Myspace-style guestbook entries. Use this to triage the current public guestbook queue without opening each profile manually.
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
            <Link href={`/profile/${encodeURIComponent(normalizedProfileName)}`} className="ctaLink secondaryLink">
              Open profile
            </Link>
          ) : null}
        </div>
        <StatusStack items={[actionStateStatusItem(loadState, "guestbook-moderation-load"), actionStateStatusItem(mutationState, "guestbook-moderation-mutation")]} />
      </div>

      <div className="card formCard profileStudioCard">
        <h3>Guestbook Queue</h3>
        <p className="hint">Visible: {visibleCount} | Hidden: {hiddenCount}</p>
        {entries.length === 0 ? <p className="hint">No guestbook entries loaded yet.</p> : null}
        {entries.length > 0 ? (
          <div className="listTable">
            {entries.map((entry) => {
              const isBusy = activeEntryId === entry.id;
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
                    <strong>Status</strong> {entry.hiddenAt ? "Hidden" : "Visible"}
                  </span>
                  <span>{entry.message}</span>
                  <div className="row">
                    {!entry.hiddenAt ? (
                      <button type="button" disabled={isBusy} onClick={() => void hideEntry(entry.id)}>
                        Hide Entry
                      </button>
                    ) : null}
                    <button type="button" disabled={isBusy} onClick={() => void deleteEntry(entry.id)}>
                      Delete Entry
                    </button>
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
