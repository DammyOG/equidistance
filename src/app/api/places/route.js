// app/api/places/route.js
import { NextResponse } from "next/server";

// Nominatim (OpenStreetMap) usage policy requires a descriptive User-Agent
// identifying the application, since no API key is used.
const USER_AGENT = "EquidistanceApp/1.0 (https://github.com/dammyog/equidistance)";

// Roughly converts a radius in meters to a lat/lon degree delta for the
// given latitude, used to build a bounding box for the search.
function metersToDegreeDeltas(lat, radiusMeters) {
  const deltaLat = radiusMeters / 111320;
  const deltaLon = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { deltaLat, deltaLon };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  const radius = Math.round(parseFloat(searchParams.get("radius")));
  const keyword = searchParams.get("keyword");

  if (!lat || !lng || !radius || !keyword) {
    return NextResponse.json(
      { error: "Missing required query parameters" },
      { status: 400 }
    );
  }

  const { deltaLat, deltaLon } = metersToDegreeDeltas(lat, radius);
  // Nominatim viewbox format: left(lon),top(lat),right(lon),bottom(lat)
  const viewbox = [
    lng - deltaLon,
    lat + deltaLat,
    lng + deltaLon,
    lat - deltaLat,
  ].join(",");

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=10` +
      `&q=${encodeURIComponent(keyword)}&viewbox=${viewbox}&bounded=1`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const data = await res.json();

    const places = Array.isArray(data)
      ? data.map((place) => ({
          displayName: { text: place.display_name.split(",")[0] },
          formattedAddress: place.display_name,
          location: {
            latitude: parseFloat(place.lat),
            longitude: parseFloat(place.lon),
          },
        }))
      : [];

    return NextResponse.json({ places });
  } catch (error) {
    console.error("Error fetching from Nominatim search API:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
