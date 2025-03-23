"use client";
import { useState } from "react";
import { useSession } from "next-auth/react";

// Use your public API key set in your environment variables
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

/** Helper: Extract address portion before the first comma (if needed) */
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

/** Sleep function to pause execution for a specified duration */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Geocode an address using the Google Maps Geocoding API */
interface GeocodeResult {
    lat: number;
    lon: number;
}

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
    const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            address
        )}&key=${GOOGLE_MAPS_API_KEY}`
    );
    const data = await res.json();
    // console.log(data);
    if (data && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        return { lat: location.lat, lon: location.lng };
    }
    return null;
}

/** Reverse geocode using the Google Maps Geocoding API */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
        const res = await fetch(
            `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await res.json();
        if (data && data.results && data.results.length > 0) {
            return data.results[0].formatted_address;
        }
        return null;
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

/** Search for places using the Google Places Nearby Search API */
interface GooglePlace {
    formattedAddress: string;
    displayName: {
        text: string;
    }
    location: {
        latitude: number;
        longitude: number;
    };
}

async function searchPlacesProxy(lat: number, lon: number, query: string, radius: number): Promise<any[]> {
    const res = await fetch(
        `/api/places?lat=${lat}&lng=${lon}&radius=${radius}&keyword=${encodeURIComponent(query)}`
    );

    const data = await res.json();
    // console.log(data);
    return data.places || [];
}



/** Extract coordinates from a Google Place result */
function getPlaceCoordinates(place: GooglePlace): { lat: number; lon: number } {
    return {
        lat: place.location.latitude,
        lon: place.location.longitude,
    };
}

export default function Search() {
    const { data: session, status } = useSession();

    const [address1, setAddress1] = useState("");
    const [address2, setAddress2] = useState("");
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialDistance, setInitialDistance] = useState("2"); // Default search radius in miles

    // Coordinates for each address
    const [coord1, setCoord1] = useState<GeocodeResult | null>(null);
    const [coord2, setCoord2] = useState<GeocodeResult | null>(null);

    // The final midpoint
    const [midpoint, setMidpoint] = useState<MidpointCoordinates | null>(null);

    // The places found near the midpoint
    const [places, setPlaces] = useState<EnrichedPlace[]>([]);

    // Error or info messages
    const [message, setMessage] = useState("");

    interface EnrichedPlace extends GooglePlace {
        coords: { lat: number; lon: number };
        dist1: number;
        dist2: number;
        sumDist: number;
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        setLoading(true);
        setPlaces([]);
        setMessage("");
        setMidpoint(null);

        const cleanedAddress1 = address1.trim();
        const cleanedAddress2 = address2.trim();

        try {
            const c1 = await geocodeAddress(cleanedAddress1);
            const c2 = await geocodeAddress(cleanedAddress2);

            // console.log("Coordinates 1:", c1);
            // console.log("Coordinates 2:", c2);

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

            let results: GooglePlace[] = [];
            let attempts = 0;
            const maxAttempts = 3;
            const desiredCount = 3;
            const initialDistanceMiles = parseFloat(initialDistance) || 2;
            let radiusMeters = initialDistanceMiles * 1609.34; // Convert miles to meters

            while (attempts < maxAttempts && results.length < desiredCount) {
                results = await searchPlacesProxy(mid.lat, mid.lon, query, radiusMeters);
                // console.log(`Attempt ${attempts}: radius = ${radiusMeters} meters, Results = ${results.length}`);
                if (results.length < desiredCount) {
                    // Increase the search radius by 1.2 times the initial radius
                    radiusMeters += 1.2 * (initialDistanceMiles * 1609.34);
                    attempts++;
                    await sleep(500); // optional delay between iterations
                } else {
                    break;
                }
            }

            if (results.length === 0) {
                setMessage("No places found near the midpoint for your query.");
            } else {
                // Top 5 results
                const enriched = results.map((place) => {
                    const coords = getPlaceCoordinates(place);
                    // console.log("Place Coordinates:", coords);
                    const dist1 = haversineDistance(c1.lat, c1.lon, coords.lat, coords.lon);
                    const dist2 = haversineDistance(c2.lat, c2.lon, coords.lat, coords.lon);
                    return { ...place, coords, dist1, dist2, sumDist: dist1 + dist2 };
                });

                // console.log("Enriched Places:", enriched);

                enriched.sort((a, b) => a.sumDist - b.sumDist);
                setPlaces(enriched.slice(0, 5)); // Top 5 results
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
                            Search Query (e.g., "bowling alley"):
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
                            <div key={index} className="mb-4 p-2 border-b last:border-b-0">
                                <div className="font-bold">
                                    {place.displayName.text || "Unnamed Place"}
                                </div>
                                <div className="text-sm text-gray-600">
                                    {place.formattedAddress && (
                                        <span className="block mb-1">
                                            Address: {place.formattedAddress}
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
