import * as bitset from "bitset";
import * as neonTypes from "@cityofzion/neon-core/lib/types";
import * as neonTx from "@cityofzion/neon-core/lib/tx";

const MAX_REFRESH_INTERVAL_MS = 1000; // initially check every 1s but adapt according to observed block times
const MIN_REFRESH_INTERVAL_MS = 1000 * 30;

const now = () => new Date().getTime();

export default class BlockchainState {
  public readonly blockTimes: number[];
  public readonly cachedBlocks: neonTypes.BlockJson[];
  public readonly cachedTransactions: neonTx.TransactionJson[];
  public readonly populatedBlocks: bitset.BitSet;

  public isHealthy: boolean;
  public lastKnownBlockHeight: number;

  constructor(public readonly lastKnownCacheId: string = "") {
    this.blockTimes = [now()];
    this.cachedBlocks = [];
    this.cachedTransactions = [];
    this.populatedBlocks = new bitset.default();
    this.isHealthy = false;
    this.lastKnownBlockHeight = 0;

    // Always consider the genesis block as "populated" (even though technically
    // it has zero transactions, it is an significant part of the chain history):
    this.populatedBlocks.set(0);
  }

  currentRefreshInterval() {
    let differencesSum: number = 0;
    let differencesCount: number = 0;
    let previous = now();
    for (const timestamp of this.blockTimes) {
      differencesSum += previous - timestamp;
      differencesCount++;
      previous = timestamp;
    }
    if (differencesCount === 0) {
      return MAX_REFRESH_INTERVAL_MS;
    }
    return Math.min(
      MIN_REFRESH_INTERVAL_MS,
      Math.max(
        Math.round((1.0 / 3.0) * (differencesSum / differencesCount)),
        MAX_REFRESH_INTERVAL_MS
      )
    );
  }
}
