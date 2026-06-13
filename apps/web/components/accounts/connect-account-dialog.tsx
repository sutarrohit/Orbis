"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LoginStatus } from "@/lib/api/agents/agents-apis";
import {
  connectDiscordMutationOptions,
  sendCodeMutationOptions,
  verifyCodeMutationOptions,
  verifyPasswordMutationOptions
} from "@/lib/api/agents/agents-queries";
import { accountKeys } from "@/lib/api/accounts/accounts-queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

type Platform = "telegram" | "discord";
type Step = "phone" | "code" | "password";

export function ConnectAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("telegram");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");

  function resetFields() {
    setStep("phone");
    setPhone("");
    setCode("");
    setPassword("");
    setToken("");
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setPlatform("telegram");
      resetFields();
    }
  }

  function selectPlatform(next: Platform) {
    if (next === platform) return;
    setPlatform(next);
    resetFields();
  }

  function handleResult(status: LoginStatus) {
    if (status === "connected") {
      queryClient.invalidateQueries({ queryKey: accountKeys.all });
      toast.success("Account connected");
      onOpenChange(false);
    } else if (status === "password_needed") {
      setStep("password");
    } else if (status === "code_sent") {
      setStep("code");
    }
  }

  function onError(error: unknown) {
    toast.error(error instanceof Error ? error.message : "Login step failed");
  }

  const sendCodeM = useMutation({ ...sendCodeMutationOptions(), onSuccess: (r) => handleResult(r.status), onError });
  const verifyCodeM = useMutation({ ...verifyCodeMutationOptions(), onSuccess: (r) => handleResult(r.status), onError });
  const verifyPasswordM = useMutation({
    ...verifyPasswordMutationOptions(),
    onSuccess: (r) => handleResult(r.status),
    onError
  });
  const connectDiscordM = useMutation({
    ...connectDiscordMutationOptions(),
    onSuccess: (r) => handleResult(r.status),
    onError
  });

  const pending =
    sendCodeM.isPending || verifyCodeM.isPending || verifyPasswordM.isPending || connectDiscordM.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (platform === "discord") {
      connectDiscordM.mutate({ token: token.trim() });
      return;
    }
    if (step === "phone") sendCodeM.mutate({ phone: phone.trim() });
    else if (step === "code") verifyCodeM.mutate({ phone: phone.trim(), code: code.trim() });
    else verifyPasswordM.mutate({ phone: phone.trim(), password });
  }

  // The platform picker only makes sense before a multi-step Telegram flow starts.
  const showPicker = platform === "discord" || step === "phone";

  const submitLabel =
    platform === "discord" ? "Connect" : step === "phone" ? "Send code" : step === "code" ? "Verify" : "Submit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Connect account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect an account</DialogTitle>
          <DialogDescription>
            {platform === "discord"
              ? "Paste the Discord user token for the account."
              : step === "phone"
                ? "Enter the phone number for the Telegram account."
                : step === "code"
                  ? "Enter the code Telegram sent to that number."
                  : "This account has 2FA enabled — enter its password."}
          </DialogDescription>
        </DialogHeader>

        {showPicker && (
          <div className='flex gap-2'>
            <Button
              type='button'
              variant={platform === "telegram" ? "default" : "outline"}
              className='flex-1'
              onClick={() => selectPlatform("telegram")}
            >
              Telegram
            </Button>
            <Button
              type='button'
              variant={platform === "discord" ? "default" : "outline"}
              className='flex-1'
              onClick={() => selectPlatform("discord")}
            >
              Discord
            </Button>
          </div>
        )}

        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          {platform === "discord" && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='token'>User token</Label>
              <Input
                id='token'
                type='password'
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder='Discord user token'
                autoFocus
                required
              />
              <p className='text-muted-foreground text-xs'>
                Self-bot automation violates Discord&apos;s Terms of Service — the account may be banned. Use a
                disposable account.
              </p>
            </div>
          )}

          {platform === "telegram" && step === "phone" && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='phone'>Phone number</Label>
              <Input
                id='phone'
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder='+1 555 123 4567'
                autoFocus
                required
              />
            </div>
          )}
          {platform === "telegram" && step === "code" && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='code'>Verification code</Label>
              <Input
                id='code'
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode='numeric'
                autoFocus
                required
              />
            </div>
          )}
          {platform === "telegram" && step === "password" && (
            <div className='flex flex-col gap-2'>
              <Label htmlFor='password'>2FA password</Label>
              <Input
                id='password'
                type='password'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}

          <DialogFooter>
            <Button type='submit' disabled={pending}>
              {pending ? <Spinner /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
