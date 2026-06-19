// app/api/autocomplete/route.js
import { NextResponse } from "next/server";

// Nominatim (OpenStreetMap) usage policy requires a descriptive User-Agent
// identifying the application, since no API key is used.
const USER_AGENT = "EquidistanceApp/1.0 (https://github.com/dammyog/equidistance)";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=5&q=${encodeURIComponent(
      query
    )}`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const data = await res.json();

    const suggestions = Array.isArray(data)
      ? data.map((place) => ({
          label: place.display_name,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
        }))
      : [];

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error fetching from Nominatim autocomplete API:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
