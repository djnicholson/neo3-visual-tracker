import * as path from "path";
import * as vscode from "vscode";

export default class IoHelpers {
  static async choosePassword(
    prompt: string,
    acceptEmptyString?: boolean
  ): Promise<string | undefined> {
    const input = await vscode.window.showInputBox({ prompt, password: true });
    if (input === "") {
      if (acceptEmptyString) {
        if (
          await IoHelpers.yesNo(
            "Are you sure that you want to use an empty password?"
          )
        ) {
          return input;
        } else {
          return await IoHelpers.choosePassword(prompt);
        }
      } else {
        // showWarningMessage is not await'ed so that the password prompt appears at the same time:
        vscode.window.showWarningMessage("A (non-empty) password is required");
        return await IoHelpers.choosePassword(prompt);
      }
    }
    if (!input) {
      return;
    }
    const confirmation = await vscode.window.showInputBox({
      prompt: "Re-enter the password (for confirmation)",
      password: true,
    });
    if (confirmation === input) {
      return input;
    }
    // showWarningMessage is not await'ed so that the password prompt appears at the same time:
    vscode.window.showWarningMessage(
      "The two passwords that you entered did not match."
    );
    return await IoHelpers.choosePassword(prompt, acceptEmptyString);
  }

  static async enterNumber(prompt: string): Promise<number | undefined> {
    const input = await vscode.window.showInputBox({
      prompt,
      validateInput: (_) =>
        isNaN(parseFloat(_)) ? "Enter a numeric value" : null,
    });
    if (input) {
      return parseFloat(input);
    } else {
      return undefined;
    }
  }

  static async enterPassword(prompt: string): Promise<string | undefined> {
    return await vscode.window.showInputBox({ prompt, password: true });
  }

  static async enterString(prompt: string): Promise<string | undefined> {
    return await vscode.window.showInputBox({ prompt });
  }

  static async multipleChoice(placeHolder: string, ...items: string[]) {
    return await vscode.window.showQuickPick(items, {
      canPickMany: false,
      placeHolder,
    });
  }

  static async multipleChoiceFiles(placeHolder: string, ...items: string[]) {
    const selection = await vscode.window.showQuickPick(
      items.map((_) => ({ detail: _, label: path.basename(_) })),
      {
        canPickMany: false,
        placeHolder,
      }
    );
    return selection?.detail || "";
  }

  static async pickFolder(
    defaultUri?: vscode.Uri
  ): Promise<string | undefined> {
    const selections = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      defaultUri,
      openLabel: "Select folder",
      canSelectMany: false,
      canSelectFiles: false,
    });
    if (selections && selections.length) {
      return selections[0].fsPath;
    } else {
      return undefined;
    }
  }

  static async pickSaveFile(
    verb: string,
    fileTypeDescription: string,
    fileTypeExtension: string,
    defaultUri?: vscode.Uri
  ): Promise<string | undefined> {
    const filters: any = {};
    filters[fileTypeDescription] = [fileTypeExtension];
    return (
      await vscode.window.showSaveDialog({
        defaultUri,
        filters,
        saveLabel: verb,
      })
    )?.fsPath;
  }

  static async yesNo(question: string): Promise<boolean> {
    const choice = await vscode.window.showErrorMessage(
      question,
      { modal: true },
      { title: "Yes" },
      { title: "No", isCloseAffordance: true }
    );
    return choice?.title === "Yes";
  }
}
