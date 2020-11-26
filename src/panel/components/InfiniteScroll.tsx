import React, { useEffect, useState } from "react";

type Props = {
  children: any;
  dataStartAt: number;
  setDataStartAt: (dataStartAt: number) => void;
};

export default function InfiniteScroll({
  children,
  dataStartAt,
  setDataStartAt,
}: Props) {
  const [nextDataStartAt, setNextDataStartAt] = useState(dataStartAt);
  useEffect(() => {
    const intervalId = setInterval(() => {
      console.log(dataStartAt, nextDataStartAt);
      if (nextDataStartAt !== dataStartAt) {
        setDataStartAt(nextDataStartAt);
      }
    }, 5000);
    return () => clearInterval(intervalId);
  }, []);
  return (
    <div
      onScroll={() => {
        // TODO: ...
      }}
    >
      <span
        style={{
          position: "fixed",
          backgroundColor: "yellow",
          top: 0,
          right: 0,
        }}
      >
        {dataStartAt} &gt; {nextDataStartAt}
      </span>
      {children}
    </div>
  );
}
