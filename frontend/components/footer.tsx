import { socialMedia } from "@/data";
import Image from "next/image";

const Footer = () => {
  return (
    <footer className="w-full pt-20 pb-10" id="contact">
      {/* background grid */}

      <div className="flex flex-col items-center">
        <h1
          className="heading lg:max-w-[45vw] text-4xl md:text-5xl lg:text-6xl font-bold text-center"
          style={{ color: "#463500" }}
        >
          Ready to monetize your <span className="text-yellow-600">MCP</span>{" "}
          tool and profit from it?
        </h1>
        <p className="md:mt-10 my-5 text-center" style={{ color: "#463500" }}>
          Connect and experience the luxury of an efficient running business
        </p>
      </div>
      <div className="flex mt-16 md:flex-row flex-col justify-between items-center">
        <p
          className="md:text-base text-sm md:font-normal font-light"
          style={{ color: "#463500" }}
        >
          Copyright © 2025 Hyoouka
        </p>

        <div className="flex items-center md:gap-3 gap-6">
          {socialMedia.map((info) => (
            <div
              key={info.id}
              className="w-10 h-10 cursor-pointer flex justify-center items-center backdrop-filter backdrop-blur-lg saturate-180 bg-opacity-75 bg-black-200 rounded-lg border border-black-300"
            >
              <Image
                src={info.img}
                alt="icons"
                width={20}
                height={20}
                className="filter-brown"
              />
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
