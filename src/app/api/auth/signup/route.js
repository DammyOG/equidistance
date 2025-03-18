// app/api/auth/signup/route.js
import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(request) {
  const { email, password, username } = await request.json();

  // Check if a user with the given email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { message: "User already exists" },
      { status: 422 }
    );
  }

  const hashedpassword = await bcrypt.hash(password, 10);

  // Create a new user (consider hashing the password in production)
  const newUser = await prisma.user.create({
    data: {
      email,
      username,
      password: hashedpassword, // In production, hash the password using bcrypt or similar.
    },
  });

  return NextResponse.json(
    { message: "User created", user: newUser },
    { status: 201 }
  );
}
