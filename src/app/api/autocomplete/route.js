// app/api/autocomplete/route.js
import { NextResponse } from "next/server";

// Nominatim (OpenStreetMap) usage policy requires a descriptive User-Agent
// identifying the application, since no API key is used.
const USER_AGENT = "EquidistanceApp/1.0 (https://github.com/dammyog/equidistance)";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const userLat = parseFloat(searchParams.get("lat"));
  const userLon = parseFloat(searchParams.get("lon"));
  const hasUserLocation = !Number.isNaN(userLat) && !Number.isNaN(userLon);

  if (!query || query.trim().length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  try {
    // Bias (not restrict) results toward the user's location by centering a
    // viewbox on them, without `bounded=1` so matches elsewhere still surface.
    let viewboxParams = "";
    if (hasUserLocation) {
      const delta = 0.5; // roughly a ~50km bias box
      const viewbox = [
        userLon - delta,
        userLat + delta,
        userLon + delta,
        userLat - delta,
      ].join(",");
      viewboxParams = `&viewbox=${viewbox}`;
    }

    const url =
      `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=8` +
      `&q=${encodeURIComponent(query)}${viewboxParams}`;

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    const data = await res.json();

    let suggestions = Array.isArray(data)
      ? data.map((place) => ({
          label: place.display_name,
          lat: parseFloat(place.lat),
          lon: parseFloat(place.lon),
        }))
      : [];

    if (hasUserLocation) {
      suggestions = suggestions.sort(
        (a, b) =>
          haversineDistance(userLat, userLon, a.lat, a.lon) -
          haversineDistance(userLat, userLon, b.lat, b.lon)
      );
    }

    return NextResponse.json({ suggestions: suggestions.slice(0, 5) });
  } catch (error) {
    console.error("Error fetching from Nominatim autocomplete API:", error);
    return NextResponse.json({ suggestions: [] });
  }
}
