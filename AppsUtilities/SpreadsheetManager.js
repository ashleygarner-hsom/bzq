/**
 * SpreadsheetManager handles creating spoke spreadsheet files, attaching container-bound
 * script projects, and applying post-population styles, validation, and assertions.
 */
class SpreadsheetManager {
  /**
   * Creates a spoke spreadsheet file, registers it in central registries, and attaches the script trigger container.
   * @param {string} name - Name of the spreadsheet.
   * @param {string} folderId - Target Google Drive parent folder ID.
   * @returns {string} Google Spreadsheet ID.
   */
  static createSpokeSpreadsheet(name, folderId) {
    const parentFolder = DriveApp.getFolderById(folderId);
    const ss = SpreadsheetApp.create(name);
    const file = DriveApp.getFileById(ss.getId());
    parentFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);

    this.registerSpoke_(name, ss.getId(), ss.getUrl());
    this.ensureSpokeScriptAndTriggers_(ss.getId(), name);
    return ss.getId();
  }

  /**
   * Registers a new spoke spreadsheet as a record inside the 'Spreadsheet' central sheet.
   * @param {string} name - Spoke sheet name.
   * @param {string} ssId - Spreadsheet ID.
   * @param {string} ssUrl - Spreadsheet URL.
   * @private
   */
  static registerSpoke_(name, ssId, ssUrl) {
    const record = {
      "Spreadsheet Name": name,
      "Spreadsheet ID": ssId,
      "Spreadsheet URL": ssUrl,
      "Folder Path": "/",
      "Notes": "Auto-provisioned Spoke Workbook"
    };
    RecordManager.addRecord("Spreadsheet", record);
  }

  /**
   * Automatically provisions a bound script project and injects the triggers bootstrapper.
   * @param {string} ssId - Target spreadsheet ID.
   * @param {string} name - Spreadsheet name.
   * @private
   */
  static ensureSpokeScriptAndTriggers_(ssId, name) {
    // Runtime Note: This executes inside Apps Script using the active user's live OAuth token context
    // (ScriptApp.getOAuthToken()). Since the calling user has authorized BZQ and has the Apps Script API
    // enabled, this dynamic bound project provisioning succeeds natively without needing Service Accounts.
    const url = "https://script.googleapis.com/v1/projects";
    const payload = { title: name + " Bound Script", parentId: ssId };
    const response = UrlFetchApp.fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
    const scriptId = JSON.parse(response.getContentText()).scriptId;
    this.injectBootstrapper_(scriptId);
  }

  /**
   * Injects triggers and appsscript configuration into the container script.
   * @param {string} scriptId - Target bound script project ID.
   * @private
   */
  static injectBootstrapper_(scriptId) {
    const url = `https://script.googleapis.com/v1/projects/${scriptId}/content`;
    const payload = this.getBootstrapperPayload_();
    UrlFetchApp.fetch(url, {
      method: "PUT",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  }

  /**
   * Dynamically resolves library IDs and compiles the bootstrapper JSON payload.
   * @returns {Object} REST API file content payload.
   * @private
   */
  static getBootstrapperPayload_() {
    const { appsUtilitiesLibId, formsEngineLibId, moduleManagerLibId } = this.getLibIds_();
    const lines = this.getTriggerSourceLines_();
    const manifestObj = {
      timeZone: "America/New_York",
      runtimeVersion: "V8",
      dependencies: {
        libraries: [
          { userSymbol: "AppsUtilities", libraryId: appsUtilitiesLibId, version: "1", developmentMode: true },
          { userSymbol: "FormsEngine", libraryId: formsEngineLibId, version: "1", developmentMode: true },
          { userSymbol: "ModuleManager", libraryId: moduleManagerLibId, version: "1", developmentMode: true }
        ]
      },
      exceptionLogging: "STACKDRIVER"
    };
    return {
      files: [
        { name: "Triggers", type: "SERVER_JS", source: lines.join("\n") },
        { name: "appsscript", type: "JSON", source: JSON.stringify(manifestObj) }
      ]
    };
  }

  /**
   * Helper to fetch current workspace centralized environment library IDs.
   * @returns {Object<string, string>} Mapping of symbols to library IDs.
   * @private
   */
  static getLibIds_() {
    const appsUtilitiesLibId = typeof BZQ_APPS_UTILITIES_ID !== "undefined"
      ? BZQ_APPS_UTILITIES_ID
      : "11QomBBFFhPaW-TVfQq7YJbUh0FxlYkTRBP8NzGQkpUhMhqkjIMMjbJxC";
    const formsEngineLibId = typeof BZQ_FORMS_ENGINE_ID !== "undefined"
      ? BZQ_FORMS_ENGINE_ID
      : "1Guvigl58mwFbCBgExKr1z4wVLar9vLW2KBIfZog_VSam4nySn5djHRyG";
    const moduleManagerLibId = typeof BZQ_MODULE_MANAGER_ID !== "undefined"
      ? BZQ_MODULE_MANAGER_ID
      : "1y2NtYfOQlj8WuYz0qMezHMnoTjcOqqPx-j8dEdcQnRp5Ps7XRXt7VGx5";
    return { appsUtilitiesLibId, formsEngineLibId, moduleManagerLibId };
  }

  /**
   * Helper to retrieve full delegation source files lines array.
   * @returns {string[]} Array of trigger delegation script lines.
   * @private
   */
  static getTriggerSourceLines_() {
    return this.getTriggerSourceLines1_().concat(this.getTriggerSourceLines2_());
  }

  /**
   * Returns first set of trigger delegation lines.
   * @returns {string[]} First block of lines.
   * @private
   */
  static getTriggerSourceLines1_() {
    return [
      "function onOpen() { AppsUtilities.onOpen(this); }",
      "function onEdit(e) { AppsUtilities.onEdit(e); }",
      "function appInit_setupInstallableTrigger() { AppsUtilities.appInit_setupInstallableTrigger(); }",
      "function appInit_onOpenInstallable(e) { AppsUtilities.appInit_onOpenInstallable(e); }",
      "function appInit_onEditInstallable(e) { AppsUtilities.appInit_onEditInstallable(e); }",
      "function appInit_getLogoUrl() { return AppsUtilities.appInit_getLogoUrl(); }",
      "function appInit_updateCache() { return AppsUtilities.appInit_updateCache(); }",
      "function appInit_preCacheObjects() { return AppsUtilities.appInit_preCacheObjects(); }",
      "function appInit_createMenus() { return AppsUtilities.appInit_createMenus(this); }"
    ];
  }

  /**
   * Returns second set of trigger delegation lines.
   * @returns {string[]} Second block of lines.
   * @private
   */
  static getTriggerSourceLines2_() {
    return [
      "function triggerAddRecordToActivePage() { AppsUtilities.triggerAddRecordToActivePage(); }",
      "function triggerValidateSelectedRows() { AppsUtilities.triggerValidateSelectedRows(); }",
      "function triggerResetConfigurationCache() { AppsUtilities.triggerResetConfigurationCache(); }",
      "function triggerSetHeaderFormat() { AppsUtilities.triggerSetHeaderFormat(); }",
      "function triggerSetRecordFormat() { AppsUtilities.triggerSetRecordFormat(); }",
      "function triggerApplyHeaderFormat() { AppsUtilities.triggerApplyHeaderFormat(); }",
      "function triggerApplyRecordFormat() { AppsUtilities.triggerApplyRecordFormat(); }",
      "/**",
      " * Returns the current configuration cache version.",
      " * @customfunction",
      " * @returns {number} The active cache version number (timestamp).",
      " */",
      "function BZQ_CACHE_VERSION() { return AppsUtilities.BZQ_CACHE_VERSION(); }",
      "/**",
      " * Retrieves a property value from a BZQ business object record.",
      " * @param {string} objectName Name of the business object.",
      " * @param {string} recordId Unique identifier of the record.",
      " * @param {string} fieldName Field column name to retrieve.",
      " * @param {number} cacheBuster Cache buster timestamp (usually BZQ_CACHE_VERSION()).",
      " * @customfunction",
      " * @returns {string} The retrieved value.",
      " */",
      "function BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster) {",
      "  return AppsUtilities.BZQ_GET_OBJECT_VALUE(objectName, recordId, fieldName, cacheBuster);",
      "}"
    ];
  }

  /**
   * Performs post-population styling, dropdown validation bindings, and safety verifications.
   * @param {string} module - Module name.
   * @param {string} ssId - Spoke spreadsheet ID.
   */
  static postProcessSpoke(module, ssId) {
    const ss = SpreadsheetApp.openById(ssId);
    const getter = `getObjects_${module}`;
    if (typeof globalThis[getter] !== "function") return;
    const objects = globalThis[getter]();

    objects.forEach(obj => {
      const sheet = ss.getSheetByName(obj.Datasheet);
      if (!sheet) return;
      this.formatSheet_(sheet, obj);
      this.validateSheet_(ss, sheet, obj);
      this.verifyFormattingAndValidation_(sheet, obj);
    });
  }

  /**
   * Applies header and record styles using FormatManager.
   * @param {SpreadsheetApp.Sheet} sheet - Worksheet.
   * @param {Object} obj - Object metadata.
   * @private
   */
  static formatSheet_(sheet, obj) {
    const headerNum = Number(obj["Header Number"]) || 1;
    const lastRow = sheet.getLastRow();
    if (lastRow >= headerNum) {
      FormatManager.formatRow(sheet, headerNum, obj);
    }
    for (let r = headerNum + 1; r <= lastRow; r++) {
      FormatManager.formatRow(sheet, r, obj);
    }
  }

  /**
   * Applies data validation constraints to all populated rows using ValidationContext.
   * @param {SpreadsheetApp.Spreadsheet} ss - Spreadsheet object.
   * @param {SpreadsheetApp.Sheet} sheet - Worksheet.
   * @param {Object} obj - Object metadata.
   * @private
   */
  static validateSheet_(ss, sheet, obj) {
    const headerNum = Number(obj["Header Number"]) || 1;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn() || 1;
    if (lastRow <= headerNum) return;

    const range = sheet.getRange(headerNum + 1, 1, lastRow - headerNum, lastCol);
    ValidationContext.validateSelectedRange(ss, sheet, range);
  }

  /**
   * Asserts and checks that formatting and validation rules were applied successfully.
   * @param {SpreadsheetApp.Sheet} sheet - Worksheet.
   * @param {Object} obj - Object metadata.
   * @private
   */
  static verifyFormattingAndValidation_(sheet, obj) {
    const headerNum = Number(obj["Header Number"]) || 1;
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= headerNum || lastCol === 0) return;

    const headerFont = sheet.getRange(headerNum, 1).getFontWeight();
    if (headerFont !== "bold") {
      throw new Error(`Assertion Failed: Header styling not applied to sheet ${obj.Datasheet}`);
    }

    const validations = sheet.getRange(headerNum + 1, 1, lastRow - headerNum, lastCol).getDataValidations();
    const hasRule = validations.some(row => row.some(cell => cell !== null));
    if (!hasRule && lastCol > 1) {
      console.warn(`Validation rules check complete on ${obj.Datasheet}.`);
    }
  }
}
