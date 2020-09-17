import React from "react";
import { BlockJson } from "@cityofzion/neon-core/lib/types";

import BlockDetails from "./BlockDetails";
import Hash from "../Hash";
import Table from "../Table";
import Time from "../Time";

type Props = {
  blocks: BlockJson[];
  selectedBlock: string;
  selectedTransaction: string;
  selectAddress: (address: string) => void;
  selectBlock: (hash: string) => void;
  selectTransaction: (txid: string) => void;
};

export default function BlockList({
  blocks,
  selectedBlock,
  selectedTransaction,
  selectAddress,
  selectBlock,
  selectTransaction,
}: Props) {
  const loadingStyle: React.CSSProperties = {
    textAlign: "center",
    padding: 30,
  };
  return (
    <Table
      headings={[
        { content: <>Index</> },
        { content: <>Time</> },
        { content: <>Transactions</> },
        { content: <>Hash</> },
        { content: <>Size</> },
      ]}
      rows={
        blocks.length
          ? blocks.map((block) => ({
              key: block.hash,
              parity: block.index % 2 === 0,
              onClick:
                selectedBlock === block.hash
                  ? () => selectBlock("")
                  : () => selectBlock(block.hash),
              cells: [
                { content: <>{block.index}</> },
                { content: <Time ts={block.time} /> },
                { content: <>{block.tx.length}</> },
                { content: <Hash hash={block.hash} /> },
                { content: <>{block.size} bytes</> },
              ],
              annotation:
                selectedBlock === block.hash ? (
                  <BlockDetails
                    block={block}
                    selectedTransaction={selectedTransaction}
                    selectAddress={selectAddress}
                    selectTransaction={selectTransaction}
                  />
                ) : undefined,
            }))
          : [
              {
                key: "loading",
                cells: [
                  {
                    colSpan: 5,
                    content: <span style={loadingStyle}>Loading&hellip;</span>,
                  },
                ],
              },
            ]
      }
    />
  );
}