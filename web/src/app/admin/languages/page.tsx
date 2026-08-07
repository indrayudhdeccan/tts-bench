"use client";

import { ConfigAdmin } from "@/components/admin/ConfigAdmin";

export default function LanguagesAdmin() {
  return <ConfigAdmin table="languages" title="Languages" fields={["code", "name", "sort_order"]} />;
}
