"use client";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";

/** Haversine formula to compute approximate distance (in miles) */
interface Coordinates {
    lat: number;
    lon: number;
}

function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // distance in miles
}

/** Sleep function to pause execution for a specified duration */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Geocode an address via our server-side proxy (OpenStreetMap Nominatim) */
interface GeocodeResult {
    lat: number;
    lon: number;
}

async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    const data = await res.json();
    if (data && data.result) {
        return { lat: data.result.lat, lon: data.result.lon };
    }
    return null;
}

/** Fetch address autocomplete suggestions via our server-side proxy */
interface Suggestion {
    label: string;
    lat: number;
    lon: number;
}

async function fetchSuggestions(
    query: string,
    signal: AbortSignal,
    userLocation: GeocodeResult | null
): Promise<Suggestion[]> {
    let url = `/api/autocomplete?q=${encodeURIComponent(query)}`;
    if (userLocation) {
        url += `&lat=${userLocation.lat}&lon=${userLocation.lon}`;
    }
    const res = await fetch(url, { signal });
    const data = await res.json();
    return data.suggestions || [];
}

/** Reverse geocode a coordinate into a readable address via our proxy */
async function reverseGeocode(lat: number, lon: number): Promise<{ label: string; coord: GeocodeResult } | null> {
    const res = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (data && data.result) {
        return {
            label: data.result.displayName,
            coord: { lat: data.result.lat, lon: data.result.lon },
        };
    }
    return null;
}

/** Calculate the midpoint of any number of coordinates */
interface MidpointCoordinates {
    lat: number;
    lon: number;
}

function calculateMidpoint(coords: Coordinates[]): MidpointCoordinates {
    const lat = coords.reduce((sum, c) => sum + c.lat, 0) / coords.length;
    const lon = coords.reduce((sum, c) => sum + c.lon, 0) / coords.length;
    return { lat, lon };
}

/** Search for places using our server-side places proxy (OpenStreetMap Nominatim) */
interface Place {
    formattedAddress: string;
    displayName: {
        text: string;
    }
    location: {
        latitude: number;
        longitude: number;
    };
}

async function searchPlacesProxy(lat: number, lon: number, query: string, radius: number): Promise<Place[]> {
    const res = await fetch(
        `/api/places?lat=${lat}&lng=${lon}&radius=${radius}&keyword=${encodeURIComponent(query)}`
    );

    const data = await res.json();
    return data.places || [];
}

/** Extract coordinates from a place result */
function getPlaceCoordinates(place: Place): { lat: number; lon: number } {
    return {
        lat: place.location.latitude,
        lon: place.location.longitude,
    };
}

