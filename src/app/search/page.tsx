"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

/** Helper: Extract address portion before the first comma */
function extractAddressPart(address: string): string {
    const match = address.match(/^([0-9a-zA-Z\s]+)/);
    return match ? match[1] : address;
}

/** Basic Haversine formula to compute approximate distance (in km) */
interface Coordinates {
    lat: number;
    lon: number;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // distance in km
}

/** Geocode an address using Nominatim */
interface GeocodeResult {
    lat: number;
    lon: number;
}

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`
    );
    const data: Array<{ lat: string; lon: string }> = await res.json();
    if (data && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
}

/** Reverse geocode using Nominatim */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lon}&addressdetails=1`,
            {
                headers: {
                    "User-Agent": "equi/1.0 (Oluwadamilolaogunbode@gmail.com)"
                }
            }
        );
        const data = await res.json();
        return data?.display_name || null;
    } catch (error) {
        console.error("Reverse geocode error:", error);
        return null;
    }
}

/** Calculate the midpoint between two coordinates */
interface MidpointCoordinates {
    lat: number;
    lon: number;
}

function calculateMidpoint(coord1: Coordinates, coord2: Coordinates): MidpointCoordinates {
    return {
        lat: (coord1.lat + coord2.lat) / 2,
        lon: (coord1.lon + coord2.lon) / 2,
    };
}

interface CoordinatesResult {
    lat: number;
    lon: number;
}

/** Get coordinates from an element (node or way/relation) */
function getElementCoordinates(element: any): CoordinatesResult | null {
    if (element.lat && element.lon) {
        return {
            lat: typeof element.lat === "string" ? parseFloat(element.lat) : element.lat,
            lon: typeof element.lon === "string" ? parseFloat(element.lon) : element.lon,
        };
    } else if (element.center && element.center.lat && element.center.lon) {
        return {
            lat: typeof element.center.lat === "string" ? parseFloat(element.center.lat) : element.center.lat,
            lon: typeof element.center.lon === "string" ? parseFloat(element.center.lon) : element.center.lon,
        };
    }
    return null;
}

/**
 * Searches for places near (lat, lon) using the Overpass API.
 */
async function searchPlacesOverpass(lat: number, lon: number, query: string, bboxDelta: number): Promise<any[]> {
    const north = lat + bboxDelta;
    const south = lat - bboxDelta;
    const east = lon + bboxDelta;
    const west = lon - bboxDelta;

    const overpassQuery = `
    [out:json][timeout:25];
    (
      node["name"~"${query}",i](${south},${west},${north},${east});
      way["name"~"${query}",i](${south},${west},${north},${east});
      relation["name"~"${query}",i](${south},${west},${north},${east});
    );
    out center;
  `;
    const res = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!res.ok) {
        console.error("Overpass API error:", res.status, res.statusText);
        throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
    }

    try {
        const data = await res.json();
        return data.elements;
    } catch (err) {
        const text = await res.text();
        console.error("Failed to parse JSON:", text);
        throw err;
    }
}

/**
 * Search for places using Nominatim (bounding box search).
 */
interface Place {
    place_id: string;
    display_name: string;
    lat: string;
    lon: string;
}

async function searchPlacesNearMidpoint(lat: number, lon: number, query: string, bboxDelta: number): Promise<Place[]> {
    const north = lat + bboxDelta;
    const south = lat - bboxDelta;
    const east = lon + bboxDelta;
    const west = lon - bboxDelta;

    const url =
        `https://nominatim.openstreetmap.org/search?format=json` +
        `&q=${encodeURIComponent(query)}` +
        `&bounded=1` +
        `&viewbox=${west},${north},${east},${south}`;

    const res = await fetch(url);
    const data: Place[] = await res.json();
    return data;
}

