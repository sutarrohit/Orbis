"use client";

import { useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A simple tag/chip editor composed from shadcn Input, Button, and Badge. */
export function ChipListEditor({
  values,
  onChange,
  placeholder
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim();
    if (!value || values.includes(value)) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  function remove(index: number) {
    onChange(values.filter((_, i) => i !== index));
  }

  return (
    <div className='flex flex-col gap-2'>
      <div className='flex gap-2'>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button type='button' variant='outline' onClick={add}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <div className='flex flex-wrap gap-1.5'>
          {values.map((value, i) => (
            <Badge key={`${value}-${i}`} variant='secondary' className='gap-1'>
              {value}
              <button type='button' onClick={() => remove(i)} aria-label={`Remove ${value}`}>
                <X className='size-3' />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
