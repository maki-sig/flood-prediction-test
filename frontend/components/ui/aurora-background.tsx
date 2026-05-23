"use client";
import { cn } from "@/lib/utils";
import React, { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children?: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  const mergedStyle = { background: "var(--bg-base)", color: "var(--text-text)", ...(props.style || {}) } as React.CSSProperties;

  return (
    <main>
      <div
        className={cn("relative flex flex-col h-[100vh] items-center justify-center transition-bg", className)}
        style={mergedStyle}
        {...props}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            // simplified, CSS lives in globals.css under `.aurora-layer`
            className={cn("aurora-layer absolute inset-0 pointer-events-none", showRadialGradient && "aurora-mask")}
          />
        </div>
        {children}
      </div>
    </main>
  );
};
