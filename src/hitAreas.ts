/**
 * @file Hit area naming, shared by the Cubism 2 and Cubism 5 runtimes.
 * @module hitAreas
 */

/**
 * Area names seen in the wild, grouped by what they mean. Models come from
 * different packs and different authors: some use the Cubism sample names,
 * some translate them, some invent their own.
 */
const ALIASES: Record<string, string[]> = {
  head: ['head', 'face', '头', '头部', '脸', '脸部'],
  body: ['body', '身', '身体'],
  breast: ['breast', 'bust', 'chest', '胸', '胸部'],
  belly: ['belly', 'stomach', '腹', '腹部', '肚子'],
  leg: ['leg', 'legs', 'foot', '腿', '腿部', '脚'],
  arm: ['arm', 'arms', 'hand', '手', '手臂', '胳膊'],
};

const CANONICAL = new Map<string, string>();
for (const [canonical, names] of Object.entries(ALIASES)) {
  for (const name of names) CANONICAL.set(name, canonical);
}

// Authors write the area name as a whole phrase — 摸头, 点胸部, TapBody — so an
// exact lookup misses most of them. Longest keyword first, or 头 would claim
// 头部 before the more specific entry had a chance.
const KEYWORDS: [string, string][] = Object.entries(ALIASES)
  .flatMap(([canonical, names]) => names.map(n => [n, canonical] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Reduce an area name to the concept it stands for, or return it unchanged
 * when the model uses a name we have no opinion about.
 */
function canonicalArea(name: string): string {
  const key = name.trim().toLowerCase();
  const exact = CANONICAL.get(key);
  if (exact) return exact;
  for (const [keyword, canonical] of KEYWORDS) {
    if (key.includes(keyword)) return canonical;
  }
  return name;
}

/**
 * Motion groups worth trying for an area, best match first. The area's own
 * name comes first so a model that names a group after its hit area wins
 * before any of the conventional tap_* groups are considered.
 */
const MOTION_GROUPS: Record<string, string[]> = {
  head: ['tap_face', 'flick_head'],
  body: ['tap_body'],
  breast: ['tap_breast', 'tap_body'],
  belly: ['tap_belly', 'tap_body'],
  leg: ['tap_leg', 'tap_body'],
  arm: ['tap_arm', 'tap_body'],
};

function motionGroupsFor(name: string): string[] {
  const canonical = canonicalArea(name);
  const groups = [name];
  if (canonical !== name) groups.push(canonical);
  for (const group of MOTION_GROUPS[canonical] ?? []) {
    if (!groups.includes(group)) groups.push(group);
  }
  return groups;
}

/**
 * The generic message event an area falls back to when the model itself has
 * nothing to say. Areas that are neither head nor body borrow the body line:
 * "don't touch me there" fits a belly or a leg well enough, and inventing a
 * line set per body part is not maintainable across a model list this size.
 */
function fallbackEventFor(name: string): 'live2d:taphead' | 'live2d:tapbody' {
  return canonicalArea(name) === 'head' ? 'live2d:taphead' : 'live2d:tapbody';
}

export { canonicalArea, motionGroupsFor, fallbackEventFor };
