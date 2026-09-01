/**
 * Cold deploys and seeds the database for the developer's environment.
 * Run this function directly from the Google Apps Script editor.
 */
function devBootstrapEnvironment() {
  const envName = typeof BZQ_ENV !== "undefined" ? BZQ_ENV : PropertiesService.getScriptProperties().getProperty("BZQ_ENV");
  if (!envName) {
    throw new Error("BZQ_ENV is not defined. Cannot bootstrap environment.");
  }
  const parentFolderId = typeof BZQ_PARENT_FOLDER_ID !== "undefined" ? BZQ_PARENT_FOLDER_ID : "";
  if (!parentFolderId) {
    Logger.log("Error: BZQ_PARENT_FOLDER_ID is not defined.");
    return;
  }
  bootstrapEnvironmentWithId_(envName, parentFolderId);
}

/**
 * Creates and setups spreadsheets inside the parent folder.
 * @param {string} envName - The active environment name.
 * @param {string} parentFolderId - Target parent folder ID.
 * @private
 */
function bootstrapEnvironmentWithId_(envName, parentFolderId) {
  Logger.log("Starting BZQ bootstrap for environment: " + envName);
  const parentFolder = DriveApp.getFolderById(parentFolderId);

  const configId = createAndMoveSpreadsheet_("BZQ Core Configuration " + envName, parentFolder);
  const formsId = createAndMoveSpreadsheet_("Forms Engine " + envName, parentFolder);

  PropertiesService.getScriptProperties().setProperty("BZQ_ENV", envName);
  PropertiesService.getDocumentProperties().setProperty("BZQ_CONFIG_SS_ID", configId);
  PropertiesService.getDocumentProperties().setProperty("BZQ_FORMS_SS_ID", formsId);

  // Auto-provision container-bound trigger scripts for local sheets
  Logger.log("Provisioning container-bound trigger projects...");
  SpreadsheetRegistry.ensureSpokeTriggers(configId);
  SpreadsheetRegistry.ensureSpokeTriggers(formsId);

  Logger.log("BZQ Dev Environment Bootstrap Completed Successfully!");
  Logger.log("Config ID: " + configId);
  Logger.log("Forms ID: " + formsId);
}

/**
 * Creates a spreadsheet and moves it to the target Drive folder.
 * @param {string} title - Spreadsheet file name.
 * @param {GoogleAppsScript.Drive.Folder} parentFolder - Parent Drive folder.
 * @returns {string} The created spreadsheet ID.
 * @private
 */
function createAndMoveSpreadsheet_(title, parentFolder) {
  const ss = SpreadsheetApp.create(title);
  const file = DriveApp.getFileById(ss.getId());
  parentFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return ss.getId();
}
