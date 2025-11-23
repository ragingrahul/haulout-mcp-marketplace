import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format SUI balance with proper decimal places
 * SUI uses 9 decimal places (1 SUI = 1,000,000,000 MIST)
 */
export function formatSuiBalance(
  balance: string | number,
  decimals: number = 9
): string {
  const num = typeof balance === "string" ? parseFloat(balance) : balance;
  if (isNaN(num)) return "0.000000000";
  return num.toFixed(decimals);
}

/**
 * Format SUI balance for display (removes trailing zeros after decimal)
 * Shows up to 9 decimal places but removes unnecessary trailing zeros
 */
export function formatSuiDisplay(balance: string | number): string {
  const formatted = formatSuiBalance(balance, 9);
  // Remove trailing zeros but keep at least 2 decimal places
  const parts = formatted.split(".");
  if (parts.length === 2) {
    const decimals = parts[1].replace(/0+$/, "");
    const minDecimals =
      decimals.length < 2 ? parts[1].substring(0, 2) : decimals;
    return `${parts[0]}.${minDecimals}`;
  }
  return formatted;
}
