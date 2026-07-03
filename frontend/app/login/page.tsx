"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import ThemeToggle from "../../components/ThemeToggle";
import Footer from "../../components/Footer";

export default function LoginPage() {
    const router = useRouter();
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [rememberMe, setRememberMe] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
                setLoading(false);
                return;
            }

            // Redirect to manage-evac on success
            router.push("/manage-evac");
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col antialiased selection:bg-primary-blue-bg selection:text-primary-blue flows-root relative overflow-x-hidden">
            {/* Background Aurora Effect */}
            <div className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none">
                <div className="aurora-layer aurora-mask" />
            </div>

            {/* Header Navigation */}
            <header className="relative w-full border-b border-border-surface bg-bg-mantle/95 backdrop-blur-md z-30 px-4 md:px-6 py-3 flex flex-row items-center justify-between gap-2 flows-header">
                <div className="flex items-center gap-2 md:gap-3">
                    <Link
                        href="/"
                        className="group flex flex-col leading-none shrink-0 cursor-pointer transition-all"
                    >
                        <span className="text-sm font-extrabold tracking-widest uppercase bg-gradient-to-r from-text-text to-text-subtext text-transparent bg-clip-text group-hover:opacity-90 transition-opacity">
                            FLOWS
                        </span>
                        <span className="hidden sm:block text-[8px] font-mono tracking-wider uppercase text-text-muted">
                            Flood Level Observation &amp; Warning System
                        </span>
                    </Link>
                </div>

                <ThemeToggle />

            </header>

            {/* Login Main Container */}
            <main className="flex-1 flex items-center justify-center px-4 py-12 md:py-20 relative z-10">
                <div className="w-full max-w-[420px] bg-bg-mantle/60 backdrop-blur-xl border border-border-surface rounded-lg p-6 sm:p-8 shadow-2xl flex flex-col gap-6 relative flows-card transition-all duration-300 hover:border-primary-blue/30">

                    {/* Card Accent Top Line */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-blue to-safe-from rounded-t-lg opacity-85" />

                    {/* Form Header */}
                    <div className="flex flex-col gap-2 text-center">
                        <div className="flex justify-center mb-1">
                            <div className="p-2.5 rounded-full border border-primary-blue-border bg-primary-blue-bg/30 text-primary-blue">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                </svg>
                            </div>
                        </div>
                        <h1 className="text-lg font-bold tracking-tight text-text-text">
                            Login
                        </h1>

                    </div>

                    {/* Error display */}
                    {error && (
                        <div className="border border-semantic-red-border bg-semantic-red-bg/25 rounded-[4px] p-3 text-[11px] text-semantic-red leading-relaxed flex gap-2.5 items-start">
                            <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Form Fields */}
                    <form onSubmit={handleSignIn} className="flex flex-col gap-4">

                        {/* Email/Username Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-mono text-text-subtext uppercase tracking-wider">
                                Email
                            </label>
                            <div className="relative flex items-center">
                                <span className="absolute left-3 text-text-muted">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="name@agency.gov"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-bg-crust border border-border-surface rounded-[4px] pl-9 pr-3 py-2 text-[12px] text-text-text placeholder:text-text-muted focus:outline-none focus:border-primary-blue transition-colors duration-200"
                                    required
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        {/* Password Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-mono text-text-subtext uppercase tracking-wider">
                                Password
                            </label>
                            <div className="relative flex items-center">
                                <span className="absolute left-3 text-text-muted">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                </span>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="••••••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-bg-crust border border-border-surface rounded-[4px] pl-9 pr-10 py-2 text-[12px] text-text-text placeholder:text-text-muted focus:outline-none focus:border-primary-blue transition-colors duration-200"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 text-text-muted hover:text-text-subtext transition-colors cursor-pointer focus:outline-none"
                                    tabIndex={-1}
                                    disabled={loading}
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Remember Me & Forgot Password */}
                        <div className="flex items-center justify-between text-[11px] font-sans pt-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none group text-text-subtext">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="rounded-[3px] bg-bg-crust border border-border-surface text-primary-blue focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-primary-blue"
                                    disabled={loading}
                                />
                                <span className="group-hover:text-text-text transition-colors">
                                    Remember me
                                </span>
                            </label>
                            <Link
                                href="/forgot-password"
                                className="text-primary-blue hover:underline transition-all font-medium"
                            >
                                Forgot Password?
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`mt-2 w-full py-2 bg-primary-blue hover:bg-primary-blue/90 text-white font-medium rounded-[4px] text-[12px] transition-all duration-200 cursor-pointer shadow-lg shadow-primary-blue-bg/30 active:scale-[0.99] focus:outline-none focus:ring-1 focus:ring-primary-blue focus:ring-offset-2 focus:ring-offset-bg-base ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                            {loading ? "Signing In..." : "Sign In"}
                        </button>
                    </form>

                    {/* Form Divider */}
                    <div className="flex items-center gap-3 text-[9px] font-mono text-text-muted uppercase tracking-wider py-1">
                        <div className="flex-1 h-px bg-border-surface/40" />
                        <span>Authorized Access Only</span>
                        <div className="flex-1 h-px bg-border-surface/40" />
                    </div>

                    {/* Warning notice */}
                    <div className="border border-border-surface bg-bg-crust/40 rounded-[4px] p-3 text-[10px] text-text-muted leading-relaxed flex gap-2.5 items-start">
                        <svg className="w-4 h-4 text-semantic-yellow shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>
                            This system is restricted to authorized personnel. Telemetry edits and emergency shelter coordination logs are audited.
                        </span>
                    </div>

                </div>
            </main>

            {/* Footer */}
            <Footer />
        </div>
    );
}

