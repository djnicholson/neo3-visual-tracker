import { CONST, rpc, sc, tx, u, wallet } from "@cityofzion/neon-core";
import { CommonConfig } from "./index";
import {
  HexString,
  reverseHex,
  StringStream,
} from "@cityofzion/neon-core/lib/u";
import { Signer } from "@cityofzion/neon-core/lib/tx";
import { GASContract } from "./nep5";
import { OpCode } from "@cityofzion/neon-core/lib/sc";

interface NeonSerializable {
  size: number;
  serialize: () => string;
}
type Serializables = number | HexString | NeonSerializable[];

/**
 * Calculates the byte size of any supported input following NEO's variable int format.
 */
export function getSerializedSize(value: Serializables): number {
  switch (typeof value) {
    case "number": {
      if (value < 0xfd) return 1;
      else if (value <= 0xffff) return 3;
      else return 5;
    }
    case "object": {
      if (value instanceof HexString) {
        const size = value.byteLength;
        return getSerializedSize(size) + size;
      } else if (Array.isArray(value)) {
        let size = 0;
        if (value.length > 0) {
          if (
            typeof value[0].size === "number" &&
            typeof value[0].serialize === "function"
          ) {
            size = value
              .map((item) => item.size)
              .reduce((prev, curr) => prev + curr, 0);
          }
        }
        return getSerializedSize(value.length) + size;
      }
      throw new Error("Unsupported value type (ref A): " + typeof value);
    }
    default:
      throw new Error("Unsupported value type (ref B): " + typeof value);
  }
}

/**
 * Check if the format of input matches that of a single signature contract
 */
export function isSignatureContract(input: HexString): boolean {
  const PUBLIC_KEY_LENGTH = 33;
  const script = Buffer.from(input.toString(), "hex");
  return !(
    script.length != 41 ||
    script[0] != OpCode.PUSHDATA1 ||
    script[1] != PUBLIC_KEY_LENGTH ||
    script[35] != OpCode.PUSHNULL ||
    script[36] != OpCode.SYSCALL ||
    script.readUInt32LE(37) != 2014135445
  );
}

/**
 * Check if the format of input matches that of a multi-signature contract
 */
export function isMultisigContract(input: HexString): boolean {
  const script = Buffer.from(input.toString(), "hex");
  if (script.length < 43) {
    return false;
  }

  let signatureCount, i;
  if (script[0] == OpCode.PUSHINT8) {
    signatureCount = script[1];
    i = 2;
  } else if (script[0] == OpCode.PUSHINT16) {
    signatureCount = script.readUInt16LE(1);
    i = 3;
  } else if (script[0] <= OpCode.PUSH1 || script[0] >= OpCode.PUSH16) {
    signatureCount = script[0] - OpCode.PUSH0;
    i = 1;
  } else {
    return false;
  }

  if (signatureCount < 1 || signatureCount > 1024) {
    return false;
  }

  let publicKeyCount = 0;
  while (script[i] == OpCode.PUSHDATA1) {
    if (script.length <= i + 35) {
      return false;
    }
    if (script[i + 1] != 33) {
      return false;
    }
    i += 35;
    publicKeyCount += 1;
  }

  if (publicKeyCount < signatureCount || publicKeyCount > 1024) {
    return false;
  }

  const value = script[i];
  if (value == OpCode.PUSHINT8) {
    if (script.length <= i + 1 || publicKeyCount != script[i + 1]) {
      return false;
    }
    i += 2;
  } else if (value == OpCode.PUSHINT16) {
    if (script.length < i + 3 || publicKeyCount != script.readUInt16LE(i + 1)) {
      return false;
    }
    i += 3;
  } else if (OpCode.PUSH1 <= value && value <= OpCode.PUSH16) {
    if (publicKeyCount != value - OpCode.PUSH0) {
      return false;
    }
    i += 1;
  } else {
    return false;
  }

  if (
    script.length != i + 6 ||
    script[i] != OpCode.PUSHNULL ||
    script[i + 1] != OpCode.SYSCALL
  ) {
    return false;
  }

  i += 2;

  if (script.readUInt32LE(i) != 2951712019) {
    return false;
  }

  return true;
}

