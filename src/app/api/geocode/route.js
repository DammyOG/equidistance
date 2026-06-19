// app/api/geocode/route.js
import { NextResponse } from "next/server";

// Nominatim (OpenStreetMap) usage policy requires a descriptive User-Agent
// identifying the application, since no API key is used.
const USER_AGENT = "EquidistanceApp/1.0 (https://github.com/dammyog/equidistance)";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "Missing required query parameter: address" },
      { status: 400 }
    );
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
      address
    )}`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ result: null });
    }

    return NextResponse.json({
      result: {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      },
    });
  } catch (error) {
    console.error("Error fetching from Nominatim geocoding API:", error);
    return NextResponse.json(
      { error: "Failed to fetch geocoding data" },
      { status: 500 }
    );
  }
}
