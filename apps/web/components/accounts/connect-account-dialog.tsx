"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LoginStatus } from "@/lib/api/agents/agents-apis";
import {
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

type Step = "phone" | "code" | "password";

export function ConnectAccountDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setStep("phone");
      setPhone("");
      setCode("");
      setPassword("");
    }
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

  const pending = sendCodeM.isPending || verifyCodeM.isPending || verifyPasswordM.isPending;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "phone") sendCodeM.mutate({ phone: phone.trim() });
    else if (step === "code") verifyCodeM.mutate({ phone: phone.trim(), code: code.trim() });
    else verifyPasswordM.mutate({ phone: phone.trim(), password });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Connect account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a Telegram account</DialogTitle>
          <DialogDescription>
            {step === "phone" && "Enter the phone number for the account."}
            {step === "code" && "Enter the code Telegram sent to that number."}
            {step === "password" && "This account has 2FA enabled — enter its password."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className='flex flex-col gap-4'>
          {step === "phone" && (
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
          {step === "code" && (
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
          {step === "password" && (
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
              {step === "phone" ? "Send code" : step === "code" ? "Verify" : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