/**
 * Calculate the GAS costs for validation and inclusion of the transaction in a block
 * @param transaction - the transaction to calculate the network fee for
 * @param account -
 * @param config -
 */
export async function calculateNetworkFee(
  transaction: tx.Transaction,
  account: wallet.Account,
  config: CommonConfig
): Promise<number> {
  if (transaction.signers.length < 1) {
    throw new Error(
      "Cannot calculate the network fee without a sender in the transaction."
    );
  }

  const hashes = transaction.getScriptHashesForVerifying();
  let networkFeeSize =
    transaction.headerSize +
    getSerializedSize(transaction.signers) +
    getSerializedSize(transaction.attributes) +
    getSerializedSize(transaction.script) +
    getSerializedSize(hashes.length);

  let networkFee = 0;
  hashes.map((hash) => {
    let witnessScript;
    if (hash === account.scriptHash && account.contract.script !== undefined) {
      witnessScript = HexString.fromBase64(account.contract.script);
    }

    if (witnessScript === undefined && transaction.witnesses.length > 0) {
      for (const witness of transaction.witnesses) {
        if (witness.scriptHash === hash) {
          witnessScript = witness.verificationScript;
          break;
        }
      }
    }

    if (witnessScript === undefined)
      // should get the contract script via RPC getcontractstate
      // then execute the script with a verification trigger (not yet supported)
      // and collect the gas consumed
      throw new Error(
        "Using a smart contract as a witness is not yet supported in neon-js"
      );
    else if (isSignatureContract(witnessScript)) {
      networkFeeSize += 67 + getSerializedSize(witnessScript);
      networkFee =
        (sc.OpCodePrices[sc.OpCode.PUSHDATA1] +
          sc.OpCodePrices[sc.OpCode.PUSHDATA1] +
          sc.OpCodePrices[sc.OpCode.PUSHNULL] +
          sc.getInteropServicePrice(
            sc.InteropServiceCode.NEO_CRYPTO_VERIFYWITHECDSASECP256R1
          )) *
        100_000_000;
    } else if (isMultisigContract(witnessScript)) {
      const publicKeyCount = wallet.getPublicKeysFromVerificationScript(
        witnessScript.toString()
      ).length;
      const signatureCount = wallet.getSigningThresholdFromVerificationScript(
        witnessScript.toString()
      );
      const size_inv = 66 * signatureCount;
      networkFeeSize +=
        getSerializedSize(size_inv) +
        size_inv +
        getSerializedSize(witnessScript);
      networkFee += sc.OpCodePrices[sc.OpCode.PUSHDATA1] * signatureCount;

      const builder = new sc.ScriptBuilder();
      let pushOpcode = sc.fromHex(
        builder.emitPush(signatureCount).build().slice(0, 2)
      );
      // price for pushing the signature count
      networkFee += sc.OpCodePrices[pushOpcode];

      // now do the same for the public keys
      builder.reset();
      pushOpcode = sc.fromHex(
        builder.emitPush(publicKeyCount).build().slice(0, 2)
      );
      // price for pushing the public key count
      networkFee += sc.OpCodePrices[pushOpcode];
      networkFee +=
        sc.OpCodePrices[sc.OpCode.PUSHNULL] +
        sc.getInteropServicePrice(
          sc.InteropServiceCode.NEO_CRYPTO_VERIFYWITHECDSASECP256R1
        ) *
          publicKeyCount;
      networkFee *= 100_000_000;
    }
    // else { // future supported contract types}
  });

  const rpcClient = new rpc.RPCClient(config.rpcAddress);
  try {
    const response = await rpcClient.invokeFunction(
      CONST.NATIVE_CONTRACTS.POLICY,
      "getFeePerByte"
    );
    if (response.state === "FAULT") {
      throw Error;
    }
    const nativeContractPolicyFeePerByte = parseInt(
      response.stack[0].value as string
    );
    networkFee += networkFeeSize * nativeContractPolicyFeePerByte;
  } catch (e) {
    throw new Error(
      `Failed to get 'fee per byte' from Policy contract. Error: ${e}`
    );
  }

  return networkFee;
}

/**
 * Get the cost of executing the smart contract script
 * @param script - smart contract script
 * @param config -
 * @param signers - signers to set while running the script
 */
