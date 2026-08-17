const ALIASES = {
    head: ['head', 'face', '头', '头部', '脸', '脸部'],
    body: ['body', '身', '身体'],
    breast: ['breast', 'bust', 'chest', '胸', '胸部'],
    belly: ['belly', 'stomach', '腹', '腹部', '肚子'],
    leg: ['leg', 'legs', 'foot', '腿', '腿部', '脚'],
    arm: ['arm', 'arms', 'hand', '手', '手臂', '胳膊'],
};
const CANONICAL = new Map();
for (const [canonical, names] of Object.entries(ALIASES)) {
    for (const name of names)
        CANONICAL.set(name, canonical);
}
const KEYWORDS = Object.entries(ALIASES)
    .flatMap(([canonical, names]) => names.map(n => [n, canonical]))
    .sort((a, b) => b[0].length - a[0].length);
function canonicalArea(name) {
    const key = name.trim().toLowerCase();
    const exact = CANONICAL.get(key);
    if (exact)
        return exact;
    for (const [keyword, canonical] of KEYWORDS) {
        if (key.includes(keyword))
            return canonical;
    }
    return name;
}
const MOTION_GROUPS = {
    head: ['tap_face', 'flick_head'],
    body: ['tap_body'],
    breast: ['tap_breast', 'tap_body'],
    belly: ['tap_belly', 'tap_body'],
    leg: ['tap_leg', 'tap_body'],
    arm: ['tap_arm', 'tap_body'],
};
function motionGroupsFor(name) {
    var _a;
    const canonical = canonicalArea(name);
    const groups = [name];
    if (canonical !== name)
        groups.push(canonical);
    for (const group of (_a = MOTION_GROUPS[canonical]) !== null && _a !== void 0 ? _a : []) {
        if (!groups.includes(group))
            groups.push(group);
    }
    return groups;
}
function fallbackEventFor(name) {
    return canonicalArea(name) === 'head' ? 'live2d:taphead' : 'live2d:tapbody';
}
export { canonicalArea, motionGroupsFor, fallbackEventFor };
