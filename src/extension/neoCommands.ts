import * as fs from "fs";
import * as neonCore from "@cityofzion/neon-core";
import * as path from "path";
import * as vscode from "vscode";

import BlockchainIdentifier from "./blockchainIdentifier";
import ContractDetector from "./detectors/contractDetector";
import { deployContract } from "../neon-js-experimental/experimental";
import IoHelpers from "./ioHelpers";
import WalletDetector from "./detectors/walletDetector";
import Networks from "../neon-js-experimental/networks";

export default class NeoCommands {
  static async contractDeploy(
    identifer: BlockchainIdentifier,
    contractDetector: ContractDetector,
    walletDetector: WalletDetector
  ) {
    const wallets = walletDetector.wallets;
    if (!wallets.length) {
      vscode.window.showErrorMessage(
        "No NEP-6 wallets were found in the current workspace."
      );
      return;
    }
    if (!Object.keys(contractDetector.contracts).length) {
      vscode.window.showErrorMessage(
        "No compiled contracts (*.nef files) were found in the current workspace."
      );
      return;
    }
    const rpcUrl = await identifer.selectRpcUrl();
    if (!rpcUrl) {
      return;
    }
    const walletPath = await IoHelpers.multipleChoiceFiles(
      "Select a wallet for the deployment...",
      ...wallets.map((_) => _.path)
    );
    const wallet = wallets.find((_) => _.path === walletPath);
    if (!wallet) {
      return;
    }
    const walletAccounts = wallet.accounts;
    if (!walletAccounts.length) {
      return;
    }
    let selectedOption: string | undefined = "0";
    if (walletAccounts.length > 1) {
      selectedOption = await IoHelpers.multipleChoice(
        `Select an address from wallet ${path.basename(walletPath)}...`,
        ...walletAccounts.map((a, i) => `${i} - ${a.address} (${a.label})`)
      );
    }
    const walletAccountIndex = parseInt(selectedOption || "0");
    const walletAccount = walletAccounts[walletAccountIndex];
    if (!walletAccount) {
      return;
    }
    if (!(await wallet.tryUnlockAccount(walletAccountIndex))) {
      return;
    }
    const contracts = contractDetector.contracts;
    const contractFile = await IoHelpers.multipleChoiceFiles(
      `Deploy contract using ${walletAccount.address} (from ${path.basename(
        walletPath
      )})`,
      ...Object.values(contracts).map((_) => _.absolutePathToNef)
    );
    const contract = Object.values(contracts).find(
      (_) => _.absolutePathToNef === contractFile
    );
    if (!contract) {
      return;
    }
    let nef;
    try {
      nef = Buffer.from(fs.readFileSync(contract.absolutePathToNef, null));
    } catch (e) {
      await vscode.window.showErrorMessage(
        `Could not read contract: ${contract.absolutePathToNef}`
      );
      return;
    }
    const config = {
      networkMagic: Networks.TestNet.ProtocolConfiguration.Magic,
      rpcAddress: rpcUrl,
      account: walletAccount,
    };
    const result = await deployContract(nef, contract.manifest, config);
    await vscode.window.showInformationMessage(result);
  }

  static async createWallet() {
    const account = new neonCore.wallet.Account(
      neonCore.wallet.generatePrivateKey()
    );
    account.label = "Default account";
    const walletName = await IoHelpers.enterString(
      "Enter a name for the wallet"
    );
    if (!walletName) {
      return;
    }
    const wallet = new neonCore.wallet.Wallet({ name: walletName });
    wallet.addAccount(account);
    wallet.setDefault(0);
    const password = await IoHelpers.choosePassword(
      "Choose a password for the wallet (press Enter for none)",
      true
    );
    if (!password && password !== "") {
      return;
    }
    if (!(await wallet.encryptAll(password))) {
      await vscode.window.showErrorMessage(
        "Could not encrypt the wallet using the supplied password"
      );
    }
    const walletJson = JSON.stringify(wallet.export(), undefined, 2);
    // TODO: Auto-save in current workspace
    const textDocument = await vscode.workspace.openTextDocument({
      language: "json",
      content: walletJson,
    });
    await vscode.window.showTextDocument(textDocument);
  }
}