export async function getSystemFee(
  script: HexString,
  config: CommonConfig,
  signers?: Signer[]
): Promise<number> {
  const rpcClient = new rpc.RPCClient(config.rpcAddress);
  try {
    const response = await rpcClient.invokeScript(script.toString(), signers);
    if (response.state === "FAULT") {
      throw Error("Script execution failed. ExecutionEngine state = FAULT");
    }
    return u.Fixed8.fromRawNumber(response.gasconsumed).toNumber();
  } catch (e) {
    throw new Error(`Failed to get system fee. ${e}`);
  }
}

/**
 * Set the validUntilBlock field on a transaction
 *
 * If `blocksTillExpiry` is provided then the value is used.
 * If `blocksTillExpiry` is not provided, or the value exceeds the maximum allowed,
 * then the field is automatically set to the maximum allowed by the network.
 * @param transaction - the transaction to set the expiry field on
 * @param config -
 * @param blocksTillExpiry - number of blocks from the current chain height until the transaction is no longer valid
 */
export async function setBlockExpiry(
  transaction: tx.Transaction,
  config: CommonConfig,
  blocksTillExpiry?: number
): Promise<void> {
  let blockLifeSpan = tx.Transaction.MAX_TRANSACTION_LIFESPAN;
  if (
    blocksTillExpiry &&
    !(blocksTillExpiry > tx.Transaction.MAX_TRANSACTION_LIFESPAN)
  )
    blockLifeSpan = blocksTillExpiry;
  const rpcClient = new rpc.RPCClient(config.rpcAddress);
  transaction.validUntilBlock =
    (await rpcClient.getBlockCount()) + blockLifeSpan - 1;
}

/**
 * Add system and network fees to a transaction.
 * Validates that the source Account has sufficient balance
 * @param transaction - the transaction to add network and system fees to
 * @param config -
 */
export async function addFees(
  transaction: tx.Transaction,
  config: CommonConfig
): Promise<void> {
  transaction.systemFee = new u.Fixed8(
    await getSystemFee(transaction.script, config, transaction.signers)
  );

  if (config.account === undefined)
    throw new Error(
      "Cannot determine network fee and validate balances without an account in your config"
    );

  transaction.networkFee = new u.Fixed8(
    await calculateNetworkFee(transaction, config.account, config)
  ).div(100_000_000);

  const GAS = new GASContract(config);
  const GASBalance = await GAS.balanceOf(config.account.address);
  const requiredGAS = transaction.systemFee
    .add(transaction.networkFee)
    .toNumber();
  if (GASBalance < requiredGAS) {
    throw new Error(
      `Insufficient GAS. Required: ${requiredGAS} Available: ${GASBalance}`
    );
  }
}

/**
 * Deploy a smart contract
 * @param NEF - A smart contract in Neo executable file format. Commonly created by a NEO compiler and stored as .NEF on disk
 * @param manifest - the manifest conresponding to the smart contract
 * @param config -
 */
export async function deployContract(
  NEF: Buffer,
  manifest: sc.ContractManifest,
  config: CommonConfig
): Promise<string> {
  const builder = new sc.ScriptBuilder();
  const script_size_offset = 76;
  const nef_script_with_size = new StringStream(
    NEF.slice(script_size_offset).toString("hex")
  );

  builder.emitSysCall(
    sc.InteropServiceCode.SYSTEM_CONTRACT_CREATE,
    HexString.fromHex(reverseHex(nef_script_with_size.readVarBytes())),
    JSON.stringify(manifest.toJson())
  );

  const transaction = new tx.Transaction();
  transaction.script = HexString.fromHex(builder.build());

  await setBlockExpiry(transaction, config, config.blocksTillExpiry);

  // add a sender
  if (config.account === undefined)
    throw new Error("Account in your config cannot be undefined");

  transaction.addSigner({
    account: config.account.scriptHash,
    scopes: "CalledByEntry",
  });

  await addFees(transaction, config);

  transaction.sign(config.account, config.networkMagic);
  const rpcClient = new rpc.RPCClient(config.rpcAddress);
  return await rpcClient.sendRawTransaction(transaction);
}
