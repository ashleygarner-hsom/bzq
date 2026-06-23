/**
 * Simple trigger that runs when a user opens the spreadsheet.
 * Registers custom UI menus.
 * @param {Object} [containerScope] - The calling script's global scope (if invoked from a container script library delegation)
 */
function onOpen(containerScope) {
  LoggingManager.LogDebugMessage_("AppsUtilities: simple trigger onOpen running...");
  const ui = SpreadsheetApp.getUi();
  buildManageBusinessMenu(ui, containerScope);
}

/**
 * Simple trigger that runs when a user edits a cell in a spreadsheet.
 * Safely exits if running as simple trigger to prevent authorization exceptions.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function onEdit(e) {
  // Simple triggers cannot make calls requiring authorization (e.g. SpreadsheetApp.openById).
  if (e && (e.authMode === ScriptApp.AuthMode.NONE || e.authMode === ScriptApp.AuthMode.LIMITED)) {
    return;
  }
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
 * Programmatically registers the installable triggers to run the loading overlay and edit validations.
 */
function appInit_setupInstallableTrigger() {
  const openTriggerFn = 'appInit_onOpenInstallable';
  const editTriggerFn = 'appInit_onEditInstallable';
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const triggers = ScriptApp.getUserTriggers(spreadsheet);
    
    let openCreated = false;
    let editCreated = false;
    
    // Check and create Open trigger
    const openExists = triggers.some(t => t.getHandlerFunction() === openTriggerFn);
    if (!openExists) {
      ScriptApp.newTrigger(openTriggerFn)
               .forSpreadsheet(spreadsheet)
               .onOpen()
               .create();
      openCreated = true;
    }
    
    // Check and create Edit trigger
    const editExists = triggers.some(t => t.getHandlerFunction() === editTriggerFn);
    if (!editExists) {
      ScriptApp.newTrigger(editTriggerFn)
               .forSpreadsheet(spreadsheet)
               .onEdit()
               .create();
      editCreated = true;
    }
    
    let msg = "";
    if (openCreated && editCreated) {
      msg = "Startup and Edit triggers have been successfully installed.";
    } else if (openCreated) {
      msg = "Startup trigger has been successfully installed (Edit trigger was already active).";
    } else if (editCreated) {
      msg = "Edit trigger has been successfully installed (Startup trigger was already active).";
    } else {
      msg = "Application is already initialized: All triggers are active.";
    }
             
    SpreadsheetApp.getUi().alert("Initialization Successful", msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Initialization Failed", "Error creating triggers: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
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
 * Installable trigger callback for edit events.
 * Runs with full user authorizations, allowing opening configuration spreadsheets.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function appInit_onEditInstallable(e) {
  RecordManager.processRecordEdit(e);
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
      if (logoFileId.indexOf("http") === 0) {
        logoUrl = logoFileId;
      } else {
        try {
          const file = DriveApp.getFileById(logoFileId);
          const mimeType = file.getMimeType();
          const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
          logoUrl = "data:" + mimeType + ";base64," + base64Data;
        } catch (driveErr) {
          logoUrl = "https://docs.google.com/uc?export=download&id=" + logoFileId;
        }
      }
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
    if (logoFileId.indexOf("http") === 0) {
      logoUrl = logoFileId;
    } else {
      try {
        const file = DriveApp.getFileById(logoFileId);
        const mimeType = file.getMimeType();
        const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
        logoUrl = "data:" + mimeType + ";base64," + base64Data;
      } catch (driveErr) {
        logoUrl = "https://docs.google.com/uc?export=download&id=" + logoFileId;
      }
    }
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
 * @param {Object} [containerScope] - The calling script's global scope (if invoked from library delegation)
 */
function appInit_createMenus(containerScope) {
  const ui = SpreadsheetApp.getUi();
  buildManageBusinessMenu(ui, containerScope);
  return true;
}

/**
 * Dynamically builds the custom menu for the application.
 * @param {GoogleAppsScript.Base.Ui} ui - The Apps Script UI environment object
 * @param {Object} [containerScope] - The container scope containing globally defined libraries/methods
 */
function buildManageBusinessMenu(ui, containerScope) {
  LoggingManager.LogDebugMessage_("AppsUtilities: buildManageBusinessMenu starting...");
  const formattingSubMenu = ui.createMenu('Formatting')
    .addItem('Set header format', 'triggerSetHeaderFormat')
    .addItem('Set record format', 'triggerSetRecordFormat');
    
  const utilitiesSubMenu = ui.createMenu('Utilities')
    .addItem('Validate Selected', 'triggerValidateSelectedRows')
    .addItem('Apply Header Format', 'triggerApplyHeaderFormat')
    .addItem('Apply Record Format', 'triggerApplyRecordFormat');

  const adminSubMenu = ui.createMenu('Admin')
    .addItem('Initialize Application', 'appInit_setupInstallableTrigger')
    .addItem('Reset Configuration Cache', 'triggerResetConfigurationCache')
    .addSubMenu(formattingSubMenu);
    
  const mainMenu = ui.createMenu('ManageBusiness')
    .addItem('Add record to page', 'triggerAddRecordToActivePage');
    
  // Dynamic submenu loading if FormsEngine is enabled
  addFormsEngineSubMenuIfEnabled_(ui, mainMenu, containerScope);
    
  mainMenu.addSubMenu(utilitiesSubMenu)
    .addSubMenu(adminSubMenu)
    .addToUi();
  LoggingManager.LogDebugMessage_("AppsUtilities: buildManageBusinessMenu completed and added to UI.");
}

/**
 * Helper to dynamically load and add the Entry Forms submenu if FormsEngine is enabled.
 * Resolves the FormsEngine namespace inside the container script scope.
 * @param {GoogleAppsScript.Base.Ui} ui - The spreadsheet UI object
 * @param {GoogleAppsScript.Base.Menu} mainMenu - The parent menu object
 * @param {Object} [containerScope] - The container scope containing globally defined libraries/methods
 * @private
 */
function addFormsEngineSubMenuIfEnabled_(ui, mainMenu, containerScope) {
  LoggingManager.LogDebugMessage_("AppsUtilities: Checking if FormsEngine submenu should be added...");
  try {
    const formsEngineEnabled = ConfigurationManager.getConfigValue("FORMS_ENGINE_ENABLED", false);
    LoggingManager.LogDebugMessage_("AppsUtilities: FORMS_ENGINE_ENABLED cache/config value: " + formsEngineEnabled);
    if (formsEngineEnabled && String(formsEngineEnabled).toUpperCase() === 'TRUE') {
      const scope = containerScope || this;
      const formsEngineLib = scope["FormsEngine"];
      LoggingManager.LogDebugMessage_("AppsUtilities: formsEngineLib on resolved scope: " + (formsEngineLib ? "defined" : "undefined"));
      
      let buildMenuFn = null;
      if (formsEngineLib && typeof formsEngineLib.formsEngine_buildEntryFormsMenu === 'function') {
        LoggingManager.LogDebugMessage_("AppsUtilities: buildMenuFn resolved from FormsEngine library.");
        buildMenuFn = formsEngineLib.formsEngine_buildEntryFormsMenu.bind(formsEngineLib);
      } else if (typeof scope["formsEngine_buildEntryFormsMenu"] === 'function') {
        LoggingManager.LogDebugMessage_("AppsUtilities: buildMenuFn resolved from local scope.");
        buildMenuFn = scope["formsEngine_buildEntryFormsMenu"];
      } else {
        LoggingManager.LogError_("AppsUtilities: Could not find buildEntryFormsMenu in library or global scopes. Type of formsEngine_buildEntryFormsMenu on resolved scope: " + typeof scope["formsEngine_buildEntryFormsMenu"]);
      }
      
      if (buildMenuFn) {
        LoggingManager.LogDebugMessage_("AppsUtilities: Invoking buildEntryFormsMenu function...");
        const entryFormsMenu = buildMenuFn(ui);
        if (entryFormsMenu) {
          mainMenu.addSubMenu(entryFormsMenu);
          LoggingManager.LogDebugMessage_("AppsUtilities: Entry Forms submenu successfully attached.");
        } else {
          LoggingManager.LogError_("AppsUtilities: buildMenuFn returned null/undefined.");
        }
      }
    } else {
      LoggingManager.LogDebugMessage_("AppsUtilities: FormsEngine is disabled.");
    }
  } catch (e) {
    LoggingManager.LogError_("AppsUtilities: Failed to dynamically load FormsEngine menu: " + e.message + "\nStack: " + e.stack);
  }
}

/**
 * Menu trigger to capture current active cell formatting and save it as HEADER_FORMAT.
 */
function triggerSetHeaderFormat() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRange = sheet.getActiveCell();
    FormatManager.saveHeaderFormat(activeRange);
    SpreadsheetApp.getUi().alert("Formatting", "Header format successfully saved from active cell.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Formatting Error", "Failed to save header format: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu trigger to capture current active cell formatting and save it as RECORD_FORMAT.
 */
function triggerSetRecordFormat() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRange = sheet.getActiveCell();
    FormatManager.saveRecordFormat(activeRange);
    SpreadsheetApp.getUi().alert("Formatting", "Record format successfully saved from active cell.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Formatting Error", "Failed to save record format: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu trigger to reset all cached configurations from their source sheets.
 */
function triggerResetConfigurationCache() {
  try {
    ConfigurationManager.resetAllCacheValues();
    SpreadsheetApp.getUi().alert("Cache Reset", "Configuration cache successfully reset and updated.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Cache Error", "Failed to reset cache: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu trigger to rerun validation on currently selected rows in the active sheet.
 */
function triggerValidateSelectedRows() {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getActiveSheet();
    const activeRange = sheet.getActiveRange();
    
    ValidationContext.validateSelectedRange(spreadsheet, sheet, activeRange);
    
    SpreadsheetApp.getUi().alert("Validation Complete", "Validation successfully rerun for the selected rows.", SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Validation Error", "Failed to rerun validation: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu trigger to apply the stored HEADER_FORMAT to the active range.
 */
function triggerApplyHeaderFormat() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRange = sheet.getActiveRange();
    if (!activeRange) {
      throw new Error("No active range selected.");
    }
    FormatManager.applyHeaderFormat(activeRange);
    SpreadsheetApp.getActiveSpreadsheet().toast("Header format successfully applied to selected range.", "Formatting Success", 3);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Formatting Error", "Failed to apply header format: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Menu trigger to apply the stored RECORD_FORMAT to the active range.
 */
function triggerApplyRecordFormat() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const activeRange = sheet.getActiveRange();
    if (!activeRange) {
      throw new Error("No active range selected.");
    }
    FormatManager.applyRecordFormat(activeRange);
    SpreadsheetApp.getActiveSpreadsheet().toast("Record format successfully applied to selected range.", "Formatting Success", 3);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Formatting Error", "Failed to apply record format: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}
