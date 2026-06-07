/**
 * Simple trigger that runs when a user opens the spreadsheet.
 * Registers custom UI menus.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('ManageBusiness')
    .addItem('Add record to page', 'triggerAddRecordToActivePage')
    .addItem('Initialize Application', 'appInit_setupInstallableTrigger')
    .addToUi();
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
 * Programmatically registers the installable trigger to run the loading overlay.
 */
function appInit_setupInstallableTrigger() {
  const functionName = 'appInit_onOpenInstallable';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const triggers = ScriptApp.getUserTriggers(spreadsheet);
    const triggerExists = triggers.some(t => t.getHandlerFunction() === functionName);
    
    if (triggerExists) {
      SpreadsheetApp.getUi().alert("Initialization Status", "Application is already initialized: Startup trigger is active.", SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }
    
    ScriptApp.newTrigger(functionName)
             .forSpreadsheet(spreadsheet)
             .onOpen()
             .create();
             
    SpreadsheetApp.getUi().alert("Initialization Successful", "Biz Qops has been successfully ", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Initialization Failed", "Error creating startup trigger: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Installable trigger callback.
 * Runs with full user authorizations, allowing modal dialog display.
 */
function appInit_onOpenInstallable(e) {
  showLoadingDialog_();
}

/**
 * Internal helper to display the loading modal dialog.
 * @private
 */
function showLoadingDialog_() {
  let logoUrl = "https://ssl.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png";
  try {
    const logoFileId = ConfigurationManager.getConfigValue("LOADING_LOGO", false);
    if (logoFileId) {
      logoUrl = "https://docs.google.com/uc?export=download&id=" + logoFileId;
    }
  } catch (e) {
    // Ignore permissions issues
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
 * Server-side initialization step 1: Fetches the branded logo URL.
 */
function appInit_getLogoUrl() {
  const logoFileId = ConfigurationManager.getConfigValue("LOADING_LOGO");
  let logoUrl = "https://ssl.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png";
  if (logoFileId) {
    logoUrl = "https://docs.google.com/uc?export=download&id=" + logoFileId;
  }
  return logoUrl;
}

/**
 * Server-side initialization step 2: Updates configuration cache.
 */
function appInit_updateCache() {
  ConfigurationManager.updateCachedConfigValues(false);
  return true;
}

/**
 * Server-side initialization step 3: Pre-caches object configurations to warm up Script Cache.
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
 * Server-side initialization step 4: Creates custom menus.
 */
function appInit_createMenus() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('ManageBusiness')
    .addItem('Add record to page', 'triggerAddRecordToActivePage')
    .addItem('Initialize Application', 'appInit_setupInstallableTrigger')
    .addToUi();
  return true;
}
