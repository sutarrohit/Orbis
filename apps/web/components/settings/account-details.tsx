"use client";

import { UserCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountDetails() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <div className='flex size-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40'>
            <UserCircle className='size-4 text-blue-600 dark:text-blue-400' />
          </div>
          Account Details
        </CardTitle>
      </CardHeader>

      <CardContent>
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='fullName'>Full Name</Label>
            <Input id='fullName' value={user?.name ?? ""} readOnly />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='email'>Email Address</Label>
            <Input id='email' value={user?.email ?? ""} readOnly />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
