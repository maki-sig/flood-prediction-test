"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import Footer from "../../components/Footer";
import ThemeToggle from "../../components/ThemeToggle";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { createShelterEntry, fetchShelterPins, updateShelterEntry, deleteShelterEntry } from "../../lib/evac-actions";
import type { ShelterPin } from "../../lib/evac-actions";

const FloodMap = dynamic(() => import("../components/FloodMap"), {
  ssr: false,
});

interface HourlyData {
  time: string;
  hour: number;
  rain_intensity_1h: number;
  rain_accum_6h: number;
  rain_accum_24h: number;
  probability: number;
}

interface DailyPredictionBlock {
  date: string;
  summary: {
    risk_level: string;
    peak_probability: number;
    peak_hour: number;
    average_probability: number;
    total_precipitation: number;
  };
  hourly: HourlyData[];
}

interface PredictionResponse {
  location: {
    latitude: number;
    longitude: number;
    elevation: number;
    timezone: string;
    timezone_abbreviation: string;
  };
  last_updated?: string;
  days: {
    today: DailyPredictionBlock;
    tomorrow: DailyPredictionBlock;
    dayAfterTomorrow: DailyPredictionBlock;
  };
}

const NAGA_LAT = "13.6192";
const NAGA_LON = "123.1814";

const getProbabilityCategory = (p: number, theme: 'dark' | 'light') => {
  const pct = p * 100;
  if (pct < 1.0) {
    return {
      label: "Safe",
      heroLabel: "No Flood Risk",
      colorClass: "text-safe-text border-safe-border bg-safe-bg",
      textColor: "text-safe-text",
      hex: theme === "dark" ? "#a7f3d0" : "#059669"
    };
  } else if (pct < 10.0) {
    return {
      label: "Low",
      heroLabel: "Low Flood Risk",
      colorClass: "text-primary-blue border-primary-blue-border bg-primary-blue-bg",
      textColor: "text-primary-blue",
      hex: theme === "dark" ? "#bae6fd" : "#0284c7"
    };
  } else if (pct < 35.0) {
    return {
      label: "Moderate",
      heroLabel: "Moderate Flood Risk",
      colorClass: "text-semantic-yellow border-semantic-yellow-border bg-semantic-yellow-bg",
      textColor: "text-semantic-yellow",
      hex: theme === "dark" ? "#fde68a" : "#d97706"
    };
  } else {
    return {
      label: "High",
      heroLabel: "High Flood Risk",
      colorClass: "text-semantic-red border-semantic-red-border bg-semantic-red-bg",
      textColor: "text-semantic-red",
      hex: theme === "dark" ? "#fecdd3" : "#e11d48"
    };
  }
};

const EVAC_SECTIONS = [
  { id: "overview", label: "Overview & Map" },
];

