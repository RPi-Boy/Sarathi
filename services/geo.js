const rad = (d) => (d * Math.PI) / 180;

const haversineKm = (a, b) => {
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
};

// Road distance is longer than the straight line; 1.25 matches Indian intercity routes closely enough.
const ROAD_FACTOR = 1.25;
const CAB_SPEED_KMH = 45; // average including ghats and towns
const CAB_MAX_KM = 700;

const roadKm = (a, b) => Math.round(haversineKm(a, b) * ROAD_FACTOR);
const cabMinutes = (km) => Math.round((km / CAB_SPEED_KMH) * 60);

module.exports = { haversineKm, roadKm, cabMinutes, CAB_MAX_KM };
