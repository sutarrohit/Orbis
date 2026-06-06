import { mutationOptions } from "@tanstack/react-query";
import { sendCode, verifyCode, verifyPassword } from "./agents-apis";

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
