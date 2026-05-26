"use client";

import React, { useEffect, useRef, useState } from "react";
import { AuroraBackground } from "@/components/ui/aurora-background";
import Link from "next/link";
import ThemeToggle from "../components/ThemeToggle";
import Footer from "../components/Footer";

const FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.5 2.121m-1.5-2.121c.251.023.501.05.75.082M5 14.5l-1.5 1.5m0 0A2.25 2.25 0 001.5 18v.75M5 14.5l4.5-4.5M19 14.5l1.5 1.5m0 0A2.25 2.25 0 0122.5 18v.75m-3-3.75l-4.5-4.5" />
      </svg>
    ),
    label: "XGBoost Classifier",
    desc: "Gradient-boosted ensemble of 100 decision trees running binary:logistic inference on rolling rainfall telemetry.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z" />
      </svg>
    ),
    label: "Open-Meteo Integration",
    desc: "Hourly rainfall forecasts fetched live from Open-Meteo APIs — 1h intensity, 6h and 24h rolling accumulation.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
      </svg>
    ),
    label: "Cartographic Risk Map",
    desc: "Leaflet-powered interactive map of Naga City with color-coded flood risk overlays updating per selected hour.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
    label: "3-Day Telemetry Timeline",
    desc: "Dual-axis SVG charts display rain intensity and flood probability curves per hour across a 72-hour window.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    label: "Real-Time PST Clock",
    desc: "Live Philippine Standard Time display with automatic hourly re-sync countdown tied to Open-Meteo refresh cycles.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3.75h3m-6-7.5H9m1.5 3.75H9m1.5 3.75H9" />
      </svg>
    ),
    label: "Hourly Log Table",
    desc: "Full 24-hour tabular breakdown of rainfall metrics, accumulations, and classified risk levels per hour.",
  },
];

const RISK_LEVELS = [
  {
    label: "Safe",
    range: "< 1%",
    color: "var(--safe-text)",
    bg: "var(--safe-bg)",
    border: "var(--safe-border)",
  },
  {
    label: "Low",
    range: "1 – 10%",
    color: "var(--primary-blue)",
    bg: "var(--primary-blue-bg)",
    border: "var(--primary-blue-border)",
  },
  {
    label: "Moderate",
    range: "10 – 35%",
    color: "var(--semantic-yellow)",
    bg: "var(--semantic-yellow-bg)",
    border: "var(--semantic-yellow-border)",
  },
  {
    label: "High",
    range: "> 35%",
    color: "var(--semantic-red)",
    bg: "var(--semantic-red-bg)",
    border: "var(--semantic-red-border)",
  },
];

