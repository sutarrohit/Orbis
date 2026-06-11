import { request } from "@/utils/request";

/** The brand's sales/persona profile (nested under the brand). */
export interface BrandProfile {
  id: string;
  brandId: string;
  persona: string;
  productSummary: string;
  pricing: string;
  conversionAction: string;
  objectionNotes: string;
  website: string;
  about: string;
  createdAt: string;
  updatedAt: string;
}

/** A brand (tenant root) as returned by `GET /brand`. */
export interface Brand {
  id: string;
  ownerId: string;
  name: string;
  slug: string | null;
  niche: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  profile: BrandProfile | null;
}

export interface CreateBrandInput {
  name: string;
  niche?: string;
  slug?: string;
}

export interface UpdateBrandInput {
  name?: string;
  niche?: string;
  slug?: string | null;
  active?: boolean;
  persona?: string;
  productSummary?: string;
  pricing?: string;
  conversionAction?: string;
  objectionNotes?: string;
  website?: string;
  about?: string;
}

export function getBrand(): Promise<{ brand: Brand | null }> {
  return request("/brand");
}

export function createBrand(input: CreateBrandInput): Promise<Brand> {
  return request("/brand", { method: "POST", body: JSON.stringify(input) });
}

export function updateBrand(input: UpdateBrandInput): Promise<Brand> {
  return request("/brand", { method: "PUT", body: JSON.stringify(input) });
}
