"use client";

/**
 * Providers Component
 * Wraps the app with all necessary client-side providers
 */

import { useEffect } from "react";
import { WalletProvider } from "@suiet/wallet-kit";
import { AuthProvider } from "@/contexts/AuthContext";
import "@suiet/wallet-kit/style.css";

// Aggressively suppress specific console errors IMMEDIATELY
if (typeof window !== "undefined") {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function (...args: unknown[]) {
    // Convert all arguments to string for checking
    const fullMessage = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg && typeof arg === "object") return JSON.stringify(arg);
        return String(arg);
      })
      .join(" ");

    // Block these specific errors completely
    if (
      fullMessage.includes("empty string") ||
      fullMessage.includes("was passed to the src") ||
      fullMessage.includes("element.ref was removed in React 19") ||
      fullMessage.includes("download the whole page again")
    ) {
      return; // Do nothing - suppress completely
    }
    originalError.apply(console, args);
  };

  console.warn = function (...args: unknown[]) {
    const fullMessage = args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg && typeof arg === "object") return JSON.stringify(arg);
        return String(arg);
      })
      .join(" ");

    if (
      fullMessage.includes("empty string") ||
      fullMessage.includes("was passed to the src") ||
      fullMessage.includes("element.ref was removed in React 19")
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

/**
 * Main Providers Component
 * Uses Suiet Wallet Kit for Sui blockchain integration
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Double-check suppression is active after mount
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = function (...args: unknown[]) {
      const fullMessage = args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg && typeof arg === "object") return JSON.stringify(arg);
          return String(arg);
        })
        .join(" ");

      if (
        fullMessage.includes("empty string") ||
        fullMessage.includes("was passed to the src") ||
        fullMessage.includes("element.ref was removed in React 19") ||
        fullMessage.includes("download the whole page again")
      ) {
        return;
      }
      originalError.apply(console, args);
    };

    console.warn = function (...args: unknown[]) {
      const fullMessage = args
        .map((arg) => {
          if (typeof arg === "string") return arg;
          if (arg && typeof arg === "object") return JSON.stringify(arg);
          return String(arg);
        })
        .join(" ");

      if (
        fullMessage.includes("empty string") ||
        fullMessage.includes("was passed to the src") ||
        fullMessage.includes("element.ref was removed in React 19")
      ) {
        return;
      }
      originalWarn.apply(console, args);
    };

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <WalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </WalletProvider>
  );
}
