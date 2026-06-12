"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { LoginStatus } from "@/lib/api/agents/agents-apis";
import {
  connectBotMutationOptions,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  function reset() {
    setPlatform("telegram");
    setStep("phone");
    setPhone("");
    setCode("");
    setPassword("");
    setToken("");
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
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
  const connectBotM = useMutation({ ...connectBotMutationOptions(), onSuccess: (r) => handleResult(r.status), onError });

  const pending =
    sendCodeM.isPending || verifyCodeM.isPending || verifyPasswordM.isPending || connectBotM.isPending;

  function onTelegramSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step === "phone") sendCodeM.mutate({ phone: phone.trim() });
    else if (step === "code") verifyCodeM.mutate({ phone: phone.trim(), code: code.trim() });
    else verifyPasswordM.mutate({ phone: phone.trim(), password });
  }

  function onDiscordSubmit(e: React.FormEvent) {
    e.preventDefault();
    connectBotM.mutate({ token: token.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>Connect account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect an account</DialogTitle>
          <DialogDescription>Choose a platform and follow the steps to connect.</DialogDescription>
        </DialogHeader>

        <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='telegram'>Telegram</TabsTrigger>
            <TabsTrigger value='discord'>Discord</TabsTrigger>
          </TabsList>

          {/* ── Telegram: phone → code → 2FA password ── */}
          <TabsContent value='telegram'>
            <form onSubmit={onTelegramSubmit} className='flex flex-col gap-4'>
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
                  <p className='text-sm text-muted-foreground'>Enter the phone number for the account.</p>
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
                  <p className='text-sm text-muted-foreground'>Enter the code Telegram sent to that number.</p>
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
                  <p className='text-sm text-muted-foreground'>This account has 2FA enabled — enter its password.</p>
                </div>
              )}

              <DialogFooter>
                <Button type='submit' disabled={pending}>
                  {pending ? <Spinner /> : null}
                  {step === "phone" ? "Send code" : step === "code" ? "Verify" : "Submit"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* ── Discord: paste a bot token (single step) ── */}
          <TabsContent value='discord'>
            <form onSubmit={onDiscordSubmit} className='flex flex-col gap-4'>
              <ol className='list-decimal space-y-1 pl-5 text-sm text-muted-foreground'>
                <li>
                  Open{" "}
                  <a
                    href='https://discord.com/developers/applications'
                    target='_blank'
                    rel='noreferrer'
                    className='underline'
                  >
                    discord.com/developers/applications
                  </a>{" "}
                  and click <strong>New Application</strong>.
                </li>
                <li>
                  In <strong>Bot</strong>, click <strong>Reset Token</strong> and copy the token.
                </li>
                <li>
                  On the same page, enable the <strong>Message Content Intent</strong>.
                </li>
                <li>
                  In <strong>OAuth2 → URL Generator</strong>, check the <strong>bot</strong> scope plus{" "}
                  <strong>Send Messages</strong> and <strong>Read Message History</strong>, open the URL, and invite
                  the bot to your server.
                </li>
                <li>Paste the token below and click Connect bot.</li>
              </ol>

              <div className='flex flex-col gap-2'>
                <Label htmlFor='token'>Bot token</Label>
                <Input
                  id='token'
                  type='password'
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder='Paste the bot token'
                  autoComplete='off'
                  autoFocus
                  required
                />
              </div>

              <DialogFooter>
                <Button type='submit' disabled={pending}>
                  {pending ? <Spinner /> : null}
                  Connect bot
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
