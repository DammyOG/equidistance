"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function NavBar() {
    const { data: session, status } = useSession();

    // Loading state with a gradient background and animated text
    if (status === "loading") {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-purple-100">
                <p className="text-2xl font-medium text-gray-800 animate-pulse">Loading...</p>
            </div>
        );
    }

    if (!session || !session.user) {
        return (
            <nav className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
                <div className="flex items-center space-x-6">
                    <Link href="/">
                        <span className="cursor-pointer text-xl font-bold hover:text-gray-300">
                            Home
                        </span>
                    </Link>
                    <Link href="/profile">
                        <span className="cursor-pointer text-lg hover:text-gray-300">
                            Profile
                        </span>
                    </Link>
                </div>
                <div>
                    <Link href="/auth/signin">
                        <span className="cursor-pointer text-md hover:text-gray-300">
                            Sign In
                        </span>
                    </Link>
                </div>
            </nav>
        );
    }

    return (
        <nav className="bg-gray-800 text-white px-6 py-4 flex justify-between items-center shadow-md">
            <div className="flex items-center space-x-6">
                <Link href="/">
                    <span className="cursor-pointer text-xl font-bold hover:text-gray-300">
                        Home
                    </span>
                </Link>
                {/* <Link href="/profile">
                    <span className="cursor-pointer text-lg hover:text-gray-300">
                        Profile
                    </span>
                </Link> */}
            </div>
            <div>
                {session ? (
                    <span className="text-md">
                        Welcome, {session.user.username}!
                    </span>
                ) : (
                    <Link href="/auth/signin">
                        <span className="cursor-pointer text-md hover:text-gray-300">
                            Sign In
                        </span>
                    </Link>
                )}
            </div>
        </nav>
    );
}
