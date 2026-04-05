const API_BASE_URL = "http://localhost:3001";
const LOCOMOTIVE_ID = "KTZ-2001";
const POLL_MS = 2000;
const RAILWAY_TILE_API = "https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png";
const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const RAIL_FETCH_RADIUS_M = 4000;
const RAIL_REFRESH_DISTANCE_KM = 5;
const MIN_TRAIL_STEP_KM = 0.03;

// Simplified Almaty -> Astana route to provide spatial context.
const ROUTE = [
    [43.2389, 76.8897],
    [44.85, 75.22],
    [46.85, 74.99],
    [49.81, 73.09],
    [51.1694, 71.4491],
];

const map = L.map("map", {
    zoomControl: true,
    attributionControl: true,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

const railwayLayer = L.tileLayer(RAILWAY_TILE_API, {
    maxZoom: 18,
    opacity: 0.9,
    attribution: '&copy; OpenRailwayMap contributors',
}).addTo(map);

const liveTrailLine = L.polyline([], {
    color: "#2563eb",
    weight: 4,
    opacity: 0.92,
}).addTo(map);

map.fitBounds(L.latLngBounds(ROUTE), { padding: [24, 24] });

const marker = L.marker(ROUTE[0], { title: LOCOMOTIVE_ID }).addTo(map);
marker.bindPopup("Locomotive position");

const elLocoId = document.getElementById("loco-id");
const elSource = document.getElementById("coord-source");
const elCoords = document.getElementById("coords");
const elUpdated = document.getElementById("updated-at");
const elDistance = document.getElementById("distance");
const elOverlayStatus = document.getElementById("overlay-status");
const elOverlayToggle = document.getElementById("overlay-toggle");

elLocoId.textContent = LOCOMOTIVE_ID;

const railState = {
    segments: [],
    fetchedCenter: null,
    isFetching: false,
};

const trailPoints = [];

function setOverlayEnabled(enabled) {
    if (enabled) {
        railwayLayer.addTo(map);
        elOverlayStatus.textContent = "enabled";
    } else {
        map.removeLayer(railwayLayer);
        elOverlayStatus.textContent = "disabled";
    }
}

if (elOverlayToggle) {
    elOverlayToggle.addEventListener("change", (event) => {
        setOverlayEnabled(Boolean(event.target.checked));
    });
}

railwayLayer.on("tileerror", () => {
    if (elOverlayStatus) {
        elOverlayStatus.textContent = "tile error";
    }
});

railwayLayer.on("load", () => {
    if (elOverlayStatus && map.hasLayer(railwayLayer)) {
        elOverlayStatus.textContent = "enabled";
    }
});

function setStatus({ source, lat, lon, timestamp, distanceKm }) {
    elSource.textContent = source;
    elCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    elUpdated.textContent = new Date(timestamp).toLocaleString();
    elDistance.textContent = distanceKm == null ? "-" : `${distanceKm.toFixed(2)} km`;
}

function extractDistanceKm(payload) {
    if (!payload || !Array.isArray(payload.readings)) return null;
    const distanceReading = payload.readings.find((r) => r.metricId === "motion.distance");
    return typeof distanceReading?.value === "number" ? distanceReading.value : null;
}

function extractCoordinates(payload) {
    // Prefer direct coordinates if backend starts emitting them.
    if (typeof payload?.latitude === "number" && typeof payload?.longitude === "number") {
        return {
            source: "direct telemetry coordinates",
            lat: payload.latitude,
            lon: payload.longitude,
        };
    }

    const distanceKm = extractDistanceKm(payload);
    if (distanceKm == null) return null;

    // Fallback: derive coordinate by interpolating route using distance.
    return {
        source: "route interpolation from motion.distance",
        ...interpolateRouteByDistance(ROUTE, distanceKm),
        distanceKm,
    };
}

function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(b[0] - a[0]);
    const dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]);
    const lat2 = toRad(b[0]);

    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

    return 2 * R * Math.asin(Math.sqrt(h));
}

function toXYKm(lat, lon, refLat) {
    const kx = 111.320 * Math.cos((refLat * Math.PI) / 180);
    const ky = 110.574;
    return { x: lon * kx, y: lat * ky };
}

function nearestPointOnSegment(point, a, b) {
    const refLat = (a[0] + b[0] + point[0]) / 3;
    const p = toXYKm(point[0], point[1], refLat);
    const p1 = toXYKm(a[0], a[1], refLat);
    const p2 = toXYKm(b[0], b[1], refLat);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
        return { lat: a[0], lon: a[1], distanceKm: haversineKm(point, a) };
    }

    const t = Math.max(0, Math.min(1, ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSq));
    const lat = a[0] + (b[0] - a[0]) * t;
    const lon = a[1] + (b[1] - a[1]) * t;

    return { lat, lon, distanceKm: haversineKm(point, [lat, lon]) };
}

