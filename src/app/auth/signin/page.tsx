"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Signin() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setErrorMessage("");

        const res = await signIn("credentials", { email, password, redirect: false });
        setLoading(false);

        if (!res || res.error) {
            setErrorMessage(res?.error || "Unknown error occurred. Please try again.");
        } else {
            router.push("/");
        }
    }

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-purple-300 to-blue-400">
            <div className="w-full max-w-md p-8 bg-white bg-opacity-80 backdrop-filter backdrop-blur-lg rounded-xl shadow-lg transform hover:scale-105 transition duration-300">
                <h1 className="text-3xl font-bold mb-6 text-center text-gray-900">Sign In</h1>
                {errorMessage && (
                    <p className="mb-4 text-red-600 text-center">{errorMessage}</p>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="email" className="block mb-1 text-sm font-medium text-gray-700">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Email"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block mb-1 text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            placeholder="Password"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full p-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition duration-300 disabled:opacity-50"
                    >
                        {loading ? "Signing In..." : "Sign In"}
                    </button>
                </form>
            </div>
        </div>
    );
}
