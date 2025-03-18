// lib/users.js
import bcrypt from "bcryptjs";

// This is just an in-memory user store.
// For production, use a real database.
let users = [];

// Find a user by email
export async function findUserByEmail(email) {
  return users.find((user) => user.email === email);
}

// Add a new user (hashes password)
export async function addUser(email, password) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: Date.now().toString(),
    email,
    password: hashedPassword,
  };
  console.log("Adding user:", newUser);
  users.push(newUser);
  return newUser;
}

// Verify password
export async function verifyPassword(inputPassword, hashedPassword) {
  return await bcrypt.compare(inputPassword, hashedPassword);
}