function snapToRailway(lat, lon, segments) {
    if (!segments.length) return null;

    const point = [lat, lon];
    let best = null;

    for (const segment of segments) {
        const candidate = nearestPointOnSegment(point, segment[0], segment[1]);
        if (!best || candidate.distanceKm < best.distanceKm) {
            best = candidate;
        }
    }

    return best;
}

function shouldRefreshRailGeometry(lat, lon) {
    if (!railState.fetchedCenter) return true;
    const distanceFromCenter = haversineKm([lat, lon], railState.fetchedCenter);
    return distanceFromCenter > RAIL_REFRESH_DISTANCE_KM;
}

function parseOverpassSegments(data) {
    const segments = [];
    const elements = Array.isArray(data?.elements) ? data.elements : [];

    for (const element of elements) {
        if (element.type !== "way" || !Array.isArray(element.geometry) || element.geometry.length < 2) {
            continue;
        }

        for (let i = 0; i < element.geometry.length - 1; i += 1) {
            const a = element.geometry[i];
            const b = element.geometry[i + 1];
            segments.push([
                [a.lat, a.lon],
                [b.lat, b.lon],
            ]);
        }
    }

    return segments;
}

async function refreshRailGeometry(lat, lon) {
    if (railState.isFetching || !shouldRefreshRailGeometry(lat, lon)) return;

    railState.isFetching = true;
    try {
        const query = `
[out:json][timeout:25];
(
  way["railway"~"rail|light_rail|narrow_gauge|subway|tram"](around:${RAIL_FETCH_RADIUS_M},${lat},${lon});
);
out geom;
`.trim();

        const response = await fetch(OVERPASS_API, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
            body: new URLSearchParams({ data: query }),
        });

        if (!response.ok) {
            throw new Error(`Overpass API ${response.status}`);
        }

        const body = await response.json();
        railState.segments = parseOverpassSegments(body);
        railState.fetchedCenter = [lat, lon];
    } catch {
        // Keep existing segments if fetch fails.
    } finally {
        railState.isFetching = false;
    }
}

function appendTrailPoint(lat, lon) {
    const last = trailPoints[trailPoints.length - 1];
    if (last && haversineKm(last, [lat, lon]) < MIN_TRAIL_STEP_KM) {
        return;
    }

    trailPoints.push([lat, lon]);
    liveTrailLine.setLatLngs(trailPoints);
}

function interpolateRouteByDistance(route, distanceKm) {
    let remaining = Math.max(0, distanceKm);

    for (let i = 0; i < route.length - 1; i += 1) {
        const a = route[i];
        const b = route[i + 1];
        const segmentKm = haversineKm(a, b);

        if (remaining <= segmentKm) {
            const t = segmentKm === 0 ? 0 : remaining / segmentKm;
            return {
                lat: a[0] + (b[0] - a[0]) * t,
                lon: a[1] + (b[1] - a[1]) * t,
            };
        }

        remaining -= segmentKm;
    }

    const last = route[route.length - 1];
    return { lat: last[0], lon: last[1] };
}

async function fetchCurrentTelemetry() {
    const response = await fetch(`${API_BASE_URL}/api/telemetry/current`);
    if (!response.ok) {
        throw new Error(`Failed telemetry request: ${response.status}`);
    }

    const body = await response.json();
    return body?.data ?? body;
}

async function tick() {
    try {
        const payload = await fetchCurrentTelemetry();
        const position = extractCoordinates(payload);

        if (!position) {
            elSource.textContent = "No coordinates available yet";
            return;
        }

        const { lat, lon, source, distanceKm } = position;

        await refreshRailGeometry(lat, lon);

        const snapped = snapToRailway(lat, lon, railState.segments);
        const finalLat = snapped ? snapped.lat : lat;
        const finalLon = snapped ? snapped.lon : lon;
        const finalSource = snapped
            ? `${source} + rail snap (${(snapped.distanceKm * 1000).toFixed(0)} m)`
            : `${source} (unsnapped)`;

        marker.setLatLng([finalLat, finalLon]);
        marker.setPopupContent(`${LOCOMOTIVE_ID}<br/>${finalLat.toFixed(5)}, ${finalLon.toFixed(5)}`);

        appendTrailPoint(finalLat, finalLon);

        map.panTo([finalLat, finalLon], {
            animate: true,
            duration: 0.8,
        });

        setStatus({
            source: finalSource,
            lat: finalLat,
            lon: finalLon,
            timestamp: payload?.timestamp ?? Date.now(),
            distanceKm,
        });
    } catch (error) {
        elSource.textContent = `Telemetry fetch error: ${error.message}`;
    }
}

tick();
setInterval(tick, POLL_MS);
