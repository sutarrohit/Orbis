import { mutationOptions, queryOptions } from "@tanstack/react-query";
import {
  connectBot,
  getSchedulerStatus,
  runLeader,
  runResearch,
  runSearch,
  schedulerAction,
  sendCode,
  verifyCode,
  verifyPassword
} from "./agents-apis";

export const schedulerKeys = {
  status: ["agents", "scheduler", "status"] as const
};

export function schedulerStatusQueryOptions() {
  return queryOptions({
    queryKey: schedulerKeys.status,
    queryFn: getSchedulerStatus
  });
}

export function schedulerActionMutationOptions() {
  return mutationOptions({
    mutationKey: ["agents", "scheduler", "action"],
    mutationFn: schedulerAction
  });
}

export function runSearchMutationOptions() {
  return mutationOptions({ mutationKey: ["agents", "search", "run"], mutationFn: runSearch });
}

export function runResearchMutationOptions() {
  return mutationOptions({ mutationKey: ["agents", "research", "run"], mutationFn: runResearch });
}

export function runLeaderMutationOptions() {
  return mutationOptions({ mutationKey: ["agents", "leader", "run"], mutationFn: runLeader });
}

export function sendCodeMutationOptions() {
  return mutationOptions({
    mutationKey: ["agents", "accounts", "send-code"],
    mutationFn: sendCode
  });
}

export function verifyCodeMutationOptions() {
  return mutationOptions({
    mutationKey: ["agents", "accounts", "verify-code"],
    mutationFn: verifyCode
  });
}

export function verifyPasswordMutationOptions() {
  return mutationOptions({
    mutationKey: ["agents", "accounts", "verify-password"],
    mutationFn: verifyPassword
  });
}

export function connectBotMutationOptions() {
  return mutationOptions({
    mutationKey: ["agents", "accounts", "connect-bot"],
    mutationFn: connectBot
  });
}
