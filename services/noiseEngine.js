/**
 * Noise Level Predictor Engine
 *
 * Algorithm:
 *   For each floor, calculate floor_load:
 *     floor_load = Σ(capacity of occupied rooms on floor) / Σ(total capacity of all rooms on floor)
 *
 *   Noise score for each room = floor_load * 100   (0 = silent, 100 = maximum activity)
 *
 * This integrates with the output of statusEngine.getAllRoomsWithStatus().
 */

/**
 * Group rooms by floor_id and calculate noise score for each floor.
 *
 * @param {Array} roomsWithStatus - Output from statusEngine.getAllRoomsWithStatus()
 * @returns {Map<string, number>} floorId → noiseScore (0–100)
 */
function calculateFloorNoiseMap(roomsWithStatus) {
    // Group by floor_id (fall back to block+floor composite key for legacy rooms)
    const floorGroups = new Map();

    for (const room of roomsWithStatus) {
        const key = room.floor_id ? String(room.floor_id) : `${room.block}-${room.floor}`;

        if (!floorGroups.has(key)) {
            floorGroups.set(key, { totalCapacity: 0, occupiedCapacity: 0 });
        }
        const group = floorGroups.get(key);
        const cap = room.capacity || 0;
        group.totalCapacity += cap;

        if (room.currentStatus === 'occupied' || room.currentStatus === 'reserved') {
            group.occupiedCapacity += cap;
        }
    }

    // Convert to noise score map
    const noiseMap = new Map();
    for (const [key, { totalCapacity, occupiedCapacity }] of floorGroups) {
        const score = totalCapacity > 0
            ? Math.round((occupiedCapacity / totalCapacity) * 100)
            : 0;
        noiseMap.set(key, score);
    }
    return noiseMap;
}

/**
 * Enrich an array of rooms-with-status with a noiseScore field.
 *
 * @param {Array} roomsWithStatus
 * @returns {Array} Same array, each room augmented with `noiseScore` (0–100) and `noiseLevel` label
 */
function enrichRoomsWithNoise(roomsWithStatus) {
    const noiseMap = calculateFloorNoiseMap(roomsWithStatus);

    return roomsWithStatus.map(room => {
        const key = room.floor_id ? String(room.floor_id) : `${room.block}-${room.floor}`;
        const score = noiseMap.get(key) ?? 0;

        let noiseLevel;
        if (score >= 75) noiseLevel = 'HIGH';
        else if (score >= 40) noiseLevel = 'MEDIUM';
        else noiseLevel = 'LOW';

        return { ...room, noiseScore: score, noiseLevel };
    });
}

/**
 * Get noise score for a single floor given a set of rooms on that floor.
 *
 * @param {Array} roomsOnFloor - Rooms belonging to one floor (with currentStatus, capacity)
 * @returns {number} Noise score 0–100
 */
function getFloorNoise(roomsOnFloor) {
    const totalCap = roomsOnFloor.reduce((s, r) => s + (r.capacity || 0), 0);
    const occupiedCap = roomsOnFloor
        .filter(r => r.currentStatus === 'occupied' || r.currentStatus === 'reserved')
        .reduce((s, r) => s + (r.capacity || 0), 0);
    return totalCap > 0 ? Math.round((occupiedCap / totalCap) * 100) : 0;
}

module.exports = { enrichRoomsWithNoise, calculateFloorNoiseMap, getFloorNoise };
