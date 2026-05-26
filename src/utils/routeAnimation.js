// Haversine distance calculation in meters
export const haversine = (a, b) => {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371000; // meters
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const v = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
    return R * c;
};
// Simplify route points to reduce computation for long routes
export const simplifyRoute = (points, minDistance = 5) => {
    if (points.length <= 100) {
        return points;
    }
    const simplified = [points[0]];
    let lastIncluded = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const d = haversine(points[lastIncluded], points[i]);
        if (d > minDistance) {
            simplified.push(points[i]);
            lastIncluded = i;
        }
    }
    // Ensure the last point is included
    simplified.push(points[points.length - 1]);
    return simplified;
};
// Calculate segment lengths and cumulative distances
export const calculateSegmentLengths = (points) => {
    const segLens = [];
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const d = haversine(points[i - 1], points[i]);
        segLens.push(d);
        total += d;
    }
    const cum = [0];
    for (let i = 0; i < segLens.length; i++) {
        cum.push(cum[i] + segLens[i]);
    }
    return { segLens, total, cum };
};
// Binary search to find segment index for target distance
export const findSegmentIdx = (cum, targetDist) => {
    let left = 0;
    let right = cum.length - 2;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (cum[mid] <= targetDist && targetDist < cum[mid + 1]) {
            return mid;
        }
        else if (cum[mid] > targetDist) {
            right = mid - 1;
        }
        else {
            left = mid + 1;
        }
    }
    return Math.max(0, Math.min(cum.length - 2, left));
};
// Calculate visible points for current animation progress
export const calculateVisiblePoints = (points, segLens, cum, targetDist) => {
    const upTo = findSegmentIdx(cum, targetDist);
    const segStart = points[upTo];
    const segEnd = points[Math.min(upTo + 1, points.length - 1)];
    const segTotal = segLens[upTo] || 1;
    const segT = Math.max(0, Math.min(1, (targetDist - cum[upTo]) / segTotal));
    const visiblePoints = [];
    for (let i = 0; i <= upTo; i++) {
        visiblePoints.push(points[i]);
    }
    if (segT > 0 && segT < 1) {
        const lon = segStart[0] + (segEnd[0] - segStart[0]) * segT;
        const lat = segStart[1] + (segEnd[1] - segStart[1]) * segT;
        visiblePoints.push([lon, lat]);
    }
    return visiblePoints;
};
export class RouteAnimator {
    onUpdate;
    onComplete;
    points;
    simplified;
    segLens;
    total;
    cum;
    duration;
    startTime;
    state;
    config;
    animationFrameId = null;
    constructor(points, onUpdate, onComplete, config = {}) {
        this.onUpdate = onUpdate;
        this.onComplete = onComplete;
        this.config = {
            speedMps: 4000,
            minDuration: 2500,
            maxDuration: 8000,
            targetFps: 60,
            updateThreshold: 0.01,
            minDistance: 5,
            ...config,
        };
        this.points = points;
        this.simplified = simplifyRoute(points, this.config.minDistance);
        const { segLens, total, cum } = calculateSegmentLengths(this.simplified);
        this.segLens = segLens;
        this.total = total;
        this.cum = cum;
        // Calculate animation duration
        let duration = (this.total / this.config.speedMps) * 1000;
        this.duration = Math.max(this.config.minDuration, Math.min(this.config.maxDuration, duration));
        this.state = {
            lastUpTo: -1,
            lastT: 0,
            frameCount: 0,
            lastFrameTime: 0,
        };
        this.startTime = performance.now();
    }
    start() {
        if (this.total <= 0) {
            this.onUpdate([]);
            this.onComplete();
            return;
        }
        // Start with first point
        this.onUpdate([this.simplified[0]]);
        this.animationFrameId = requestAnimationFrame(this.step.bind(this));
    }
    stop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    step(t) {
        const frameInterval = 1000 / this.config.targetFps;
        // Frame rate control
        if (t - this.state.lastFrameTime < frameInterval &&
            this.state.frameCount > 0) {
            this.animationFrameId = requestAnimationFrame(this.step.bind(this));
            return;
        }
        this.state.lastFrameTime = t;
        this.state.frameCount++;
        const elapsed = t - this.startTime;
        const p = Math.min(1, elapsed / this.duration);
        // Animation complete
        if (p >= 1) {
            this.onUpdate(this.simplified);
            this.animationFrameId = null;
            this.onComplete();
            return;
        }
        const targetDist = p * this.total;
        const upTo = findSegmentIdx(this.cum, targetDist);
        // Skip update if minimal change
        if (upTo === this.state.lastUpTo &&
            Math.abs(p - this.state.lastT) < this.config.updateThreshold &&
            p < 0.98) {
            this.animationFrameId = requestAnimationFrame(this.step.bind(this));
            return;
        }
        this.state.lastUpTo = upTo;
        this.state.lastT = p;
        const visiblePoints = calculateVisiblePoints(this.simplified, this.segLens, this.cum, targetDist);
        this.onUpdate(visiblePoints);
        this.animationFrameId = requestAnimationFrame(this.step.bind(this));
    }
}
