"use client";

import { ConfigAdmin } from "@/components/admin/ConfigAdmin";

export default function SpeakersAdmin() {
  return <ConfigAdmin table="speakers" title="Speakers" fields={["slug", "name"]} />;
}
