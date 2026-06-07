"use client";

import { AuthGate } from "@/components/auth/auth-gate";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default function OnboardingPage() {
  return (
    <AuthGate>
      <div className='flex flex-1 items-center justify-center p-6'>
        <OnboardingForm />
      </div>
    </AuthGate>
  );
}
