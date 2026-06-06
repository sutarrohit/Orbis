import { request } from "@/utils/request";

/** A strategy learning accumulated by the Leader agent. */
export interface Learning {
  id: string;
  brandId: string;
  text: string;
  createdAt: string;
}

export function listLearnings(): Promise<Learning[]> {
  return request("/learnings");
}