const STACK = [
  {
    name: "Next.js",
    role: "App Framework",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-text-text" fill="currentColor">
        <path d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l8.011 12.742-.161.985zM15.999 7.2v6.792l1.6 2.227V7.2h-1.6z" />
      </svg>
    ),
  },
  {
    name: "React",
    role: "UI Runtime",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#149ECA] dark:text-[#61DAFB]" fill="currentColor">
        <path d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z" />
      </svg>
    ),
  },
  {
    name: "Tailwind CSS",
    role: "CSS Framework",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#0ea5e9] dark:text-[#38bdf8]" fill="currentColor">
        <path d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zm-6 7.2c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z" />
      </svg>
    ),
  },
  {
    name: "Leaflet.js",
    role: "Cartography Engine",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#199900] dark:text-[#22c55e]" fill="currentColor">
        <path d="M17.69 0c-.355.574-8.432 4.74-10.856 8.649-2.424 3.91-3.116 6.988-2.237 9.882.879 2.893 2.559 2.763 3.516 3.717.958.954 2.257 2.113 4.332 1.645 2.717-.613 5.335-2.426 6.638-7.508 1.302-5.082.448-9.533-.103-11.99A35.395 35.395 0 0 0 17.69 0zm-.138.858l-9.22 21.585-.574-.577Z" />
      </svg>
    ),
  },
  {
    name: "FastAPI",
    role: "API Framework",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#009688] dark:text-[#4DB6AC]" fill="currentColor">
        <path d="M12 0C5.376 0 0 5.376 0 12c0 6.623 5.376 12 12 12 6.623 0 12-5.377 12-12 0-6.624-5.377-12-12-12zm-.624 21.619v-7.227H7.19L13.203 2.38v7.227h4.029L11.376 21.62z" />
      </svg>
    ),
  },
  {
    name: "Python",
    role: "Backend Language",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#3776AB] dark:text-[#4B8BBE]" fill="currentColor">
        <path d="M11.914 0C5.82 0 6.2 2.656 6.2 2.656l.007 2.752h5.814v.826H3.9S0 5.789 0 11.969c0 6.18 3.403 5.963 3.403 5.963h2.032v-2.867s-.109-3.403 3.35-3.403h5.769s3.24.052 3.24-3.13V3.13S18.28 0 11.914 0zm-3.21 1.81a1.047 1.047 0 011.045 1.046 1.047 1.047 0 01-1.046 1.045 1.047 1.047 0 01-1.045-1.046A1.047 1.047 0 018.703 1.81zM12.086 24c6.096 0 5.716-2.656 5.716-2.656l-.007-2.752h-5.814v-.826h8.12S24 18.211 24 12.031c0-6.18-3.403-5.963-3.403-5.963h-2.032v2.867s.109 3.403-3.35 3.403H9.446s-3.24-.052-3.24 3.13v5.402S5.72 24 12.086 24zm3.21-1.81a1.047 1.047 0 01-1.045-1.046 1.047 1.047 0 011.046-1.045 1.047 1.047 0 011.045 1.046A1.047 1.047 0 0115.297 22.19z" />
      </svg>
    ),
  },
  {
    name: "TypeScript",
    role: "Full-Stack Language",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="3" fill="#3178C6" />
        <clipPath id="ts-clip">
          <rect width="24" height="24" rx="3" />
        </clipPath>
        <g clipPath="url(#ts-clip)">
          {/* T */}
          <path d="M1 10.5H13V13H8.75V26H5.25V13H1V10.5Z" fill="white" />
          {/* S */}
          <path
            d="M15.5 10.5C13.015 10.5 11 12.2 11 14.5C11 16.8 12.4 17.9 14.7 18.7L15.6 19C17 19.5 17.8 19.9 17.8 20.8C17.8 21.6 17.05 22.2 15.8 22.2C14.35 22.2 13.35 21.45 12.95 20.2L10.6 21.3C11.35 23.3 13.2 24.5 15.8 24.5C18.5 24.5 20.5 22.8 20.5 20.5C20.5 18.2 19.1 17.1 16.8 16.3L15.9 16C14.55 15.5 13.8 15.15 13.8 14.35C13.8 13.7 14.4 13.1 15.5 13.1C16.55 13.1 17.3 13.6 17.7 14.55L19.9 13.4C19.1 11.65 17.5 10.5 15.5 10.5Z"
            fill="white"
          />
        </g>
      </svg>
    ),
  },
  {
    name: "XGBoost",
    role: "ML Model",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#1396F1] dark:text-[#38bdf8]" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714a2.25 2.25 0 001.5 2.121m-1.5-2.121c.251.023.501.05.75.082M5 14.5l-1.5 1.5m0 0A2.25 2.25 0 001.5 18v.75M5 14.5l4.5-4.5M19 14.5l1.5 1.5m0 0A2.25 2.25 0 0122.5 18v.75m-3-3.75l-4.5-4.5" />
      </svg>
    ),
  },
  {
    name: "Open-Meteo",
    role: "Weather API",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#0ea5e9] dark:text-[#38bdf8]" fill="currentColor">
        <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" />
      </svg>
    ),
  },
  {
    name: "Supabase",
    role: "Database Layer",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-[#10b981] dark:text-[#3ECF8E]" fill="currentColor">
        <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.303 12.586.71 13.4 1.407 13.4h8.02l.165 9.564c.015.986 1.26 1.41 1.874.637l9.262-11.652c.46-.536.054-1.35-.644-1.35h-8.02L11.9 1.036z" />
      </svg>
    ),
  },
  {
    name: "Vercel",
    role: "Frontend Deploy",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-text-text" fill="currentColor">
        <path d="M24 22.525H0l12-21.05 12 21.05z" />
      </svg>
    ),
  },
  {
    name: "Render",
    role: "API Deploy",
    logo: (
      <svg viewBox="0 0 24 24" className="w-6 h-6 text-text-text" fill="currentColor">
        <path d="M18.263.007c-3.121-.147-5.744 2.109-6.192 5.082-.018.138-.045.272-.067.405-.696 3.703-3.936 6.507-7.827 6.507-1.388 0-2.691-.356-3.825-.979a.2024.2024 0 0 0-.302.178V24H12v-8.999c0-1.656 1.338-3 2.987-3h2.988c3.382 0 6.103-2.817 5.97-6.244-.12-3.084-2.61-5.603-5.682-5.75" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  const [phTime, setPhTime] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NAV_LINKS = [
    { id: 'about', label: 'About' },
    { id: 'features', label: 'Features' },
    { id: 'risk-model', label: 'Risk Model' },
    { id: 'stack', label: 'Stack' },
  ];

  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Set active immediately — don't wait for scroll detector
    setActiveSection(id);
    // Suppress scroll detector during smooth scroll animation
    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 900);
    const nav = document.querySelector('nav');
    const navHeight = nav ? nav.getBoundingClientRect().height : 64;
    const top = el.getBoundingClientRect().top + window.scrollY - navHeight - 16;
    window.scrollTo({ top, behavior: 'smooth' });
  };



  useEffect(() => {
    const update = () => {
      try {
        setPhTime(
          new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Manila",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          }).format(new Date())
        );
      } catch { }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll-position based active section detection (reliable for all section heights)
  useEffect(() => {
    const sectionIds = ['hero', 'about', 'features', 'risk-model', 'stack', 'cta'];
    const detect = () => {
      // Don't override active section during programmatic smooth scroll
      if (isProgrammaticScroll.current) return;
      const nav = document.querySelector('nav');
      const navHeight = nav ? nav.getBoundingClientRect().height : 64;
      const detectionY = navHeight + 32;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= detectionY) {
          current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', detect, { passive: true });
    detect();
    return () => window.removeEventListener('scroll', detect);
  }, []);

  return (
    <div
      className="min-h-screen flows-root font-sans antialiased overflow-x-hidden"
      style={{ background: "var(--bg-base)", color: "var(--text-text)" }}
    >
      {/* ── NAV ── */}
      <nav
        style={{
          background: scrolled ? "rgba(var(--bg-mantle-rgb), 0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid var(--border-surface)" : "1px solid transparent",
          transition: "all 0.35s ease",
        }}
        className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-3 md:py-3 flex items-center justify-between gap-4"
      >
        {/* Brand */}
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

        {/* Center nav links — desktop only */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className={`relative px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider rounded-[4px] transition-all duration-200 cursor-pointer ${activeSection === link.id
                ? 'text-primary-blue'
                : 'text-text-muted hover:text-text-subtext'
                }`}
            >
              {link.label}
              {activeSection === link.id && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-primary-blue" />
              )}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* PST — sm+ only */}
          <div className="hidden sm:flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator font-mono text-[9px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://flagsapi.com/PH/flat/64.png" alt="Philippines Flag" className="w-3 h-3 object-contain select-none" />
            <span className="text-text-muted font-bold uppercase tracking-wider">PST:</span>
            <span className="text-text-text font-bold tracking-wider">{phTime || "12:00:00 AM"}</span>
          </div>

          {/* Theme toggle (centralized) */}
          <ThemeToggle />

          {/* Launch Dashboard — desktop */}
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center h-7 px-3 rounded-[4px] text-[9px] font-bold font-mono uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--primary-blue)", color: "#fff" }}
            id="nav-launch-dashboard"
          >
            Launch Dashboard →
          </Link>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="w-7 h-7 flex md:hidden items-center justify-center border border-border-surface bg-bg-crust/50 text-text-muted rounded-[4px] cursor-pointer transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-40 flex flex-col pt-16"
          style={{ background: "rgba(var(--bg-mantle-rgb), 0.98)", backdropFilter: "blur(16px)" }}
        >
          <nav className="flex flex-col gap-1 px-6 pt-6 pb-8">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => { scrollToSection(link.id); setMobileMenuOpen(false); }}
                className={`flex items-center justify-between py-4 border-b font-mono text-sm uppercase tracking-wider transition-colors cursor-pointer ${activeSection === link.id
                  ? 'text-primary-blue border-primary-blue/20'
                  : 'text-text-subtext border-border-surface hover:text-text-text'
                  }`}
              >
                {link.label}
                <svg className="w-4 h-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </nav>
          <div className="px-6 mt-auto pb-10">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center justify-center w-full py-3.5 rounded-[4px] text-sm font-bold font-mono uppercase tracking-wider transition-all active:scale-95"
              style={{ background: "var(--primary-blue)", color: "#fff" }}
            >
              Open Dashboard →
            </Link>
          </div>
        </div>
      )}

      {/* ── HERO ── */}
      <section
        className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-24 pb-20 text-center overflow-hidden"
        id="hero"
      >
        <AuroraBackground className="pointer-events-none absolute inset-0 z-0" />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-3xl mx-auto">
          {/* Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border font-mono text-[9px] uppercase tracking-widest"
            style={{ borderColor: "var(--primary-blue-border)", background: "var(--primary-blue-bg)", color: "var(--primary-blue)" }}>
            ML-Powered · Naga City, Philippines · Live Hourly
          </div>

          {/* Wordmark */}
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-extrabold tracking-tight leading-none bg-gradient-to-br from-text-text via-text-subtext to-primary-blue text-transparent bg-clip-text">
            FLOWS
          </h1>

          <p className="text-base md:text-lg font-light leading-relaxed max-w-xl"
            style={{ color: "var(--text-subtext)" }}>
            A machine-learning flood prediction dashboard for Naga City — combining real-time Open-Meteo weather data with an XGBoost classifier to deliver hourly flood probability assessments.
          </p>

          {/* CTA Buttons — stacked on mobile, row on sm+ */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-2 w-full">
            <Link
              href="/dashboard"
              id="hero-cta-dashboard"
              className="w-full sm:w-auto px-6 py-3 rounded-[4px] text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 text-center"
              style={{ background: "var(--primary-blue)", color: "#fff", boxShadow: "0 0 24px rgba(59,130,246,0.35)" }}
            >
              Open Dashboard →
            </Link>
            <a
              href="https://github.com/maki-sig/flood-prediction-test"
              target="_blank"
              rel="noopener noreferrer"
              id="hero-cta-github"
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-[4px] text-sm font-bold uppercase tracking-wider border transition-all hover:opacity-80 active:scale-95"
              style={{ borderColor: "var(--border-surface)", color: "var(--text-subtext)", background: "rgba(var(--bg-crust-rgb),0.4)" }}
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.298 24 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View on GitHub
            </a>
          </div>

          {/* Scroll hint */}
          <div className="mt-12 flex flex-col items-center gap-1.5 animate-bounce"
            style={{ color: "var(--text-muted)" }}>
            <span className="text-[9px] font-mono uppercase tracking-widest">Explore</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── WHAT IS FLOWS ── */}
      <section className="relative px-4 md:px-10 py-16 md:py-24 max-w-5xl mx-auto" id="about">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
          <div className="flex flex-col gap-5">
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--primary-blue)" }}>
              About the System
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold leading-snug" style={{ color: "var(--text-text)" }}>
              Flood risk intelligence, delivered hourly.
            </h2>
            <p className="text-sm font-light leading-relaxed" style={{ color: "var(--text-subtext)" }}>
              FLOWS (Flood Level Observation and Warning System) is an end-to-end predictive analytics platform built for Naga City, Camarines Sur. It ingests live atmospheric telemetry from Open-Meteo, runs an XGBoost gradient-boosted classifier, and surfaces actionable flood probability indices across a 72-hour forecast window.
            </p>
            <p className="text-sm font-light leading-relaxed" style={{ color: "var(--text-subtext)" }}>
              The system was engineered as a capstone project to bridge academic ML research with real-world disaster preparedness tooling, covering the full pipeline from raw weather API ingestion to an interactive production dashboard.
            </p>
            <div className="flex flex-col gap-2 p-4 rounded-[4px] border font-mono text-[10px] uppercase tracking-wider"
              style={{ borderColor: "var(--semantic-yellow-border)", background: "var(--semantic-yellow-bg)", color: "var(--semantic-yellow)" }}>
              <div className="flex items-center gap-2 font-bold">
                SYSTEM STATUS: ACTIVE BETA
              </div>
              <p className="text-[11px] font-sans font-light tracking-normal normal-case text-text-subtext">
                FLOWS is currently in its beta phase. Future integrations will include Barangay-level flood forecasting models, enhancing predictive resolution down to individual neighborhood sectors.
              </p>
            </div>
          </div>

          {/* Stats — 2-col on all sizes */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "72h", label: "Forecast Window" },
              { value: "100", label: "XGBoost Trees" },
              { value: "3", label: "Input Features" },
              { value: "4", label: "Risk Tiers" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 p-4 rounded-[4px] border flows-card"
                style={{ borderColor: "var(--border-surface)", background: "rgba(var(--bg-mantle-rgb),0.5)" }}
              >
                <span className="text-2xl md:text-3xl font-extrabold font-mono" style={{ color: "var(--primary-blue)" }}>{s.value}</span>
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="relative px-4 md:px-10 py-16 md:py-24 max-w-5xl mx-auto" id="features">
        <div className="flex flex-col items-center gap-2 mb-12 text-center">
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--primary-blue)" }}>
            Core Capabilities
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold" style={{ color: "var(--text-text)" }}>
            What powers FLOWS
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.label}
              className="flex flex-col gap-3 p-5 rounded-[4px] border transition-colors flows-card group"
              style={{ borderColor: "var(--border-surface)", background: "rgba(var(--bg-mantle-rgb),0.4)" }}
            >
              <div className="w-9 h-9 rounded-[4px] flex items-center justify-center shrink-0"
                style={{ background: "var(--primary-blue-bg)", color: "var(--primary-blue)", border: "1px solid var(--primary-blue-border)" }}>
                {f.icon}
              </div>
              <span className="text-[11px] font-bold font-mono uppercase tracking-wider" style={{ color: "var(--text-text)" }}>{f.label}</span>
              <p className="text-xs font-light leading-relaxed" style={{ color: "var(--text-subtext)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── RISK CLASSIFICATION ── */}
      <section className="relative px-4 md:px-10 py-16 md:py-24 max-w-5xl mx-auto" id="risk-model">
        <div className="flex flex-col md:flex-row gap-10 md:gap-16 items-start">
          <div className="flex flex-col gap-4 md:w-72 shrink-0">
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--primary-blue)" }}>
              Risk Model
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold leading-snug" style={{ color: "var(--text-text)" }}>
              Four-tier probability classification
            </h2>
            <p className="text-sm font-light leading-relaxed" style={{ color: "var(--text-subtext)" }}>
              Every hourly output is bucketed into one of four risk tiers based on the XGBoost probability score. Color-coded badges and map overlays reflect the active tier in real time.
            </p>
          </div>

          <div className="flex flex-col gap-3 flex-1 w-full">
            {RISK_LEVELS.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-4 px-4 py-4 rounded-[4px] border"
                style={{ borderColor: r.border, background: r.bg }}
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: r.color }} />
                  <span className="font-mono font-bold text-sm" style={{ color: r.color }}>{r.label}</span>
                </div>
                <span className="font-mono text-[11px]" style={{ color: "var(--text-subtext)" }}>Flood Probability {r.range}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="relative py-16 md:py-24 overflow-hidden" id="stack">
        {/* Header */}
        <div className="flex flex-col items-center gap-2 mb-12 text-center px-4">
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "var(--primary-blue)" }}>
            Technology Stack
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold" style={{ color: "var(--text-text)" }}>
            Built end-to-end
          </h2>
          <p className="text-sm font-light" style={{ color: "var(--text-subtext)" }}>
            Every layer of the pipeline, from data ingestion to deployment.
          </p>
        </div>

        {/* Marquee container with edge fades */}
        <div className="relative" id="stack-marquee-wrapper">
          {/* Left fade */}
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10"
            style={{ background: "linear-gradient(to right, var(--bg-base), transparent)" }} />
          {/* Right fade */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10"
            style={{ background: "linear-gradient(to left, var(--bg-base), transparent)" }} />

          {/* Single marquee track */}
          <div id="stack-marquee-track" className="flex gap-4 w-max pr-4">
            {[...STACK, ...STACK, ...STACK, ...STACK].map((s, i) => (
              <div
                key={`card-${i}`}
                className="flex flex-col items-center justify-center gap-3 p-4 w-28 h-28 rounded-[6px] border shrink-0 tech-card"
                style={{
                  borderColor: "var(--border-surface)",
                  background: "rgba(var(--bg-crust-rgb),0.6)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span className="shrink-0 drop-shadow-sm">{s.logo}</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="font-mono font-bold text-[10px] text-text-text text-center leading-tight">{s.name}</span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-text-muted text-center">{s.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keyframe + hover-pause styles */}
        <style>{`
          @keyframes marquee-fwd {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-25%); }
          }
          #stack-marquee-track {
            animation: marquee-fwd 50s linear infinite;
          }
          #stack-marquee-wrapper:hover #stack-marquee-track {
            animation-play-state: paused;
          }
          .tech-card {
            transition: all 180ms ease-in-out;
            cursor: pointer;
            position: relative;
          }
          .tech-card:hover {
            transform: scale(1.06);
            border-color: var(--primary-blue) !important;
            background: rgba(var(--bg-crust-rgb), 0.85) !important;
            box-shadow: 0 0 24px rgba(59, 130, 246, 0.3) !important;
            z-index: 10;
            transition: all 120ms ease-out;
          }
        `}</style>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="relative px-4 md:px-10 py-20 md:py-32 flex flex-col items-center text-center gap-6" id="cta">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0"
          style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.08) 0%, transparent 70%)" }} />
        <div className="relative z-10 flex flex-col items-center gap-5 max-w-xl">
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight" style={{ color: "var(--text-text)" }}>
            Ready to check flood risk?
          </h2>
          <p className="text-sm font-light" style={{ color: "var(--text-subtext)" }}>
            Open the live dashboard to view real-time ML predictions for Naga City powered by the latest Open-Meteo forecast data.
          </p>
          <Link
            href="/dashboard"
            id="cta-open-dashboard"
            className="px-8 py-3.5 rounded-[4px] text-sm font-bold uppercase tracking-wider transition-all hover:opacity-90 active:scale-95"
            style={{ background: "var(--primary-blue)", color: "#fff", boxShadow: "0 0 32px rgba(59,130,246,0.3)" }}
          >
            Open Dashboard →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <div className="w-full mt-auto bg-bg-crust pb-6 md:pb-0">
        <Footer />
      </div>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 right-6 z-50 flex items-center justify-center cursor-pointer transition-all duration-300 ${showScrollTop ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          }`}
        title="Scroll to Top"
      >
        {/* Outer Hexagon (Acts as Border) */}
        <div className="bg-border-surface [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[34px] h-[38px] flex items-center justify-center hover:bg-primary-blue transition-colors shadow-2xl">
          {/* Inner Hexagon (Fill) */}
          <div className="bg-bg-mantle [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[32px] h-[36px] flex items-center justify-center text-text-muted hover:text-text-text transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
        </div>
      </button>
    </div>
  );
}
