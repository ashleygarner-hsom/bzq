/**
 * Trigger callback that runs when a user opens the spreadsheet.
 * Registers custom UI menus.
 * @param {Object} [containerScope] - Calling script's global scope.
 * @returns {void}
 */
function onOpen(containerScope) {
  const ui = SpreadsheetApp.getUi();
  buildModuleManagerMenu(ui);
}

/**
 * Builds the Module Manager menu.
 * @param {GoogleAppsScript.Base.Ui} ui - The Apps Script UI environment.
 * @returns {void}
 */
function buildModuleManagerMenu(ui) {
  ui.createMenu("Module Manager")
    .addItem("Enable Module...", "triggerShowModuleManagerDialog")
    .addToUi();
}

/**
 * Menu trigger to display the Module Manager interactive enabling dialog.
 * @returns {void}
 */
function triggerShowModuleManagerDialog() {
  const html = HtmlService.createTemplateFromFile("ModuleManagerDialog")
                          .evaluate()
                          .setWidth(450)
                          .setHeight(400)
                          .setTitle("BZQ Module Manager");
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Client-side callable wrapper to enable a module.
 * @param {string} moduleName - Name of the target module.
 * @param {string} folderId - Destination folder ID.
 * @returns {string} Status result message.
 */
function moduleManager_enableModule(moduleName, folderId) {
  try {
    return ModuleManager.enableModule(moduleName, folderId);
  } catch (e) {
    return "Error: " + e.message;
  }
}
