import { companies, gridItems } from "@/data";
import { BentoGrid, BentoGridItem } from "./ui/bento-grid";
import React from "react";
import Image from "next/image";

const Grid = () => {
  return (
    <section id="about">
      <BentoGrid className="w-full pt-30 pb-20">
        {gridItems.map((item, i) => (
          <BentoGridItem
            id={item.id}
            key={i}
            title={item.title}
            description={item.description}
            className={item.className}
            img={item.img}
            imgClassName={item.imgClassName}
            titleClassName={item.titleClassName}
            spareImg={item.spareImg}
          />
        ))}
      </BentoGrid>
      <div className="flex flex-col flex-wrap items-center justify-center gap-4 md:gap-10 max-lg:mt-10">
        <h1
          className="font-extrabold text-3xl md:text-4xl"
          style={{ color: "#463500" }}
        >
          Powered By
        </h1>
        <div className="flex flex-wrap items-center justify-center gap-20">
          {companies.map((company) => (
            <React.Fragment key={company.id}>
              <div className="flex items-center md:max-w-80 max-w-32 gap-3">
                <Image
                  src={company.img}
                  alt={company.name}
                  width={60}
                  height={60}
                  className="md:w-14 w-8"
                />
                <h1
                  className="text-3xl md:text-4xl font-bold"
                  style={{ color: "#463500" }}
                >
                  {company.name}
                </h1>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Grid;
