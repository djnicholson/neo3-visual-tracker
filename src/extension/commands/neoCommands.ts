import * as fs from "fs";
import * as neonCore from "@cityofzion/neon-core";
import * as path from "path";
import * as vscode from "vscode";

import ActiveConnection from "../activeConnection";
import BlockchainIdentifier from "../blockchainIdentifier";
import ContractDetector from "../fileDetectors/contractDetector";
import IoHelpers from "../util/ioHelpers";
import JSONC from "../util/JSONC";
import posixPath from "../util/posixPath";
import WalletDetector from "../fileDetectors/walletDetector";

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
    const walletAddresses = wallet.addresses;
    if (!walletAddresses.length) {
      return;
    }
    let walletAddress: string | undefined = walletAddresses[0];
    if (walletAddresses.length > 1) {
      walletAddress = await IoHelpers.multipleChoice(
        `Select an address from wallet ${path.basename(walletPath)}...`,
        ...walletAddresses
      );
    }
    if (!walletAddress) {
      return;
    }
    const contracts = contractDetector.contracts;
    const contractFile = await IoHelpers.multipleChoiceFiles(
      `Deploy contract using ${walletAddress} (from ${path.basename(
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
    let script = "";
    try {
      script = fs.readFileSync(contract.absolutePathToNef).toString("hex");
    } catch (e) {
      await vscode.window.showErrorMessage(
        `Could not read contract: ${contract.absolutePathToNef}`
      );
    }
    // const deployScript = neonJs.sc.generateDeployScript({
    //   manifest: JSON.stringify(contract.manifest),
    //   script,
    // }).str;
    await vscode.window.showInformationMessage(
      `Coming soon: TestNet deployment/invocation`
    );
  }

  static async createWallet() {
    const workspaceFolder = NeoCommands.workspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "Please open a folder in your Visual Studio Code workspace before creating a wallet"
      );
      return;
    }
    const walletFilesFolder = posixPath(workspaceFolder, "wallets");
    if (!fs.existsSync(walletFilesFolder)) {
      fs.mkdirSync(walletFilesFolder);
    }
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
    const walletJson = JSONC.stringify(wallet.export());
    const safeWalletName = walletName.replace(/[^-_.a-z0-9]/gi, "-");
    let filename = posixPath(
      walletFilesFolder,
      `${safeWalletName}.neo-wallet.json`
    );
    let i = 0;
    while (fs.existsSync(filename)) {
      i++;
      filename = posixPath(
        walletFilesFolder,
        `${safeWalletName} (${i}).neo-wallet.json`
      );
    }
    fs.writeFileSync(filename, walletJson);
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filename));
  }

  static async invokeContract(
    identifer: BlockchainIdentifier,
    activeConnection: ActiveConnection
  ) {
    if (
      activeConnection.connection?.blockchainIdentifier.name !== identifer.name
    ) {
      await activeConnection.connect(identifer);
    }
    const workspaceFolder = NeoCommands.workspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "Please open a folder in your Visual Studio Code workspace before invoking a contract"
      );
      return;
    }
    const invokeFilesFolder = posixPath(workspaceFolder, "invoke-files");
    if (!fs.existsSync(invokeFilesFolder)) {
      fs.mkdirSync(invokeFilesFolder);
    }
    let filename = posixPath(invokeFilesFolder, "Untitled.neo-invoke.json");
    let i = 0;
    while (fs.existsSync(filename)) {
      i++;
      filename = posixPath(
        invokeFilesFolder,
        `Untitled (${i}).neo-invoke.json`
      );
    }
    fs.writeFileSync(filename, "[{}]");
    vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filename));
  }

  static async newContract(context: vscode.ExtensionContext) {
    let contractName = await IoHelpers.enterString(
      "Enter name for your contract (e.g. TokenEscrow)"
    );
    if (contractName?.toLocaleLowerCase().endsWith("contract")) {
      contractName = contractName.replace(/contract$/i, "");
    }
    if (!contractName) {
      return;
    }
    if (!contractName[0].match(/[a-z]/i)) {
      contractName = "_" + contractName;
    }
    contractName = contractName.replace(/[^a-z0-9]+/gi, "_");
    if (!contractName) {
      return;
    }

    const workspaceFolder = NeoCommands.workspaceFolder();
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "Please open a folder in your Visual Studio Code workspace before creating a contract"
      );
      return;
    }
    const dotVsCodeFolderPath = posixPath(workspaceFolder, ".vscode");
    const tasksJsonPath = posixPath(dotVsCodeFolderPath, "tasks.json");
    const contractPath = posixPath(workspaceFolder, contractName);
    const templatePath = posixPath(
      context.extensionPath,
      "resources",
      "new-contract"
    );
    if (fs.existsSync(contractPath)) {
      vscode.window.showErrorMessage(
        `A contract called ${contractName} already exists in this vscode.workspace.`
      );
      return;
    }
    if (!fs.existsSync(dotVsCodeFolderPath)) {
      fs.mkdirSync(dotVsCodeFolderPath);
    }
    const doSubstitutions = (text: string) =>
      text
        .replace(/\$_CLASSNAME_\$/g, `${contractName}Contract`)
        .replace(/\$_NAMESPACENAME_\$/g, `${contractName}`);
    const doCopy = (srcFile: string) => {
      const dstFile = doSubstitutions(srcFile);
      const dstFileAbsolute = posixPath(contractPath, dstFile);
      const srcFileAbsolute = posixPath(
        templatePath,
        `${srcFile}.template.txt`
      );
      fs.copyFileSync(srcFileAbsolute, dstFileAbsolute);
      fs.writeFileSync(
        dstFileAbsolute,
        doSubstitutions(fs.readFileSync(dstFileAbsolute).toString())
      );
    };
    fs.mkdirSync(contractPath);
    fs.mkdirSync(posixPath(contractPath, ".config"));
    doCopy("$_CLASSNAME_$.cs");
    doCopy("$_CLASSNAME_$.csproj");
    doCopy("Directory.Build.targets");
    doCopy("nuget.config");
    doCopy(posixPath(".config", "dotnet-tools.json"));
    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(
        posixPath(contractPath, `${contractName}Contract.cs`)
      )
    );

    let tasksJsonTxt = "";
    let tasksJson: { version: string; tasks: any } = {
      version: "2.0.0",
      tasks: [],
    };
    try {
      tasksJsonTxt = fs.readFileSync(tasksJsonPath).toString();
      tasksJson = JSONC.parse(tasksJsonTxt);
      if (tasksJson.tasks) {
        if (!Array.isArray(tasksJson.tasks)) {
          return;
        }
      } else {
        tasksJson.tasks = [];
      }
    } catch {}
    const newTask = (
      label: string,
      args: string[],
      problemMatcher: string | any[],
      dependsOn?: string
    ) => ({
      options: { cwd: "${workspaceFolder}/" + contractName },
      label: `${contractName}: ${label}`,
      command: "dotnet",
      type: "shell",
      args,
      group: "build",
      presentation: { reveal: "silent" },
      problemMatcher,
      dependsOn: dependsOn ? `${contractName}: ${dependsOn}` : undefined,
    });
    (tasksJson.tasks as any[]).push(newTask("restore", ["restore"], []));
    (tasksJson.tasks as any[]).push(
      newTask("toolrestore", ["tool", "restore"], [], "restore")
    );
    (tasksJson.tasks as any[]).push(
      newTask(
        "build",
        [
          "build",
          "/property:GenerateFullPaths=true",
          "/consoleloggerparameters:NoSummary",
        ],
        "$msCompile",
        "toolrestore"
      )
    );
    const buildTaskLabel = tasksJson.tasks[tasksJson.tasks.length - 1].label;
    fs.writeFileSync(tasksJsonPath, JSONC.stringify(tasksJson));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const tasks = await vscode.tasks.fetchTasks();
    const buildTask = tasks.filter((_) => _.name === buildTaskLabel)[0];
    if (buildTask) {
      vscode.tasks.executeTask(buildTask);
    }
  }

  private static workspaceFolder() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || !workspaceFolders.length) {
      return null;
    }
    return posixPath(workspaceFolders[0].uri.fsPath);
  }
}
