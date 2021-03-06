import React from "react";
import * as neonCore from "@cityofzion/neon-core";

import Address from "../Address";
import AutoCompleteData from "../../../shared/autoCompleteData";

type Props = {
  autoCompleteData: AutoCompleteData;
  token: string;
  selectAddress?: (address: string) => void;
};

export default function ScriptToken({
  autoCompleteData,
  token,
  selectAddress,
}: Props) {
  const style: React.CSSProperties = {
    marginRight: "1em",
  };
  token = token.trim();

  const contractHashes = Object.keys(autoCompleteData.contractNames);
  for (const contractHash of contractHashes) {
    const name = autoCompleteData.contractNames[contractHash] || "contract";
    const contractHashRaw = contractHash
      .replace(/^0x/g, "")
      .toLowerCase()
      .match(/[a-f0-9]{2}/g)
      ?.reverse()
      .join("");
    if (token === contractHashRaw) {
      return (
        <span
          style={style}
          title={`Contract:\n ${contractHashRaw}\n  (${name})`}
        >
          <strong>
            {contractHashRaw.substring(0, 4)}..
            {contractHashRaw.substring(contractHashRaw.length - 4)} (
          </strong>
          <i>{name}</i>
          <strong>)</strong>
        </span>
      );
    }
  }

  if (token.length == 40) {
    try {
      const address = neonCore.wallet.getAddressFromScriptHash(
        token
          .match(/[a-f0-9]{2}/g)
          ?.reverse()
          .join("") || ""
      );
      if (address.startsWith("N")) {
        return (
          <span style={style}>
            <strong title={token}>
              {token.substring(0, 4)}..
              {token.substring(token.length - 4)}
            </strong>{" "}
            <Address
              address={address}
              addressNames={autoCompleteData.addressNames}
              onClick={selectAddress}
            />
          </span>
        );
      }
    } catch {}
  }

  try {
    const asText = Buffer.from(token, "hex")
      .toString("ascii")
      .replace(/\\n/g, " ")
      .trim();
    if (asText.length > 0) {
      let printableAscii = true;
      for (let i = 0; i < asText.length; i++) {
        const c = asText.charCodeAt(i);
        printableAscii = printableAscii && c >= 32 && c <= 126;
      }
      if (printableAscii) {
        return (
          <span style={style} title={`Text:\n ${token}\n  ${asText}`}>
            <strong>
              {" "}
              {token.length > 8 ? (
                <>
                  {token.substring(0, 4)}..
                  {token.substring(token.length - 4)}
                </>
              ) : (
                <>{token}</>
              )}{" "}
              ("
            </strong>
            <i>{asText}</i>
            <strong>")</strong>
          </span>
        );
      }
    }
  } catch {}

  // TODO: For smaller hex values (maybe below 16 or 32 bit) also show them as
  //       base 10 (as it is quite likely they may be integer arguments to
  //       contracts)

  return <span style={style}>{token}</span>;
}
