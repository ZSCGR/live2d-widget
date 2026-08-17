interface HitProbe {
    (clientX: number, clientY: number): {
        x: number;
        y: number;
        areas: string[];
    } | null;
}
declare function drawMap(): Record<string, number>;
declare function measure(area?: string): void;
declare function show(probeFn: HitProbe): void;
declare function hide(): void;
export { show, hide, measure, drawMap };
export type { HitProbe };
