import { Spotlight } from "./ui/spotlight";

const Hero = () => {
  return (
    <div className="pt-36 flex items-center">
      <div>
        <Spotlight
          className="-top-40 -left-10 md:-left-32 md:-top-20 h-screen"
          fill="red"
        />
        <Spotlight
          className="top-10 left-full h-[80vh] w-[50vw]"
          fill="orange"
        />
        <Spotlight className="top-28 left-80 h-[80vh] w-[50vw]" fill="amber" />
      </div>

      <div className="flex justify-center relative my-8 z-10 w-full">
        <div className="max-w-[89vw] md:max-w-4xl lg:max-w-[70vw] flex flex-col items-center justify-center">
          <h2
            className="uppercase tracking-widest text-xs text-center max-w-100 mb-8"
            style={{ color: "#463500" }}
          >
            The Decentralized AI Tool Marketplace
          </h2>

          <div className="text-center mb-6">
            <h1
              className="text-4xl md:text-5xl lg:text-7xl font-bold mb-4"
              style={{ color: "#463500" }}
            >
              <span className="block mb-2">Discover, Deploy & Monetize</span>
              <span className="block">
                <span className="text-yellow-600">MCP Servers</span> on{" "}
                <span className="text-yellow-600">Sui Blockchain</span>
              </span>
            </h1>
          </div>

          <p
            className="text-center md:tracking-wider mb-2 text-lg md:text-xl max-w-3xl"
            style={{ color: "#463500" }}
          >
            The first marketplace for Model Context Protocol servers with
            permanent data storage powered by Walrus.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Hero;