/** Build a Google Maps URL for a given coordinate */
function googleMapsUrl(lat: number, lon: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

interface AddressEntry {
    id: number;
    value: string;
    coord: GeocodeResult | null;
    suggestions: Suggestion[];
    showSuggestions: boolean;
}

interface EnrichedPlace extends Place {
    coords: { lat: number; lon: number };
    distances: number[];
    sumDist: number;
}

let nextAddressId = 2;

export default function Search() {
    const { data: session, status } = useSession();

    const [addresses, setAddresses] = useState<AddressEntry[]>([
        { id: 0, value: "", coord: null, suggestions: [], showSuggestions: false },
        { id: 1, value: "", coord: null, suggestions: [], showSuggestions: false },
    ]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [initialDistance, setInitialDistance] = useState("2"); // Default search radius in miles

    // The final midpoint
    const [midpoint, setMidpoint] = useState<MidpointCoordinates | null>(null);

    // The places found near the midpoint
    const [places, setPlaces] = useState<EnrichedPlace[]>([]);

    // Error or info messages
    const [message, setMessage] = useState("");

    // The user's current location, used to bias autocomplete results and
    // offer a quick "use my location" fill-in for an address.
    const [userLocation, setUserLocation] = useState<GeocodeResult | null>(null);
    const [locating, setLocating] = useState<number | null>(null);

    const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
    const abortControllers = useRef<Record<number, AbortController>>({});

    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({
                    lat: position.coords.latitude,
                    lon: position.coords.longitude,
                });
            },
            () => {
                // Permission denied or unavailable; autocomplete just won't be biased.
            }
        );
    }, []);

    function updateAddress(id: number, changes: Partial<AddressEntry>) {
        setAddresses((prev) =>
            prev.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry))
        );
    }

    function handleAddressChange(id: number, value: string) {
        updateAddress(id, { value, coord: null });

        clearTimeout(debounceTimers.current[id]);
        abortControllers.current[id]?.abort();

        if (value.trim().length < 3) {
            updateAddress(id, { suggestions: [], showSuggestions: false });
            return;
        }

        debounceTimers.current[id] = setTimeout(async () => {
            const controller = new AbortController();
            abortControllers.current[id] = controller;
            try {
                const suggestions = await fetchSuggestions(value, controller.signal, userLocation);
                updateAddress(id, { suggestions, showSuggestions: true });
            } catch {
                // Ignore aborted/failed lookups; user is likely still typing.
            }
        }, 400);
    }

    async function handleUseMyLocation(id: number) {
        if (!navigator.geolocation) {
            setMessage("Geolocation is not available in this browser.");
            return;
        }

        setLocating(id);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                setUserLocation({ lat, lon });

                const result = await reverseGeocode(lat, lon);
                if (result) {
                    updateAddress(id, {
                        value: result.label,
                        coord: result.coord,
                        suggestions: [],
                        showSuggestions: false,
                    });
                } else {
                    setMessage("Could not determine your address from your location.");
                }
                setLocating(null);
            },
            () => {
                setMessage("Location permission was denied.");
                setLocating(null);
            }
        );
    }

    function handleSelectSuggestion(id: number, suggestion: Suggestion) {
        updateAddress(id, {
            value: suggestion.label,
            coord: { lat: suggestion.lat, lon: suggestion.lon },
            suggestions: [],
            showSuggestions: false,
        });
    }

    function handleAddAddress() {
        const id = nextAddressId++;
        setAddresses((prev) => [
            ...prev,
            { id, value: "", coord: null, suggestions: [], showSuggestions: false },
        ]);
    }

    function handleRemoveAddress(id: number) {
        setAddresses((prev) => prev.filter((entry) => entry.id !== id));
    }

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
        e.preventDefault();
        setLoading(true);
        setPlaces([]);
        setMessage("");
        setMidpoint(null);

        const filledAddresses = addresses.filter((entry) => entry.value.trim().length > 0);

        if (filledAddresses.length < 2) {
            setMessage("Please enter at least two addresses.");
            setLoading(false);
            return;
        }

        try {
            const coords = await Promise.all(
                filledAddresses.map((entry) => entry.coord ?? geocodeAddress(entry.value.trim()))
            );

            if (coords.some((c) => !c)) {
                setMessage("Failed to geocode one or more addresses.");
                setLoading(false);
                return;
            }

            const validCoords = coords as GeocodeResult[];

            // Calculate midpoint
            const mid = calculateMidpoint(validCoords);
            setMidpoint(mid);

            let results: Place[] = [];
            let attempts = 0;
            const maxAttempts = 3;
            const desiredCount = 3;
            const initialDistanceMiles = parseFloat(initialDistance) || 2;
            let radiusMeters = initialDistanceMiles * 1609.34; // Convert miles to meters

            while (attempts < maxAttempts && results.length < desiredCount) {
                results = await searchPlacesProxy(mid.lat, mid.lon, query, radiusMeters);
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
                const enriched = results.map((place) => {
                    const coords = getPlaceCoordinates(place);
                    const distances = validCoords.map((c) =>
                        haversineDistanceMiles(c.lat, c.lon, coords.lat, coords.lon)
                    );
                    const sumDist = distances.reduce((sum, d) => sum + d, 0);
                    return { ...place, coords, distances, sumDist };
                });

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
        <div className="min-h-screen bg-gradient-to-r from-blue-300 to-purple-400 flex items-center justify-center px-4 py-10">
            <div className="w-full max-w-lg bg-white bg-opacity-85 backdrop-filter backdrop-blur-lg p-8 rounded-xl shadow-xl transform hover:scale-105 transition duration-300">
                <h1 className="text-3xl font-bold mb-6 text-center text-gray-900">
                    Find Equidistant Venues
                </h1>
                {/* Search Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                    {addresses.map((entry, index) => (
                        <div key={entry.id} className="relative">
                            <label htmlFor={`address-${entry.id}`} className="block mb-1 font-medium text-gray-700">
                                Address {index + 1}:
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    id={`address-${entry.id}`}
                                    type="text"
                                    placeholder={`Enter address ${index + 1}`}
                                    value={entry.value}
                                    onChange={(e) => handleAddressChange(entry.id, e.target.value)}
                                    onFocus={() =>
                                        updateAddress(entry.id, { showSuggestions: entry.suggestions.length > 0 })
                                    }
                                    onBlur={() =>
                                        setTimeout(() => updateAddress(entry.id, { showSuggestions: false }), 150)
                                    }
                                    required={index < 2}
                                    autoComplete="off"
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleUseMyLocation(entry.id)}
                                    disabled={locating === entry.id}
                                    aria-label="Use my current location"
                                    title="Use my current location"
                                    className="p-2 text-blue-600 hover:text-blue-800 transition disabled:opacity-50"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21c-4.5-4.5-7-8.25-7-11.25a7 7 0 1114 0c0 3-2.5 6.75-7 11.25z" />
                                        <circle cx="12" cy="9.75" r="2.25" />
                                    </svg>
                                </button>
                                {index >= 2 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveAddress(entry.id)}
                                        aria-label={`Remove address ${index + 1}`}
                                        className="p-2 text-red-600 hover:text-red-800 transition"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7h14z" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                            {entry.showSuggestions && entry.suggestions.length > 0 && (
                                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                    {entry.suggestions.map((s, i) => (
                                        <li
                                            key={i}
                                            onMouseDown={() => handleSelectSuggestion(entry.id, s)}
                                            className="px-3 py-2 text-sm hover:bg-blue-100 cursor-pointer"
                                        >
                                            {s.label}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={handleAddAddress}
                        className="flex items-center gap-2 text-blue-700 hover:text-blue-900 font-medium transition"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Add another address
                    </button>
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
                            <a
                                key={index}
                                href={googleMapsUrl(place.coords.lat, place.coords.lon)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block mb-4 p-2 border-b last:border-b-0 hover:bg-blue-50 rounded transition"
                            >
                                <div className="font-bold text-blue-700 hover:underline">
                                    {place.displayName.text || "Unnamed Place"}
                                </div>
                                <div className="text-sm text-gray-600">
                                    {place.formattedAddress && (
                                        <span className="block mb-1">
                                            Address: {place.formattedAddress}
                                        </span>
                                    )}
                                    {place.distances.map((d, i) => (
                                        <span key={i} className="block">
                                            Distance from Address {i + 1}: {d.toFixed(2)} mi
                                        </span>
                                    ))}
                                    <span className="block font-medium">
                                        Total Distance: {place.sumDist.toFixed(2)} mi
                                    </span>
                                </div>
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
