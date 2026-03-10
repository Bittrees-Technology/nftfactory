import { actionStateStatusItem, type ActionState } from "./actionState";
import { loadStateStatusItem, type LoadState } from "./loadState";
import { errorStatus, hintStatus, type StatusItem } from "./statusItems";

type SectionLoadStatusOptions = {
  keyPrefix: string;
  loadState: LoadState;
  loadingMessage?: string;
  readyMessage?: string;
  hintMessage?: string | null;
  errorMessage?: string | null;
  actionState?: ActionState | null;
  actionFirst?: boolean;
};

export function buildSectionLoadStatusItems({
  keyPrefix,
  loadState,
  loadingMessage,
  readyMessage,
  hintMessage,
  errorMessage,
  actionState,
  actionFirst = false
}: SectionLoadStatusOptions): StatusItem[] {
  const loadItem = loadStateStatusItem(loadState, `${keyPrefix}-load`, {
    loadingMessage,
    readyMessage
  });
  const hintItem = hintStatus(hintMessage, `${keyPrefix}-hint`);
  const errorItem = errorStatus(errorMessage, `${keyPrefix}-error`);
  const actionItem = actionState ? actionStateStatusItem(actionState, `${keyPrefix}-action`) : null;

  if (actionFirst && actionItem) {
    return [actionItem, loadItem, hintItem, errorItem];
  }

  return actionItem ? [loadItem, hintItem, errorItem, actionItem] : [loadItem, hintItem, errorItem];
}
