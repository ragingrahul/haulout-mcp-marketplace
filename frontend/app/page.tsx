"use client";

import Footer from "@/components/footer";
import Grid from "@/components/grid";
import Hero from "@/components/hero";
import { Navbar } from "@/components/navbar";

export default function Home() {
  return (
    <main className="relative bg-black-100 flex justify-center items-center flex-col overflow-hidden mx-auto sm:px-10 px-5">
      <Navbar />
      <div className="max-w-7xl w-full">
        <div>
          <Hero />
          <Grid />
          <Footer />
        </div>
      </div>
    </main>
  );
}