export default function ManageEvacPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pinnedPosition, setPinnedPosition] = useState<[number, number] | null>(null);
  const [showShelterForm, setShowShelterForm] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  // Form field state
  const [shelterName, setShelterName] = useState("");
  const [zoneNum, setZoneNum] = useState("");
  const [barangay, setBarangay] = useState("");
  const [shelterType, setShelterType] = useState("Volunteering Household");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [currCapacity, setCurrCapacity] = useState("");
  const [fname, setFname] = useState("");
  const [mname, setMname] = useState("");
  const [lname, setLname] = useState("");
  const [contactNum, setContactNum] = useState("");
  const [socmedUrl, setSocmedUrl] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [shelterPins, setShelterPins] = useState<ShelterPin[]>([]);
  // Selected shelter info panel state
  const [selectedShelterPin, setSelectedShelterPin] = useState<ShelterPin | null>(null);
  const [showShelterInfo, setShowShelterInfo] = useState(false);
  const [shelterInfoVisible, setShelterInfoVisible] = useState(false);
  const [riskOverviewVisible, setRiskOverviewVisible] = useState(false);
  const [updatingShelterId, setUpdatingShelterId] = useState<number | null>(null);
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'tomorrow' | 'dayAfterTomorrow'>('tomorrow');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [appliedTheme, setAppliedTheme] = useState<'dark' | 'light'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  // Custom modal states for deleting shelters
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteErrorMsg, setDeleteErrorMsg] = useState<string | null>(null);

  // Protect route client-side: verify active session with Supabase
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login");
        } else {
          setAuthLoading(false);
        }
      } catch {
        router.push("/login");
      }
    };
    checkUser();

    // Listen for authentication changes (e.g. logouts or expiry)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // Lock scrolling when custom modals are shown
  useEffect(() => {
    if (showDeleteModal || deleteErrorMsg) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [showDeleteModal, deleteErrorMsg]);

  // Clear pinned position when leaving edit mode and form mode is not active
  useEffect(() => {
    if (!isEditMode && !showShelterForm) {
      setPinnedPosition(null);
    }
  }, [isEditMode, showShelterForm]);

  // Fetch saved shelter pins on mount
  useEffect(() => {
    fetchShelterPins().then(setShelterPins);
  }, []);

  // Trigger form entrance animation when form mounts
  useEffect(() => {
    if (showShelterForm) {
      requestAnimationFrame(() => setFormVisible(true));
    }
  }, [showShelterForm]);

  // Trigger info panel entrance animation when it mounts
  useEffect(() => {
    if (showShelterInfo) {
      requestAnimationFrame(() => setShelterInfoVisible(true));
    }
  }, [showShelterInfo, selectedShelterPin?.loc_id]);

  // Trigger Risk Overview slide-in entrance animation
  useEffect(() => {
    if (!showShelterInfo && !showShelterForm) {
      requestAnimationFrame(() => setRiskOverviewVisible(true));
    } else {
      setRiskOverviewVisible(false);
    }
  }, [showShelterInfo, showShelterForm]);

  // Animated close: fade out first, then unmount
  const closeForm = () => {
    setFormVisible(false);
    setTimeout(() => {
      setShowShelterForm(false);
      setPinnedPosition(null);
      // Reset all form fields
      setShelterName(""); setZoneNum(""); setBarangay("");
      setShelterType("Volunteering Household"); setMaxCapacity(""); setCurrCapacity("");
      setFname(""); setMname(""); setLname(""); setContactNum(""); setSocmedUrl("");
      setSubmitError(null); setSubmitSuccess(false);
      setUpdatingShelterId(null);
      setErrors({});
    }, 300);
  };

  // Animated close for shelter info panel
  const closeShelterInfo = () => {
    setShelterInfoVisible(false);
    setTimeout(() => {
      setShowShelterInfo(false);
      setSelectedShelterPin(null);
    }, 300);
  };

  // Open shelter info panel from a pin click
  const openShelterInfo = (pin: ShelterPin) => {
    // If this shelter is already open, do nothing to prevent it from fading out/vanishing
    if (selectedShelterPin?.shelter_id === pin.shelter_id && showShelterInfo) {
      setShelterInfoVisible(true);
      return;
    }
    // Close form if open
    if (showShelterForm) closeForm();
    setShelterInfoVisible(false);
    setSelectedShelterPin(pin);
    setShowShelterInfo(true);
  };

  // Pre-populates the form with existing shelter details and opens the form view
  const startUpdateFlow = () => {
    if (!selectedShelterPin) return;
    const s = selectedShelterPin.shelter;
    const sh = s?.shelter_head;

    setShelterName(s?.shelter_name ?? "");
    setZoneNum(s?.zone_num?.toString() ?? "");
    setBarangay(s?.barangay_name ?? "");
    setShelterType(s?.type ?? "Volunteering Household");
    setMaxCapacity(s?.max_capacity?.toString() ?? "");
    setCurrCapacity(s?.curr_capacity?.toString() ?? "");
    setFname(sh?.fname ?? "");
    setMname(sh?.mname ?? "");
    setLname(sh?.lname ?? "");
    setContactNum(sh?.contact_num ?? "");
    setSocmedUrl(sh?.socmed_url ?? "");
    setPinnedPosition([selectedShelterPin.latitude, selectedShelterPin.longitude]);

    setUpdatingShelterId(selectedShelterPin.shelter_id);

    // Transition: Fade out info panel, then open form
    setShelterInfoVisible(false);
    setTimeout(() => {
      setShowShelterInfo(false);
      setShowShelterForm(true);
    }, 300);
  };

  // Trigger delete modal visibility
  const handleDeleteShelter = () => {
    setShowDeleteModal(true);
  };

  // Perform delete after confirmation inside modal
  const confirmDeleteShelter = async () => {
    if (!selectedShelterPin) return;
    setShowDeleteModal(false);
    setIsSubmitting(true);
    const result = await deleteShelterEntry(selectedShelterPin.shelter_id);
    setIsSubmitting(false);

    if (result.success) {
      closeShelterInfo();
      fetchShelterPins().then(setShelterPins);
    } else {
      setDeleteErrorMsg(result.error);
    }
  };

  // Submit handler — supports both insert and update
  const handleShelterSubmit = async () => {
    if (!pinnedPosition) {
      setSubmitError("Please select a location on the map by placing a pin.");
      return;
    }

    const newErrors: Record<string, string> = {};

    // 1. Shelter Name
    const sName = shelterName.trim();
    const shelterNameRegex = /^[a-zA-Z0-9\s.,\-'\(\)]+$/;
    if (!sName) {
      newErrors.shelterName = "Shelter Name is required.";
    } else if (sName.length < 3) {
      newErrors.shelterName = "Shelter Name must be at least 3 characters.";
    } else if (sName.length > 100) {
      newErrors.shelterName = "Shelter Name cannot exceed 100 characters.";
    } else if (!shelterNameRegex.test(sName)) {
      newErrors.shelterName = "Shelter Name must contain only letters, numbers, spaces, dots, commas, hyphens, single quotes, or parentheses.";
    }

    // 2. Zone / Phase
    const zNum = zoneNum.trim();
    if (!zNum) {
      newErrors.zoneNum = "Zone / Phase is required.";
    } else {
      const zoneVal = parseInt(zNum, 10);
      if (isNaN(zoneVal) || zoneVal <= 0 || zoneVal > 999) {
        newErrors.zoneNum = "Zone / Phase must be a valid number between 1 and 999.";
      }
    }

    // 3. Barangay
    const bName = barangay.trim();
    const barangayRegex = /^[a-zA-Z0-9\s.\-']+$/;
    if (!bName) {
      newErrors.barangay = "Barangay is required.";
    } else if (bName.length < 3) {
      newErrors.barangay = "Barangay must be at least 3 characters.";
    } else if (bName.length > 50) {
      newErrors.barangay = "Barangay cannot exceed 50 characters.";
    } else if (!barangayRegex.test(bName)) {
      newErrors.barangay = "Barangay must contain only letters, numbers, spaces, dots, hyphens, or single quotes.";
    }

    // 4. Max Capacity
    const maxCap = maxCapacity.trim();
    if (!maxCap) {
      newErrors.maxCapacity = "Max Capacity is required.";
    } else {
      const maxCapVal = parseInt(maxCap, 10);
      if (isNaN(maxCapVal) || maxCapVal <= 0 || maxCapVal > 99999) {
        newErrors.maxCapacity = "Max Capacity must be between 1 and 99,999.";
      }
    }

    // 5. Current Capacity
    const currCap = currCapacity.trim();
    const currCapVal = currCap ? parseInt(currCap, 10) : 0;
    if (currCap) {
      if (isNaN(currCapVal) || currCapVal < 0 || currCapVal > 99999) {
        newErrors.currCapacity = "Current Capacity must be between 0 and 99,999.";
      }
    }

    // Capacity Logic: Current <= Max
    if (!newErrors.maxCapacity && !newErrors.currCapacity && maxCap) {
      const maxCapVal = parseInt(maxCap, 10);
      if (currCapVal > maxCapVal) {
        newErrors.currCapacity = "Current occupants cannot exceed maximum capacity.";
      }
    }

    // 6. Point Person First Name
    const firstName = fname.trim();
    const nameRegex = /^[a-zA-Z\s.\-]+$/;
    if (!firstName) {
      newErrors.fname = "First Name is required.";
    } else if (firstName.length < 2) {
      newErrors.fname = "First Name must be at least 2 characters.";
    } else if (firstName.length > 50) {
      newErrors.fname = "First Name cannot exceed 50 characters.";
    } else if (!nameRegex.test(firstName)) {
      newErrors.fname = "First Name must contain only letters, spaces, dots, or hyphens.";
    }

    // 7. Point Person Middle Name (Optional)
    const middleName = mname.trim();
    if (middleName) {
      if (middleName.length > 50) {
        newErrors.mname = "Middle Name cannot exceed 50 characters.";
      } else if (!nameRegex.test(middleName)) {
        newErrors.mname = "Middle Name must contain only letters, spaces, dots, or hyphens.";
      }
    }

    // 8. Point Person Last Name
    const lastName = lname.trim();
    if (!lastName) {
      newErrors.lname = "Last Name is required.";
    } else if (lastName.length < 2) {
      newErrors.lname = "Last Name must be at least 2 characters.";
    } else if (lastName.length > 50) {
      newErrors.lname = "Last Name cannot exceed 50 characters.";
    } else if (!nameRegex.test(lastName)) {
      newErrors.lname = "Last Name must contain only letters, spaces, dots, or hyphens.";
    }

    // 9. Contact Number
    const contact = contactNum.trim();
    const phoneRegex = /^09\d{9}$/;
    if (!contact) {
      newErrors.contactNum = "Contact Number is required.";
    } else if (contact.length !== 11) {
      newErrors.contactNum = "Contact Number must be 11 characters.";
    } else if (!phoneRegex.test(contact)) {
      newErrors.contactNum = "Contact Number must start with 09 (e.g. 09123456789).";
    }

    // 10. Social Media URL (Optional)
    const socmed = socmedUrl.trim();
    if (socmed) {
      if (socmed.length > 200) {
        newErrors.socmedUrl = "Social Media URL cannot exceed 200 characters.";
      } else {
        try {
          new URL(socmed);
        } catch (e) {
          newErrors.socmedUrl = "Please enter a valid Social Media URL (including http:// or https://).";
        }
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSubmitError("Fix some error inputs before saving.");
      return;
    }

    setErrors({});
    setIsSubmitting(true);
    setSubmitError(null);

    const payload = {
      shelterName: sName,
      zoneNum: zNum,
      barangay: bName,
      type: shelterType,
      maxCapacity: maxCap,
      currCapacity: currCap,
      fname: firstName,
      mname: middleName,
      lname: lastName,
      contactNum: contact,
      socmedUrl: socmed,
      latitude: pinnedPosition[0],
      longitude: pinnedPosition[1],
    };

    let result;
    if (updatingShelterId) {
      result = await updateShelterEntry(updatingShelterId, payload);
    } else {
      result = await createShelterEntry(payload);
    }

    setIsSubmitting(false);
    if (result.success) {
      setSubmitSuccess(true);
      fetchShelterPins().then(setShelterPins);
      setTimeout(() => closeForm(), 1500);
    } else {
      setSubmitError(result.error);
    }
  };


  const [activeDashboardSection, setActiveDashboardSection] = useState("overview");
  const isProgrammaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToDashboardSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveDashboardSection(id);
    isProgrammaticScroll.current = true;
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current);
    programmaticScrollTimer.current = setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 900);
    const subNav = document.getElementById("sub-nav");
    const isMobile = window.innerWidth < 768;
    const offset = isMobile ? 12 : (subNav ? subNav.getBoundingClientRect().height : 48);
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
    window.scrollTo({ top, behavior: "smooth" });
  };

  useEffect(() => {
    const sectionIds = ["overview"];
    const detect = () => {
      if (isProgrammaticScroll.current) return;
      const subNav = document.getElementById("sub-nav");
      const isMobile = window.innerWidth < 768;
      const offset = isMobile ? 12 : (subNav ? subNav.getBoundingClientRect().height : 48);
      const detectionY = offset + 24;
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= detectionY) {
          current = id;
        }
      }
      setActiveDashboardSection(current);
    };
    window.addEventListener("scroll", detect, { passive: true });
    detect();
    return () => window.removeEventListener("scroll", detect);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => {
      setAppliedTheme(el.classList.contains('dark') ? 'dark' : 'light');
    });
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const activeData = useMemo(() => {
    if (!data) return null;
    return data.days[selectedPeriod];
  }, [data, selectedPeriod]);

  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(12);

  const [timeUntilNextHour, setTimeUntilNextHour] = useState<string>("59:59");
  const [phTime, setPhTime] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchPrediction = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/predict?latitude=${NAGA_LAT}&longitude=${NAGA_LON}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Server returned error ${res.status}`);
      const json: PredictionResponse = await res.json();
      if ("error" in json) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((json as any).error);
      }
      setData(json);
      setSelectedHourIdx(json.days[selectedPeriod].summary.peak_hour);
      if (json.last_updated) {
        const dateObj = new Date(json.last_updated);
        const formatted =
          dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
          ", " +
          dateObj.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) +
          " PST";
        setLastUpdated(formatted);
      } else {
        setLastUpdated("N/A");
      }
    } catch {
      // Fail silently
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchPrediction(); }, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const nextHour = new Date();
      nextHour.setHours(now.getHours() + 1, 0, 0, 0);
      const diffMs = nextHour.getTime() - now.getTime();
      const minutes = Math.floor(diffMs / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);
      const formatNum = (n: number) => n.toString().padStart(2, "0");
      setTimeUntilNextHour(`${formatNum(minutes)}:${formatNum(seconds)}`);
      if (minutes === 0 && seconds === 0) setTimeout(() => fetchPrediction(), 1000);
    };
    calculateCountdown();
    const interval = setInterval(calculateCountdown, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      try {
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: "Asia/Manila",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        });
        setPhTime(formatter.format(new Date()));
      } catch (e) {
        console.error("Failed to format time:", e);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const selectedHourDetails = useMemo(() => {
    if (!activeData || !activeData.hourly || activeData.hourly.length === 0) return null;
    return activeData.hourly.find((h) => h.hour === selectedHourIdx) || activeData.hourly[12];
  }, [activeData, selectedHourIdx]);

  const formatHour = (h: number) => {
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${hour}:00 ${ampm}`;
  };

  const summaryCategory = useMemo(() => {
    if (!activeData) return null;
    const currentTheme = typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
    return getProbabilityCategory(activeData.summary.peak_probability / 100, currentTheme);
  }, [activeData]);

  const errBorder = (field: string) => {
    if (!errors[field]) return "border-border-surface focus:border-primary-blue";
    return appliedTheme === "dark"
      ? "border-[#f38ba8] focus:border-[#f38ba8]"
      : "border-[#d20f39] focus:border-[#d20f39]";
  };

  const errTextClass = appliedTheme === "dark" ? "text-[#f38ba8]" : "text-[#d20f39]";

  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col items-center justify-center antialiased flows-root relative">
        <div className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none">
          <div className="aurora-layer aurora-mask" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="text-xl font-extrabold tracking-widest uppercase bg-gradient-to-r from-text-text to-text-subtext text-transparent bg-clip-text animate-pulse">
            FLOWS
          </div>
          <div className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5 text-primary-blue" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-xs font-mono text-text-muted uppercase tracking-wider animate-pulse">Verifying Session...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base text-text-text font-sans flex flex-col antialiased selection:bg-primary-blue-bg selection:text-primary-blue flows-root relative">
      <style>{`
        .flows-sidebar-custom {
          transition: all 0.5s ease-in-out !important;
        }
        .sidebar-panel {
          transition: opacity 0.3s ease, transform 0.3s ease;
        }
        .sidebar-panel-hidden {
          opacity: 0;
          transform: translateX(-12px);
          pointer-events: none;
        }
        .sidebar-panel-visible {
          opacity: 1;
          transform: translateX(0);
        }
        @media (min-width: 768px) {
          .flows-sidebar-custom {
            margin-left: ${isEditMode ? "-420px" : "0px"} !important;
            opacity: ${isEditMode ? "0" : "1"} !important;
            width: 420px !important;
            min-width: 420px !important;
          }
        }
        @media (max-width: 767px) {
          .flows-sidebar-custom {
            max-height: ${isEditMode ? "0px" : "2000px"} !important;
            opacity: ${isEditMode ? "0" : "1"} !important;
            padding: ${isEditMode ? "0px" : "20px"} !important;
            overflow: hidden !important;
          }
        }
      `}</style>


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

        {/* Live System Indicators & Theme Toggle */}
        <div className="flex items-center gap-2 md:gap-3 font-mono text-[9px] text-text-subtext">
          <div className="flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator">
            <span className="text-text-subtext font-bold uppercase tracking-wider">NEXT UPDATE IN:</span>
            <span className="text-text-text font-bold tracking-wider">{timeUntilNextHour}</span>
          </div>

          <div className="hidden sm:flex items-center justify-center gap-1.5 h-7 px-2.5 border border-border-surface bg-bg-crust/50 rounded-[4px] flows-indicator font-mono">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://flagsapi.com/PH/flat/64.png"
              alt="Philippines Flag"
              className="w-3 h-3 object-contain select-none"
            />
            <span className="text-text-muted font-bold uppercase tracking-wider">PST:</span>
            <span className="text-text-text font-bold tracking-wider">{phTime || "12:00:00 AM"}</span>
          </div>

          <ThemeToggle />

          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
            title="Sign Out"
            className="h-7 px-2.5 flex items-center justify-center border border-border-surface bg-bg-crust/50 text-text-muted hover:text-semantic-red hover:border-semantic-red/40 rounded-[4px] cursor-pointer transition-colors duration-200 uppercase tracking-widest font-mono text-[8px] font-bold"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex flex-col w-full z-10">

        {/* SECTION: Docked Split Viewport — Sidebar Analytics (Left) + Map (Right) */}
        <section id="overview" className="relative w-full h-auto md:h-[calc(100vh-50px)] md:min-h-[550px] border-b border-border-surface flex flex-col md:flex-row overflow-hidden bg-bg-base z-10">
          {/* DOCKED SIDEBAR PANEL */}
          <aside className="shrink-0 h-auto md:h-full border-b md:border-b-0 md:border-r border-border-surface bg-bg-mantle p-5 flex flex-col justify-between overflow-y-auto select-none font-sans z-20 flows-sidebar flows-sidebar-custom">
            {showShelterForm ? (
              <div
                key="shelter-form"
                className={`flex flex-col gap-4 h-full sidebar-panel ${formVisible ? "sidebar-panel-visible" : "sidebar-panel-hidden"}`}
              >

                {/* Form Header */}
                <div className="flex justify-between items-center border-b border-border-surface pb-2.5 shrink-0">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {updatingShelterId ? "Update Shelter Details - Naga City" : "New Shelter Details - Naga City"}
                  </h2>
                  <button
                    onClick={closeForm}
                    className="text-[9px] font-mono uppercase tracking-widest text-[#f38ba8] hover:text-[#f38ba8]/80 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {/* Form Fields (Scrollable area) */}
                <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-5 select-text">
                  {/* SECTION 1: SHELTER DETAILS */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-text-muted border-b border-border-surface/40 pb-1 mb-1">
                      Shelter Information
                    </span>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-text-subtext uppercase">Shelter Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Naga City Sports Complex"
                        value={shelterName}
                        onChange={(e) => setShelterName(e.target.value)}
                        maxLength={100}
                        className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("shelterName")}`}
                      />
                      {errors.shelterName && (
                        <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.shelterName}</span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">Zone / Phase Number</label>
                        <input
                          type="text"
                          placeholder="e.g. 1"
                          value={zoneNum}
                          onChange={(e) => setZoneNum(e.target.value.replace(/\D/g, ""))}
                          maxLength={5}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("zoneNum")}`}
                        />
                        {errors.zoneNum && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.zoneNum}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">Barangay</label>
                        <input
                          type="text"
                          placeholder="e.g. Concepcion Grande"
                          value={barangay}
                          onChange={(e) => setBarangay(e.target.value)}
                          maxLength={50}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("barangay")}`}
                        />
                        {errors.barangay && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.barangay}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-text-subtext uppercase">Type</label>
                      <select
                        value={shelterType}
                        onChange={(e) => setShelterType(e.target.value)}
                        className="bg-bg-crust border border-border-surface rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text focus:outline-none focus:border-primary-blue cursor-pointer"
                      >
                        <option value="Volunteering Household">Volunteering Household</option>
                        <option value="Evacuation Center">Evacuation Center</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">Max Capacity</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="e.g. 200"
                          value={maxCapacity}
                          onChange={(e) => setMaxCapacity(e.target.value)}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] font-mono text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("maxCapacity")}`}
                        />
                        {errors.maxCapacity && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.maxCapacity}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">Current Capacity</label>
                        <input
                          type="number"
                          min={0}
                          placeholder="e.g. 0"
                          value={currCapacity}
                          onChange={(e) => setCurrCapacity(e.target.value)}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] font-mono text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("currCapacity")}`}
                        />
                        {errors.currCapacity && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.currCapacity}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* SECTION 2: SHELTER HEAD */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[9px] font-mono font-bold tracking-wider uppercase text-text-muted border-b border-border-surface/40 pb-1 mb-1">
                      Point Person Details
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">First Name</label>
                        <input
                          type="text"
                          placeholder="First Name"
                          value={fname}
                          onChange={(e) => setFname(e.target.value)}
                          maxLength={50}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("fname")}`}
                        />
                        {errors.fname && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.fname}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-text-subtext uppercase">Middle Name</label>
                        <input
                          type="text"
                          placeholder="Middle Name"
                          value={mname}
                          onChange={(e) => setMname(e.target.value)}
                          maxLength={50}
                          className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("mname")}`}
                        />
                        {errors.mname && (
                          <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.mname}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-text-subtext uppercase">Last Name</label>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={lname}
                        onChange={(e) => setLname(e.target.value)}
                        maxLength={50}
                        className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("lname")}`}
                      />
                      {errors.lname && (
                        <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.lname}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-text-subtext uppercase">Contact Number</label>
                      <input
                        type="text"
                        placeholder="e.g. 09123456789"
                        value={contactNum}
                        onChange={(e) => setContactNum(e.target.value.replace(/\D/g, ""))}
                        maxLength={11}
                        className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("contactNum")}`}
                      />
                      {errors.contactNum && (
                        <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.contactNum}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-text-subtext uppercase">Social Media URL</label>
                      <input
                        type="url"
                        placeholder="e.g. https://facebook.com/username"
                        value={socmedUrl}
                        onChange={(e) => setSocmedUrl(e.target.value)}
                        maxLength={200}
                        className={`bg-bg-crust border rounded-[4px] px-2.5 py-1.5 text-[11px] text-text-text placeholder:text-text-muted focus:outline-none ${errBorder("socmedUrl")}`}
                      />
                      {errors.socmedUrl && (
                        <span className={`text-[8px] font-mono mt-0.5 ${errTextClass}`}>{errors.socmedUrl}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Form Footer */}
                <div className="border-t border-border-surface pt-4 shrink-0 flex flex-col gap-2">
                  {submitError && (
                    <p className={`text-[9px] font-mono rounded-[4px] px-2.5 py-1.5 leading-relaxed border ${
                      appliedTheme === 'dark'
                        ? 'text-[#f38ba8] bg-[#f38ba8]/10 border-[#f38ba8]/20'
                        : 'text-[#d20f39] bg-[#d20f39]/10 border-[#d20f39]/20'
                    }`}>
                      ⚠ {submitError}
                    </p>
                  )}
                  {submitSuccess && (
                    <p className="text-[9px] font-mono text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-[4px] px-2.5 py-1.5">
                      ✓ Shelter saved successfully!
                    </p>
                  )}
                  <button
                    onClick={handleShelterSubmit}
                    disabled={isSubmitting || submitSuccess}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-blue hover:bg-primary-blue/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[10px] font-mono font-bold uppercase tracking-widest rounded-[4px] transition-all duration-150 shadow-[0_0_16px_rgba(59,130,246,0.2)] cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : submitSuccess ? (
                      "✓ Saved!"
                    ) : (
                      updatingShelterId ? "Update Shelter Details" : "Save Shelter Details"
                    )}
                  </button>
                </div>
              </div>
            ) : showShelterInfo && selectedShelterPin ? (() => {
              const s = selectedShelterPin.shelter;
              const sh = s?.shelter_head;
              const pct = s ? Math.round((s.curr_capacity / Math.max(s.max_capacity, 1)) * 100) : 0;
              const isEvacCenter = s?.type === "Evacuation Center";

              // Dynamic status colors based on occupancy level (no shadows)
              let capacityColor = "bg-emerald-500";
              let capacityTextColor = "text-emerald-400";
              let capacityBorderColor = "border-emerald-500/20";
              let capacityBgClass = "bg-emerald-500/10";

              if (pct >= 90) {
                capacityColor = "bg-rose-500";
                capacityTextColor = "text-rose-400";
                capacityBorderColor = "border-rose-500/20";
                capacityBgClass = "bg-rose-500/10";
              } else if (pct >= 60) {
                capacityColor = "bg-amber-500";
                capacityTextColor = "text-amber-400";
                capacityBorderColor = "border-amber-500/20";
                capacityBgClass = "bg-amber-500/10";
              }

              // Get point person initials
              const initials = sh
                ? [sh.fname?.[0], sh.lname?.[0]].filter(Boolean).join("").toUpperCase()
                : "PP";

              return (
                 <div
                   key={`shelter-info-${selectedShelterPin.loc_id}`}
                   className={`flex flex-col justify-between h-full sidebar-panel ${shelterInfoVisible ? "sidebar-panel-visible" : "sidebar-panel-hidden"}`}
                 >
                  <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b border-border-surface pb-2.5 shrink-0">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Shelter Information
                      </h2>
                      <button
                        onClick={closeShelterInfo}
                        className="text-[9px] font-mono uppercase tracking-widest text-[#f38ba8] hover:text-[#f38ba8]/80 cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                    </div>

                    {/* Content Section */}
                    <div className="flex flex-col gap-3">
                      
                      {/* Section 1: Shelter Name, Type, Address, and Coordinates */}
                      <div className="border border-border-surface/85 bg-bg-crust/35 rounded-[4px] p-3.5 flex justify-between items-end gap-3">
                        <div className="flex flex-col gap-3 min-w-0">
                          <div className="text-sm font-extrabold text-text-text leading-snug tracking-tight truncate" title={s?.shelter_name ?? ""}>
                            {s?.shelter_name ?? "Unnamed Facility"}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-mono text-text-subtext">
                              {s?.barangay_name ? `Brgy. ${s.barangay_name}, Zone ${s.zone_num ?? "—"}` : "—"}
                            </span>
                            <span className="text-[8.5px] font-mono text-text-muted">
                              {selectedShelterPin.latitude.toFixed(5)}°, {selectedShelterPin.longitude.toFixed(5)}°
                            </span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] text-[7.5px] font-mono font-bold uppercase tracking-wider border shrink-0 ${isEvacCenter
                          ? "bg-primary-blue-bg text-primary-blue border-primary-blue-border"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}>
                          {s?.type ?? "Unknown"}
                        </span>
                      </div>

                      {/* Section 2: Occupancy Dashboard (styled like overall assessment cards) */}
                      <div className="bg-bg-crust/20 rounded-[4px] p-4 border border-border-surface/40 flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2 text-center font-mono">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Occupants</span>
                            <span className="text-base font-extrabold text-text-text">{s?.curr_capacity ?? 0}</span>
                            <span className="text-[7px] font-sans font-light text-text-muted">Current Load</span>
                          </div>
                          <div className="flex flex-col gap-0.5 border-l border-border-surface/40">
                            <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Max Load</span>
                            <span className="text-base font-extrabold text-text-subtext">{s?.max_capacity ?? 0}</span>
                            <span className="text-[7px] font-sans font-light text-text-muted">Limit</span>
                          </div>
                        </div>

                        <div className="space-y-1.5 pt-2 border-t border-border-surface/20">
                          <div className="h-1.5 bg-bg-base rounded-full overflow-hidden border border-border-surface/30">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${capacityColor}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[9px] font-mono">
                            <span className="text-text-muted">CAPACITY LOAD</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-[2px] font-bold border ${capacityTextColor} ${capacityBorderColor} ${capacityBgClass}`}>
                              {pct}% {pct >= 90 ? "FULL" : pct >= 60 ? "HIGH" : "AVAILABLE"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Point Person details */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-mono tracking-widest uppercase text-text-muted px-1">
                          Point Person
                        </span>
                        {sh ? (
                          <div className="bg-bg-crust/20 border border-border-surface/40 rounded-[4px] p-3.5 flex flex-col gap-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[8px] font-mono text-text-muted uppercase">Full Name</span>
                              <span className="text-[11px] font-bold text-text-text">
                                {[sh.fname, sh.mname, sh.lname].filter(Boolean).join(" ")}
                              </span>
                            </div>
                            
                            <div className="flex gap-4 pt-2 border-t border-border-surface/20 font-mono text-[9px]">
                              {sh.contact_num && (
                                <a
                                  href={`tel:${sh.contact_num}`}
                                  className="text-text-subtext hover:text-primary-blue flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <svg className="w-3 h-3 text-primary-blue shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  <span>{sh.contact_num}</span>
                                </a>
                              )}
                              {sh.socmed_url && (
                                <a
                                  href={sh.socmed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-subtext hover:text-primary-blue truncate flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <svg className="w-3 h-3 text-primary-blue shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                  </svg>
                                  <span>Profile</span>
                                </a>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] font-mono text-text-muted italic px-1">No point person on record</span>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* Action Buttons — pinned to sidebar bottom */}
                  <div className="shrink-0 pt-4 mt-2 border-t border-border-surface flex gap-2">
                    <button
                      onClick={startUpdateFlow}
                      disabled={isSubmitting}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-blue hover:bg-primary-blue/90 active:scale-[0.98] text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-[4px] transition-all duration-150 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      Update Info
                    </button>
                    <button
                      onClick={handleDeleteShelter}
                      disabled={isSubmitting}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-bg-crust border border-border-surface hover:bg-[#f38ba8]/10 hover:border-[#f38ba8]/30 hover:text-[#f38ba8] active:scale-[0.98] text-text-subtext text-[10px] font-mono font-bold uppercase tracking-wider rounded-[4px] transition-all duration-150 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5 shrink-0 text-[#f38ba8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })() : (
              <div
                key="risk-overview"
                className={`flex flex-col justify-between h-full sidebar-panel animate-in fade-in duration-500 ${riskOverviewVisible ? "sidebar-panel-visible" : "sidebar-panel-hidden"}`}
              >
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-border-surface pb-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-text-subtext flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-primary-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                      Risk Overview
                    </h2>
                    <span className="font-mono text-[9px] text-text-muted uppercase tracking-widest">NAGA CITY</span>
                  </div>

                  {activeData && summaryCategory ? (
                    <div className="flex flex-col gap-3">

                      {/* Timeframe selector tabs */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[8px] font-mono tracking-widest uppercase text-text-muted">
                          Forecast Period
                        </span>
                        <div className="grid grid-cols-3 gap-0.5 bg-bg-crust/40 border border-border-surface/35 p-0.5 rounded-[4px]">
                          {(["today", "tomorrow", "dayAfterTomorrow"] as const).map((period) => {
                            const dateVal = data?.days[period]?.date || "";
                            const formattedDate = dateVal
                              ? new Date(dateVal).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                              : "";
                            return (
                              <button
                                key={period}
                                onClick={() => setSelectedPeriod(period)}
                                className={`py-1.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-[2px] transition-all flex flex-col items-center justify-center cursor-pointer ${selectedPeriod === period
                                  ? "bg-primary-blue text-white"
                                  : "text-text-subtext hover:bg-border-surface/30 hover:text-text-text"
                                  }`}
                              >
                                <span className="leading-none">{period === "dayAfterTomorrow" ? "3RD DAY" : period}</span>
                                <span className={`text-[7px] leading-none mt-0.5 font-light ${selectedPeriod === period ? "text-white/80" : "text-text-muted"}`}>
                                  {formattedDate}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Hero Risk Classification */}
                      <div className={`rounded-[4px] border p-4 flex items-center justify-between gap-3 ${summaryCategory.colorClass}`}>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[8px] font-mono font-bold uppercase tracking-widest opacity-70">Overall Assessment</span>
                          <span className="text-xl font-extrabold font-mono tracking-tight leading-none">{summaryCategory.heroLabel}</span>
                          <span className="text-[10px] font-light opacity-75 mt-0.5">
                            Peak: {activeData.summary.peak_probability.toFixed(2)}% at {formatHour(activeData.summary.peak_hour)}
                          </span>
                        </div>
                        {(summaryCategory.label === "Safe" || summaryCategory.label === "Low") ? (
                          <svg className="w-8 h-8 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="w-8 h-8 opacity-50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                        )}
                      </div>

                      {/* Core Risk Metrics */}
                      <div className="grid grid-cols-3 gap-1 bg-bg-crust/20 rounded-[4px] p-4 border border-border-surface/40 font-mono text-center">
                        <div className="flex flex-col gap-1">
                          <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Peak Risk</span>
                          <span className={`text-sm md:text-base font-extrabold ${summaryCategory?.textColor || 'text-text-text'}`}>
                            {activeData.summary.peak_probability.toFixed(2)}<span className="text-[9px] text-text-muted font-normal">%</span>
                          </span>
                          <span className="text-[8px] font-sans font-light text-text-muted">Highest Hour</span>
                        </div>

                        <div className="flex flex-col gap-1 border-l border-border-surface/40">
                          <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Rainfall</span>
                          <span className="text-sm md:text-base font-extrabold text-text-text">
                            {activeData.summary.total_precipitation.toFixed(2)}<span className="text-[9px] text-text-muted font-normal"> mm</span>
                          </span>
                          <span className="text-[8px] font-sans font-light text-text-muted">24h Total</span>
                        </div>

                        <div className="flex flex-col gap-1 border-l border-border-surface/40">
                          <span className="text-[8px] font-bold text-text-muted uppercase tracking-wider">Avg Risk</span>
                          <span className="text-sm md:text-base font-extrabold text-text-subtext">
                            {activeData.summary.average_probability.toFixed(2)}<span className="text-[9px] text-text-muted font-normal">%</span>
                          </span>
                          <span className="text-[8px] font-sans font-light text-text-muted">Mean Prob</span>
                        </div>
                      </div>

                      {/* Advisory text */}
                      <div className="border border-border-surface/85 bg-bg-crust/35 rounded-[4px] p-3 select-text">
                        <p className="text-[11px] leading-relaxed text-text-subtext">
                          {activeData.summary.risk_level === "Safe" && (
                            "Conditions are currently clear. Telemetry predicts minimal to zero rainfall with no threat of flooding. Have a safe day!"
                          )}
                          {activeData.summary.risk_level === "Low" && (
                            "Expect light rainfall. While overall flooding is unlikely, some low-lying streets might experience minor water clogging or puddles. Keep an umbrella handy."
                          )}
                          {activeData.summary.risk_level === "Moderate" && (
                            "Noticeable flood risk ahead. Heavy or continuous rainfall is expected. Watch out for localized flooding, avoid clogged drain paths, and consider moving low-level valuables to safety."
                          )}
                          {activeData.summary.risk_level === "High" && (
                            "CRITICAL WARNING: High probability of severe flooding in low-lying areas. Avoid traveling through flooded streets, secure properties, and tune in to local emergency alerts immediately."
                          )}
                        </p>
                      </div>

                      {/* Last Updated */}
                      <div className="flex gap-1.5 items-center text-[9px] text-text-muted/80 px-1">
                        <span>Last Updated:</span>
                        <span className="font-mono text-text-muted font-medium">{lastUpdated || "Syncing..."}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="py-20 flex flex-col items-center justify-center gap-3">
                      {loading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-primary-blue border-t-transparent rounded-full animate-spin" />
                          <span className="text-[10px] font-mono tracking-widest text-primary-blue uppercase">Synchronizing sensor...</span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-mono text-[#f38ba8] uppercase tracking-wider">No active sensor link</span>
                          <button
                            onClick={() => fetchPrediction()}
                            className="px-3 py-1.5 bg-bg-crust border border-border-surface hover:bg-border-surface/40 text-text-text text-[9px] font-mono tracking-widest uppercase rounded-[4px] transition-colors"
                          >
                            Connect Sensor
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Add Evacuation Shelter CTA — pinned to sidebar bottom */}
                <div className="shrink-0 pt-4 mt-2 border-t border-border-surface">
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-blue hover:bg-primary-blue/90 active:scale-[0.98] text-white text-[10px] font-mono font-bold uppercase tracking-widest rounded-[4px] transition-all duration-150 shadow-[0_0_16px_rgba(59,130,246,0.2)] cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Evacuation Shelter
                  </button>
                </div>
              </div>
            )}
          </aside>

          {/* DOCKED MAP PANEL */}
          <div className="flex-1 h-[400px] md:h-full relative z-10 bg-[#11111b]">
            {isEditMode && (
              <div className="absolute top-4 md:top-6 left-1/2 -translate-x-1/2 z-30 flex items-center h-7 md:h-10 gap-3 border border-border-surface bg-bg-mantle px-3.5 py-1 md:px-4 md:py-2 rounded-[4px] shadow-2xl font-mono text-[9px] md:text-[10px] text-text-text max-w-[90vw] md:max-w-none animate-in fade-in slide-in-from-top-4 duration-300">
                <span className="flex items-center gap-2 font-sans font-medium text-text-subtext">
                  <span>
                    {pinnedPosition
                      ? "Pin placed. Confirm to save shelter details."
                      : "Click anywhere on the map to place the shelter pin"}
                  </span>
                </span>
                <div className="h-full border-r border-border-surface self-stretch mx-1" />
                <div className="flex items-center gap-1.5">
                  {pinnedPosition && (
                    <button
                      onClick={() => {
                        setIsEditMode(false);
                        setShowShelterForm(true);
                      }}
                      className="px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold font-mono uppercase rounded-[2px] cursor-pointer border transition-all bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/35 text-emerald-500"
                    >
                      Confirm
                    </button>
                  )}
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-1.5 py-0.5 md:px-2 md:py-1 text-[7px] md:text-[8px] font-bold font-mono uppercase rounded-[2px] cursor-pointer border transition-all bg-[#f38ba8]/20 border-[#f38ba8]/30 hover:bg-[#f38ba8]/35 text-[#f38ba8]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <Suspense fallback={
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#1e1e2e]">
                <div className="relative w-full h-full overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(59,130,246,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.06) 1px, transparent 1px)",
                      backgroundSize: "48px 48px",
                    }}
                  />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="relative w-10 h-10">
                      <div className="absolute inset-0 rounded-full border-2 border-primary-blue/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary-blue animate-spin" />
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-primary-blue">
                      Rendering Cartographic Engine
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">
                      Loading tile layers&hellip;
                    </span>
                  </div>
                </div>
              </div>
            }>
              <FloodMap
                data={data}
                theme={appliedTheme}
                selectedHourDetails={selectedHourDetails}
                getProbabilityCategory={getProbabilityCategory}
                isEditMode={isEditMode}
                pinnedPosition={pinnedPosition}
                onMapClick={setPinnedPosition}
                defaultStyle="satellite"
                shelterPins={shelterPins}
                onPinClick={openShelterInfo}
                selectedShelterPin={selectedShelterPin}
              />
            </Suspense>
          </div>

        </section>

      </div>

      {/* Footer */}
      <div className="w-full mt-auto bg-bg-crust pb-16 md:pb-0">
        <Footer />
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border-surface bg-bg-mantle/95 backdrop-blur-md flex items-center justify-around py-2.5 px-4 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        {EVAC_SECTIONS.map((sec) => {
          const isActive = activeDashboardSection === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToDashboardSection(sec.id)}
              className={`flex flex-col items-center gap-1 font-mono text-[9px] uppercase tracking-wider transition-colors duration-200 cursor-pointer ${isActive ? "text-primary-blue" : "text-text-muted hover:text-text-subtext"
                }`}
            >
              {sec.id === "overview" && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              )}
              <span className="text-[8px] tracking-tight">{sec.label.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* Scroll to Top Button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-20 md:bottom-6 right-6 z-50 flex items-center justify-center cursor-pointer transition-all duration-300 ${showScrollTop ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
          }`}
        title="Scroll to Top"
      >
        <div className="bg-border-surface [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[34px] h-[38px] flex items-center justify-center hover:bg-primary-blue transition-colors shadow-2xl">
          <div className="bg-bg-mantle [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] w-[32px] h-[36px] flex items-center justify-center text-text-muted hover:text-text-text transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </div>
        </div>
      </button>

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-mantle border border-border-surface max-w-sm w-full rounded-[8px] p-6 shadow-2xl flex flex-col gap-4 text-text-text animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-text">
                Delete Evacuation Shelter
              </h3>
            </div>

            {/* Modal Content */}
            <p className="text-[11px] text-text-subtext leading-relaxed font-sans">
              Are you sure you want to delete <span className="font-semibold text-text-text">"{selectedShelterPin?.shelter?.shelter_name || "this shelter"}"</span>? This action is permanent, cannot be undone, and will immediately remove all records associated with this shelter.
            </p>

            {/* Modal Actions */}
            <div className="flex gap-2.5 mt-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-border-surface bg-bg-crust hover:bg-bg-crust/85 text-text-subtext hover:text-text-text text-[10px] font-mono font-bold uppercase tracking-wider rounded-[4px] transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteShelter}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 dark:bg-rose-500 dark:hover:bg-rose-400 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-[4px] transition-all cursor-pointer"
              >
                Delete Shelter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE ERROR MODAL */}
      {deleteErrorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-bg-base/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-mantle border border-border-surface max-w-sm w-full rounded-[8px] p-6 shadow-2xl flex flex-col gap-4 text-text-text animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-500/10 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-text-text">
                Deletion Failed
              </h3>
            </div>

            {/* Modal Content */}
            <p className="text-[11px] text-text-subtext leading-relaxed font-sans">
              An error occurred while attempting to delete this shelter:
              <span className="block mt-1 font-mono text-[10px] text-rose-600 dark:text-[#f38ba8] bg-rose-500/5 dark:bg-[#f38ba8]/5 p-2 rounded-[4px] border border-rose-500/10 dark:border-[#f38ba8]/10">
                {deleteErrorMsg}
              </span>
            </p>

            {/* Modal Actions */}
            <div className="flex mt-2 justify-end">
              <button
                onClick={() => setDeleteErrorMsg(null)}
                className="px-4 py-2 border border-border-surface bg-bg-crust hover:bg-bg-crust/85 text-text-text text-[10px] font-mono font-bold uppercase tracking-wider rounded-[4px] transition-all cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
