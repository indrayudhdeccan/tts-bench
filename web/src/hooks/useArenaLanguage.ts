"use client";

import { useSearchParams } from "next/navigation";
import { parseArenaLanguage } from "@/lib/arena-languages";

export function useArenaLanguage() {
  const searchParams = useSearchParams();
  return parseArenaLanguage(searchParams.get("lang"));
}
