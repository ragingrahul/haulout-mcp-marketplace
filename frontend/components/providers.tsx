"use client";

/**
 * Providers Component
 * Wraps the app with all necessary client-side providers
 */

import { WalletProvider } from "@suiet/wallet-kit";
import { AuthProvider } from "@/contexts/AuthContext";
import "@suiet/wallet-kit/style.css";

/**
 * Main Providers Component
 * Uses Suiet Wallet Kit for Sui blockchain integration
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </WalletProvider>
  );
}
