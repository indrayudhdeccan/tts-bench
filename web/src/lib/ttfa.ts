import type { TtfaStats } from "@/lib/types";
import table from "@/data/ttfa-latency.json";

type Row = TtfaStats & { slug: string };
type Table = Record<string, Record<string, Row>>;

const DATA = table as Table;

export function lookupTtfa(language: string, name: string, slug?: string): TtfaStats | null {
  const bag = DATA[language];
  if (!bag) return null;
  const byName = bag[name];
  if (byName) {
    const { slug: _s, ...stats } = byName;
    return stats;
  }
  if (slug) {
    const hit = Object.values(bag).find((row) => row.slug === slug);
    if (hit) {
      const { slug: _s, ...stats } = hit;
      return stats;
    }
  }
  return null;
}