export default function Search() {
    const { data: session, status } = useSession();

    const [address1, setAddress1] = useState("");
    const [address2, setAddress2] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialDistance, setInitialDistance] = useState("2"); // Default search radius in km

    // Coordinates for each address
    const [coord1, setCoord1] = useState<GeocodeResult | null>(null);
    const [coord2, setCoord2] = useState<GeocodeResult | null>(null);

    // The final midpoint
    const [midpoint, setMidpoint] = useState<MidpointCoordinates | null>(null);

    // The places found near the midpoint
    const [places, setPlaces] = useState<EnrichedPlace[]>([]);

    // Error or info messages
    const [message, setMessage] = useState("");

    interface EnrichedPlace extends Place {
        coords: CoordinatesResult;
        dist1: number;
        dist2: number;
        sumDist: number;
        full_address?: string;
        tags?: { name?: string };
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        setLoading(true);
        setPlaces([]);
        setMessage("");
        setMidpoint(null);

        // Extract the relevant part of the addresses before geocoding
        const cleanedAddress1 = extractAddressPart(address1);
        const cleanedAddress2 = extractAddressPart(address2);

        console.log(address1, cleanedAddress1);
        console.log(address2, cleanedAddress2);

        try {

            const c1 = await geocodeAddress(cleanedAddress1);
            const c2 = await geocodeAddress(cleanedAddress2);

            if (!c1 || !c2) {
                setMessage("Failed to geocode one or both addresses.");
                setLoading(false);
                return;
            }

            setCoord1(c1);
            setCoord2(c2);

            // Calculate midpoint
            const mid = calculateMidpoint(c1, c2);
            setMidpoint(mid);

            // Start with the user-defined search distance (in km)
            let distanceKm = parseFloat(initialDistance);
            let bboxDelta = distanceKm / 111; // Rough conversion

            let results: Place[] = [];
            let attempts = 0;
            const maxAttempts = 5;
            const desiredCount = 2;

            // Expand the search area until results are found or maxAttempts reached
            while (attempts < maxAttempts && (!results || results.length < desiredCount)) {
                results = await searchPlacesOverpass(mid.lat, mid.lon, query, bboxDelta);
                if (!results || results.length < desiredCount) {
                    distanceKm += 2 * parseFloat(initialDistance);
                    bboxDelta = distanceKm / 111;
                    attempts++;
                } else {
                    break;
                }
            }

            if (!results || results.length === 0) {
                setMessage("No places found near the midpoint for your query.");
            } else {
                const enriched = results
                    .map((element) => {
                        const coords = getElementCoordinates(element);
                        if (!coords) return null;
                        const dist1 = haversineDistance(c1.lat, c1.lon, coords.lat, coords.lon);
                        const dist2 = haversineDistance(c2.lat, c2.lon, coords.lat, coords.lon);
                        return { ...element, coords, dist1, dist2, sumDist: dist1 + dist2 };
                    })
                    .filter((place): place is EnrichedPlace => place !== null);

                const enrichedWithAddress: EnrichedPlace[] = await Promise.all(
                    enriched.map(async (place) => {
                        const fullAddress = await reverseGeocode(place.coords.lat, place.coords.lon);
                        return { ...place, full_address: fullAddress || "Address not found" };
                    })
                );

                enrichedWithAddress.sort((a, b) => a.sumDist - b.sumDist);
                setPlaces(enrichedWithAddress.slice(0, 5)); // Top 5 results
            }
        } catch (err) {
            console.error(err);
            setMessage("An error occurred while processing your request.");
        }

        setLoading(false);
    }

    // Loading session
    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-200">
                <p className="text-xl">Loading session...</p>
            </div>
        );
    }

    // Prompt to sign in if not authenticated
    if (!session) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-200">
                <p className="text-lg">Please sign in to search for venues.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-r from-blue-300 to-purple-400 flex items-center justify-center px-4">
            <div className="w-full max-w-lg bg-white bg-opacity-85 backdrop-filter backdrop-blur-lg p-8 rounded-xl shadow-xl transform hover:scale-105 transition duration-300">
                <h1 className="text-3xl font-bold mb-6 text-center text-gray-900">
                    Find Equidistant Venues
                </h1>
                {/* Search Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label htmlFor="address1" className="block mb-1 font-medium text-gray-700">
                            Address 1:
                        </label>
                        <input
                            id="address1"
                            type="text"
                            placeholder="Enter first address"
                            value={address1}
                            onChange={(e) => setAddress1(e.target.value)}
                            required
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    <div>
                        <label htmlFor="address2" className="block mb-1 font-medium text-gray-700">
                            Address 2:
                        </label>
                        <input
                            id="address2"
                            type="text"
                            placeholder="Enter second address"
                            value={address2}
                            onChange={(e) => setAddress2(e.target.value)}
                            required
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    {/* Search Bar for Query */}
                    <div>
                        <label htmlFor="query" className="block mb-1 font-medium text-gray-700">
                            Search Query (e.g., "bowling arena"):
                        </label>
                        <input
                            id="query"
                            type="text"
                            placeholder="Enter search query"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            required
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full p-3 bg-amber-600 text-white rounded-lg shadow hover:bg-amber-700 transition duration-300 disabled:opacity-50"
                    >
                        {loading ? "Searching..." : "Search"}
                    </button>
                </form>
                {/* Message Display */}
                {message && (
                    <div className="mt-4 text-center text-red-600 font-semibold">
                        {message}
                    </div>
                )}
                {/* Results */}
                {places && places.length > 0 && (
                    <div className="mt-6 p-4 bg-gray-50 rounded border">
                        <h2 className="text-xl font-semibold mb-4">
                            Top Matches Near the Midpoint
                        </h2>
                        {places.map((place, index) => (
                            <div key={place.place_id || index} className="mb-4 p-2 border-b last:border-b-0">
                                <div className="font-bold">
                                    {place.tags?.name || place.display_name || "Unnamed Place"}
                                </div>
                                <div className="text-sm text-gray-600">
                                    {place.full_address && (
                                        <span className="block mb-1">
                                            Address: {place.full_address}
                                        </span>
                                    )}
                                    <span>Distance from Address 1: {place.dist1.toFixed(2)} km</span>
                                    <br />
                                    <span>Distance from Address 2: {place.dist2.toFixed(2)} km</span>
                                    <br />
                                    <span>Total Distance: {place.sumDist.toFixed(2)} km</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
