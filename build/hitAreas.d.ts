declare function canonicalArea(name: string): string;
declare function motionGroupsFor(name: string): string[];
declare function fallbackEventFor(name: string): 'live2d:taphead' | 'live2d:tapbody';
export { canonicalArea, motionGroupsFor, fallbackEventFor };
