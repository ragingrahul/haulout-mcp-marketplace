"use client";
import React from "react";
import { navItems } from "@/data";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

export function Navbar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "fixed top-10 inset-x-0 max-w-6xl mx-auto z-50 px-4",
        className
      )}
    >
      <nav
        className="relative rounded-full border border-transparent shadow-input flex justify-between items-center px-8 py-4"
        style={{ backgroundColor: "#ffdd2c" }}
      >
        {/* Logo on the left */}
        <Link href="/" className="flex items-center">
          <Image
            src="/logoNew.png"
            alt="Protocol9 Logo"
            width={150}
            height={50}
            className="h-10 w-auto"
          />
        </Link>

        {/* Navigation items in the center/right */}
        <div className="flex items-center gap-8">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.link}
              className="text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "#463500" }}
            >
              {item.name}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "#463500" }}
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "#463500" }}
          >
            Sign Up
          </Link>
        </div>
      </nav>
    </div>
  );
}
