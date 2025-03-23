// app/api/places/route.js
import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  //   const radius = parseFloat(searchParams.get("radius"));
  const radius = Math.round(parseFloat(searchParams.get("radius")));
  const keyword = searchParams.get("keyword");

  if (!lat || !lng || !radius || !keyword) {
    return NextResponse.json(
      { error: "Missing required query parameters" },
      { status: 400 }
    );
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Build the request body for the new endpoint
  const requestBody = {
    textQuery: keyword,
    // includedTypes: [keyword],
    // maxResultCount: 10, // Adjust the count as necessary
    // locationRestriction: {
    //   circle: {
    //     center: {
    //       latitude: lat,
    //       longitude: lng,
    //     },
    //     radius: radius, // The radius is expected in meters
    //   },
    // },
  };
  console.log(requestBody);
  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          // Specify the fields you want returned (adjust as needed)
          "X-Goog-FieldMask":
            "places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify(requestBody),
      }
    );
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching from Google Places API:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}

/* Text Search API */

// app/api/places/route.js
// import { NextResponse } from "next/server";

// export async function GET(request) {
//   const { searchParams } = new URL(request.url);
//   const lat = parseFloat(searchParams.get("lat"));
//   const lng = parseFloat(searchParams.get("lng"));
//   const radius = Math.round(parseFloat(searchParams.get("radius"))); // in meters
//   const query = searchParams.get("query"); // using "query" instead of "keyword"

//   if (!lat || !lng || !radius || !query) {
//     return NextResponse.json(
//       { error: "Missing required query parameters" },
//       { status: 400 }
//     );
//   }

//   const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

//   // Construct the Text Search API URL.
//   // Including the location and radius biases the results to the specified area.
//   const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
//     query
//   )}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;

//   try {
//     const response = await fetch(url);
//     const data = await response.json();
//     return NextResponse.json(data);
//   } catch (error) {
//     console.error("Error fetching from Google Places Text Search API:", error);
//     return NextResponse.json(
//       { error: "Failed to fetch data" },
//       { status: 500 }
//     );
//   }
// }
