"use client";

import { ConfigAdmin } from "@/components/admin/ConfigAdmin";

export default function DomainsAdmin() {
  return <ConfigAdmin table="domains" title="Domains" fields={["slug", "name", "sort_order"]} />;
}
