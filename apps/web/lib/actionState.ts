import { asyncActionStatus, type StatusItem } from "./statusItems";

export type ActionState = {
  status: "idle" | "pending" | "success" | "error";
  message?: string;
  hash?: string;
  chainId?: number;
};

export function idleActionState(message?: string, hash?: string, chainId?: number): ActionState {
  return { status: "idle", message, hash, chainId };
}

export function pendingActionState(message: string, hash?: string, chainId?: number): ActionState {
  return { status: "pending", message, hash, chainId };
}

export function successActionState(message: string, hash?: string, chainId?: number): ActionState {
  return { status: "success", message, hash, chainId };
}

export function errorActionState(message: string, hash?: string, chainId?: number): ActionState {
  return { status: "error", message, hash, chainId };
}

export function actionStateStatusItem(state: ActionState, key?: string): StatusItem {
  return asyncActionStatus(state.status, state.message, key);
}
