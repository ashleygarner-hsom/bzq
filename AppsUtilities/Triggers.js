/**
 * Simple trigger that runs when a user opens the spreadsheet.
 * Registers custom UI menus and displays a branded loading overlay.
 */
function onOpen() {
  const logoFileId = ConfigurationManager.getConfigValue("LOADING_LOGO");
  let logoUrl = "https://ssl.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png";
  if (logoFileId) {
    logoUrl = "https://docs.google.com/uc?export=download&id=" + logoFileId;
  }
  
  const template = HtmlService.createTemplateFromFile("Loading");
  template.logoUrl = logoUrl;
  
  const htmlOutput = template.evaluate()
                              .setWidth(400)
                              .setHeight(280)
                              .setTitle(" ")
                              .setSandboxMode(HtmlService.SandboxMode.IFRAME);
  
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, " ");
}

/**
 * Simple trigger that runs when a user edits a cell in a spreadsheet.
 * Coordinates validation and other edit events.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function onEdit(e) {
  RecordManager.processRecordEdit(e);
}

/**
 * Helper invoked by the custom menu to add a new record to the currently active sheet.
 */
function triggerAddRecordToActivePage() {
  const activeSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const sheetName = activeSheet.getName();
  RecordManager.newRecord(sheetName);
}

/**
 * Server-side initialization step 1: Updates configuration cache.
 */
function appInit_updateCache() {
  ConfigurationManager.updateCachedConfigValues(false);
  return true;
}

/**
 * Server-side initialization step 2: Pre-caches object configurations to warm up Script Cache.
 */
function appInit_preCacheObjects() {
  const sheetName = AppUtilitiesGlobalProperties.objectConfigurationSheetName_;
  const data = ConfigurationManager.getSheetData_(sheetName);
  if (!data) return true;
  
  const headers = data[0];
  const nameCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object name');
  const dsCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'datasheet');
  const objCol = headers.findIndex(h => String(h).trim().toLowerCase() === 'object');
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (nameCol !== -1 && row[nameCol]) {
      ConfigurationManager.getObjectConfiguration(row[nameCol], 'objectName');
    }
    if (dsCol !== -1 && row[dsCol]) {
      ConfigurationManager.getObjectConfiguration(row[dsCol], 'datasheetName');
    }
    if (objCol !== -1 && row[objCol]) {
      ConfigurationManager.getObjectConfiguration(row[objCol], 'object');
    }
  }
  return true;
}

/**
 * Server-side initialization step 3: Creates custom menus.
 */
function appInit_createMenus() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('ManageBusiness')
    .addItem('Add record to page', 'triggerAddRecordToActivePage')
    .addToUi();
  return true;
}
