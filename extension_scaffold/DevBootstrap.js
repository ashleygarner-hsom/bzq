/**
 * Cold deploys and seeds the database for the developer's environment.
 * Run this function directly from the Google Apps Script editor.
 */
function devBootstrapEnvironment() {
  const envName = "LOCAL_ASHLEYGARNER-HSOM";
  const parentFolderId = "13n8-ylbfDFcu8ZGlB9JTTLP2crFVEj3J";
  const legacyConfigId = "1SyMoGrqy7_JdQ2VbUwsv6ALvMmX9765mKZRJK8pYkew";

  Logger.log("Starting BZQ bootstrap for environment: " + envName);
  const parentFolder = DriveApp.getFolderById(parentFolderId);

  // 1. Create BZQ Core Configuration
  const configTitle = "BZQ Core Configuration " + envName;
  Logger.log("Creating Configuration spreadsheet: " + configTitle);
  const newConfigSs = SpreadsheetApp.create(configTitle);
  
  // Move it to the target Drive folder
  const configFile = DriveApp.getFileById(newConfigSs.getId());
  parentFolder.addFile(configFile);
  DriveApp.getRootFolder().removeFile(configFile);

  // 2. Create Forms Engine
  const formsTitle = "Forms Engine " + envName;
  Logger.log("Creating Forms Engine spreadsheet: " + formsTitle);
  const newFormsSs = SpreadsheetApp.create(formsTitle);
  const formsFile = DriveApp.getFileById(newFormsSs.getId());
  parentFolder.addFile(formsFile);
  DriveApp.getRootFolder().removeFile(formsFile);

  const configId = newConfigSs.getId();
  const formsId = newFormsSs.getId();

  Logger.log("Config ID: " + configId);
  Logger.log("Forms ID: " + formsId);

  // 3. Open Legacy Spreadsheet and Copy Data
  const legacySs = SpreadsheetApp.openById(legacyConfigId);
  const sheets = legacySs.getSheets();

  sheets.forEach(legacySheet => {
    const sheetName = legacySheet.getName();
    Logger.log("Copying sheet: " + sheetName);

    // Create or locate the tab in the new Configuration workbook
    let targetSheet = newConfigSs.getSheetByName(sheetName);
    if (!targetSheet) {
      targetSheet = newConfigSs.insertSheet(sheetName);
    }

    const lastRow = legacySheet.getLastRow();
    const lastCol = legacySheet.getLastColumn();
    if (lastRow > 0 && lastCol > 0) {
      const range = legacySheet.getRange(1, 1, lastRow, lastCol);
      const values = range.getValues();
      const formulas = range.getFormulas();

      // Merge formulas into values array
      for (let r = 0; r < lastRow; r++) {
        for (let c = 0; c < lastCol; c++) {
          let cellValue = values[r][c];
          
          // Replace legacy spreadsheet ID strings dynamically
          if (typeof cellValue === "string") {
            cellValue = cellValue.replace(new RegExp(legacyConfigId, "g"), configId);
            cellValue = cellValue.replace(new RegExp(legacySs.getId(), "g"), configId);
          }

          if (formulas[r][c]) {
            let formula = formulas[r][c];
            // Replace legacy spreadsheet ID strings in formulas dynamically
            formula = formula.replace(new RegExp(legacyConfigId, "g"), configId);
            formula = formula.replace(new RegExp(legacySs.getId(), "g"), configId);
            values[r][c] = formula;
          } else {
            values[r][c] = cellValue;
          }
        }
      }

      // Write values back to the target sheet
      targetSheet.getRange(1, 1, lastRow, lastCol).setValues(values);
    }
  });

  // 4. Update __Spreadsheets registry IDs
  const registrySheet = newConfigSs.getSheetByName("__Spreadsheets");
  if (registrySheet) {
    const lastRow = registrySheet.getLastRow();
    if (lastRow >= 2) {
      const range = registrySheet.getRange(2, 1, lastRow - 1, 2);
      const values = range.getValues();
      values.forEach(row => {
        if (row[0] === "Configuration") {
          row[1] = configId;
        } else if (row[0] === "Forms Engine") {
          row[1] = formsId;
        }
      });
      range.setValues(values);
    }
  }

  // 5. Update __ObjectConfiguration spreadsheet IDs
  const objectsSheet = newConfigSs.getSheetByName("__ObjectConfiguration");
  if (objectsSheet) {
    const lastRow = objectsSheet.getLastRow();
    if (lastRow >= 2) {
      const range = objectsSheet.getRange(2, 4, lastRow - 1, 1); // Spreadsheet ID column
      const values = range.getValues();
      values.forEach(row => {
        // If it pointed to legacy config or legacy forms, update it
        if (row[0] === legacyConfigId) {
          row[0] = configId;
        } else {
          row[0] = formsId; // Default spoke mapping
        }
      });
      range.setValues(values);
    }
  }

  // Delete the default Sheet1 tab in the new workbooks
  const defaultSheet = newConfigSs.getSheetByName("Sheet1");
  if (defaultSheet) newConfigSs.deleteSheet(defaultSheet);
  const defaultSheet2 = newFormsSs.getSheetByName("Sheet1");
  if (defaultSheet2) newFormsSs.deleteSheet(defaultSheet2);

  PropertiesService.getScriptProperties().setProperty("BZQ_ENV", envName);
  Logger.log("BZQ Dev Environment Seeding Completed Successfully!");
  Logger.log("Config ID: " + configId);
  Logger.log("Forms ID: " + formsId);
}
