import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6 dark:bg-black">
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
