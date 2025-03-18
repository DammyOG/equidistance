"use client";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export default function Home() {
    const { data: session, status } = useSession();

    // Loading state with a gradient background and animated text
    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-purple-100">
                <p className="text-2xl font-medium text-gray-800 animate-pulse">Loading...</p>
            </div>
        );
    }

    // Landing page for unauthenticated users
    if (!session || !session.user) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-purple-100">
                <div className="max-w-md mx-auto p-8 bg-white bg-opacity-90 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl transform hover:scale-105 transition duration-300">
                    <h1 className="text-4xl font-extrabold text-gray-900 mb-6">
                        Equidistant Venue Finder
                    </h1>
                    <p className="text-lg text-gray-700 mb-8">
                        Find the perfect spot to meet halfway.
                    </p>
                    <div className="flex justify-center space-x-4">
                        <Link
                            href="/auth/signin"
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-300"
                        >
                            Sign In
                        </Link>
                        <Link
                            href="/auth/signup"
                            className="px-8 py-3 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition duration-300"
                        >
                            Sign Up
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Dashboard for authenticated users
    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-green-100 to-blue-100">
            <div className="max-w-md mx-auto p-8 bg-white bg-opacity-90 backdrop-filter backdrop-blur-lg rounded-xl shadow-2xl transform hover:scale-105 transition duration-300">
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    Welcome, {session.user.username}!
                </h1>
                <p className="text-gray-700 mb-6">
                    Ready to find a meeting spot that works for everyone?
                </p>
                <div className="flex flex-col items-center space-y-4">
                    <Link
                        href="/search"
                        className="w-full text-center px-8 py-3 bg-amber-500 text-white rounded-lg shadow hover:bg-amber-600 transition duration-300"
                    >
                        Search Venues
                    </Link>
                    <button
                        onClick={() => signOut()}
                        className="w-full text-center px-8 py-3 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition duration-300"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}
