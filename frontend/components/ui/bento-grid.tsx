import { cn } from "@/lib/utils";
import Image from "next/image";

export const BentoGrid = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid grid-cols-1 gap-4 lg:gap-8 md:grid-cols-5 md:grid-rows-6",
        className
      )}
      style={{
        maxWidth: "1280px",
        width: "1280px",
        height: "955px",
        gridAutoRows: "minmax(0, 1fr)",
      }}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  className,
  id,
  title,
  description,
  img,
  imgClassName,
  titleClassName,
  spareImg,
}: {
  className?: string;
  id?: number;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  img?: string;
  imgClassName?: string;
  titleClassName?: string;
  spareImg?: string;
}) => {
  const leftLists = ["MCP", "Sui", "Walrus"];
  const rightLists = ["Trustless", "Ease", "Friendly"];

  return (
    <div
      className={cn(
        "row-span-1 relative overflow-hidden rounded-3xl border border-white/10 group/bento hover:shadow-xl transition duration-200 shadow-input justify-between flex flex-col space-y-4",
        className
      )}
      style={{ backgroundColor: "#fac903" }}
    >
      <div className="h-full relative">
        {img && id !== 4 && id !== 5 && (
          <div className="w-full h-full absolute inset-0 z-0">
            <Image
              src={img}
              alt={title?.toString() || "Grid item"}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className={cn(imgClassName, "object-cover")}
              priority={id === 1}
            />
            {/* Gradient overlay for text readability on cards 1 and 3 */}
            {(id === 1 || id === 3) && (
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
            )}
          </div>
        )}
        {img && id === 5 && (
          <div className="absolute right-0 bottom-0 z-10">
            <Image
              src={img}
              alt={title?.toString() || "Grid item"}
              width={384}
              height={384}
              sizes="384px"
              className="object-cover object-center w-60 md:w-96"
            />
          </div>
        )}
        {img && id === 4 && (
          <div className="w-full h-full absolute inset-0 z-0 opacity-20">
            <Image
              src={img}
              alt={title?.toString() || "Grid item"}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-black/20 to-transparent" />
          </div>
        )}
        {spareImg && id !== 4 && id !== 5 && (
          <div className="absolute right-0 -bottom-5 w-full h-full z-0">
            <Image
              src={spareImg}
              alt="spare"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover object-center opacity-80"
            />
          </div>
        )}
        {spareImg && id === 5 && (
          <div className="w-full h-full absolute right-0 -bottom-5 z-0 opacity-80">
            <Image
              src={spareImg}
              alt="spare"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              className="object-cover object-center w-full h-full"
            />
          </div>
        )}
        {spareImg && id === 4 && (
          <div className="absolute right-0 -bottom-5 z-10">
            <Image
              src={spareImg}
              alt="spare"
              width={256}
              height={256}
              sizes="256px"
              className="object-contain object-bottom-right w-40 h-40 lg:w-56 lg:h-56"
            />
          </div>
        )}

        <div
          className={cn(
            titleClassName,
            "group-hover/bento:translate-x-2 transition duration-200 relative h-full flex flex-col px-5 p-5 lg:p-10 z-10",
            id === 1
              ? "justify-end pb-8 items-start"
              : id === 3
              ? "justify-center items-start"
              : "justify-start items-start"
          )}
        >
          <div
            className="font-sans font-extralight md:max-w-32 md:text-xs lg:text-base text-sm relative z-20"
            style={{
              color: id === 1 || id === 3 || id === 4 ? "#ffffff" : "#463500",
            }}
          >
            {description}
          </div>

          <div
            className={cn(
              "font-sans text-lg lg:text-3xl max-w-96 font-bold relative z-20",
              (id === 1 || id === 3 || id === 4) && "drop-shadow-lg"
            )}
            style={{
              color: id === 1 || id === 3 || id === 4 ? "#ffffff" : "#463500",
            }}
          >
            {title}
          </div>

          {/* Globe for second card */}
          {id === 2 && (
            <div className="absolute -bottom-28 -right-28 lg:-bottom-48 lg:-right-8">
              <div
                className="relative w-64 h-64 lg:w-80 lg:h-80 rounded-full border-2"
                style={{
                  backgroundColor: "rgba(70, 53, 0, 0.2)",
                  borderColor: "#463500",
                }}
              />
            </div>
          )}

          {/* Keywords floating for third card */}
          {id === 3 && (
            <div className="flex gap-1 lg:gap-5 w-fit absolute top-0 -right-3 lg:-right-2">
              <div className="flex flex-col gap-3 md:gap-3 lg:gap-8">
                {leftLists.map((item, i) => (
                  <span
                    key={i}
                    className="lg:py-4 lg:px-3 py-2 px-3 text-xs lg:text-base opacity-50 lg:opacity-100 rounded-lg text-center"
                    style={{
                      backgroundColor: "rgba(70, 53, 0, 0.6)",
                      color: "#ffffff",
                    }}
                  >
                    {item}
                  </span>
                ))}
                <span
                  className="lg:py-4 lg:px-3 py-4 px-3 rounded-lg text-center"
                  style={{ backgroundColor: "rgba(70, 53, 0, 0.6)" }}
                ></span>
              </div>
              <div className="flex flex-col gap-3 md:gap-3 lg:gap-8">
                <span
                  className="lg:py-4 lg:px-3 py-4 px-3 rounded-lg text-center"
                  style={{ backgroundColor: "rgba(70, 53, 0, 0.6)" }}
                ></span>
                {rightLists.map((item, i) => (
                  <span
                    key={i}
                    className="lg:py-4 lg:px-3 py-2 px-3 text-xs lg:text-base opacity-50 lg:opacity-100 rounded-lg text-center"
                    style={{
                      backgroundColor: "rgba(70, 53, 0, 0.6)",
                      color: "#ffffff",
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Code snippet for fifth card */}
          {id === 5 && (
            <div className="relative w-full h-full flex items-center justify-center mt-10"></div>
          )}
        </div>
      </div>
    </div>
  );
};
