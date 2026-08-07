"use client";

import { ConfigAdmin } from "@/components/admin/ConfigAdmin";

export default function IssueTagsAdmin() {
  return <ConfigAdmin table="issue_tags" title="Issue tags" fields={["slug", "label", "sort_order"]} />;
}
