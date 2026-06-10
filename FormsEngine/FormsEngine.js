/**
 * The Forms Engine handles the retrieval of form configuration layouts,
 * rendering HTML input dialogs/sidebars dynamically, and routing form submissions.
 */
class FormsEngine {
  /**
   * Main entry point to call from the client project to fetch and render the form content.
   * @param {string} objectName - The name of the object to build a form for
   * @returns {string} The evaluated HTML string content of the form template
   */
  static getObjectForm_(objectName) {
    AppsUtilities.loggingManager_LogDebugMessage(`Object name: ${objectName}`);
    const formName = this.getFormName_(objectName);
    AppsUtilities.loggingManager_LogDebugMessage(`Form name: ${formName}`);
    
    // Get Field Definitions
    const formFields = this.getFormDefinition_(formName, objectName);
    
    // Prepare HTML
    const template = HtmlService.createTemplateFromFile('FormTemplate');
    template.fields = formFields;
    template.objectName = objectName;
    template.formName = formName;
    
    // Evaluate once to avoid redundant execution
    const evaluatedTemplate = template.evaluate()
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .setTitle(formName);
    const content = evaluatedTemplate.getContent();
    AppsUtilities.loggingManager_LogDebugMessage(`Template code: ${content}`);
    return content;
  }

  /**
   * Retrieves the name of the form to use for the requested object name if the form is enabled.
   * @param {string} objectName - The name of the object for which a form is needed
   * @returns {string} The name of the form used in the configuration workbook
   * @throws {Error} Form either is not enabled or does not exist
   */
  static getFormName_(objectName) {
    const formsList = SpreadsheetApp.openById(FormsEngineGlobalProperties.formsEngineWorkbookId_)
                                    .getSheetByName(FormsEngineGlobalProperties.formsListSheetName_)
                                    .getDataRange()
                                    .getValues();
    // Find the Form Definition
    let formName = "";
    let isEnabled = false;
    for (let i = 1; i < formsList.length; i++) {
      if (formsList[i][2] === objectName) {
        formName = formsList[i][3];
        isEnabled = formsList[i][4];
        break;
      }
    }
    if (!formName) throw new Error(`Form for ${objectName} not found.`);
    if (!isEnabled) throw new Error(`Form for ${objectName} is not enabled for use`);
    return formName;
  }

  /**
   * Retrieves the entire form definition from its page in the workbook.
   * @param {string} formName - The name of the form as listed in the Forms sheet
   * @param {string} objectName - The name of the object correlating with the form
   * @returns {Array<Object>} Array of field configuration objects
   */
  static getFormDefinition_(formName, objectName) {
    AppsUtilities.loggingManager_LogDebugMessage(`Getting definition for form ${formName} for object ${objectName}`);
    const formsWorkbookId = FormsEngineGlobalProperties.formsEngineWorkbookId_;
    const formsWorkbook = SpreadsheetApp.openById(formsWorkbookId);
    const formSheet = formsWorkbook.getSheetByName(formName);
    const formDataRange = formSheet.getDataRange();
    const defData = formDataRange.getValues();
    const fields = [];
    
    for (let j = 1; j < defData.length; j++) {
      let [field, displayName, type, refObject, refDropdown, validation] = defData[j];
      let config = { field, displayName, type, validation, options: [] };
      if (type === "AUTOID") {
        // AUTOID field values are generated upon insertion inside RecordManager
      } else if (type === "LOOKUP") {
        if (refObject) {
          // Field is referencing a dynamic record list
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for object values for ${refObject}`);
          config.options = AppsUtilities.validationContext_getLookupRangeValuesForForm(refObject);
        } else if (refDropdown) {
          // Field references an explicit global dropdown of static values held in configuration
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for global values for ${refDropdown}`);
          config.options = AppsUtilities.validationContext_GetGlobalDropdown(refDropdown);
        } else {
          // Field is a static dropdown for just this object
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for static values for ${field}`);
          config.options = AppsUtilities.validationContext_getObjectStaticDropdown(objectName, field);
        }
      }
      fields.push(config);
    }
    return fields;
  }

  /**
   * Handles form submission by piping data directly into the AppsUtilities RecordManager.
   * @param {Object} formData - The key-value representation of the form data
   * @param {string} objectName - The name of the object (correlating with the datasheet name)
   * @returns {string} Success confirmation message
   */
  static processFormSubmission(formData, objectName) {
    return AppsUtilities.recordManager_addRecord(objectName, formData);
  }

  /**
   * Builds the "Entry Forms" submenu for the spreadsheet UI.
   * Reads the Forms Engine spreadsheet to check which forms are enabled and dynamically populates the submenu.
   * Callback functions are dynamically bound to globalThis to satisfy Apps Script menu limitations.
   * @param {GoogleAppsScript.Base.Ui} ui - The Apps Script UI environment object
   * @returns {GoogleAppsScript.Base.Menu} The constructed Entry Forms submenu
   */
  static buildEntryFormsMenu(ui) {
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: buildEntryFormsMenu starting...");
    const menu = ui.createMenu('Entry Forms');
    const globalScope = globalThis;
    
    // Check if FormsEngine is running as a library
    const isLibrary = (typeof globalScope["formsEngine_buildEntryFormsMenu"] !== 'function');
    const prefix = isLibrary ? "FormsEngine." : "";
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: isLibrary=" + isLibrary + ", prefix=" + prefix);
    
    // Add default trigger to open form for active sheet (uses statically defined wrapper)
    const defaultFnName = prefix + "formsEngine_openActiveSheetForm";
    menu.addItem('Open Form for Active Sheet', defaultFnName);
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: Added default active sheet form menu item.");
    
    let enabledForms = null;
    try {
      const cached = CacheService.getScriptCache().get("config_forms_list");
      if (cached) {
        enabledForms = JSON.parse(cached);
        AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: Successfully loaded forms list from cache.");
      }
    } catch (e) {
      AppsUtilities.loggingManager_LogError("FormsEngine: Failed to read forms list from cache: " + e.message);
    }
    
    if (!enabledForms) {
      try {
        const workbookId = FormsEngineGlobalProperties.formsEngineWorkbookId_;
        const sheetName = FormsEngineGlobalProperties.formsListSheetName_;
        AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: Cache cold. Querying forms list from workbook ID: " + workbookId + ", sheet: " + sheetName);
        
        const formsList = SpreadsheetApp.openById(workbookId)
                                        .getSheetByName(sheetName)
                                        .getDataRange()
                                        .getValues();
        AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: Successfully fetched forms list from sheet. Row count: " + formsList.length);
        
        enabledForms = [];
        for (let i = 1; i < formsList.length; i++) {
          const objectName = formsList[i][2];
          const formName = formsList[i][3];
          const isEnabled = formsList[i][4];
          if (isEnabled && objectName && formName) {
            enabledForms.push({ objectName, formName });
          }
        }
        
        // Save to cache
        CacheService.getScriptCache().put("config_forms_list", JSON.stringify(enabledForms), 1500);
        AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: Saved enabled forms list to script cache.");
      } catch (e) {
        AppsUtilities.loggingManager_LogError("FormsEngine: Failed to query enabled forms list from sheet: " + e.message);
      }
    }
    
    if (enabledForms) {
      enabledForms.forEach(f => {
        const fnName = "formsEngine_openForm_" + f.formName.replace(/[^a-zA-Z0-9]/g, "_");
        const fullFnName = prefix + fnName;
        AppsUtilities.loggingManager_LogDebugMessage(`FormsEngine: Adding menu item ${f.formName} calling ${fullFnName}`);
        
        if (!isLibrary) {
          globalScope[fnName] = (function(obj) {
            return function() {
              formsEngine_doGetForm(obj);
            };
          })(f.objectName);
        }
        
        menu.addItem(f.formName, fullFnName);
      });
    }
    
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: buildEntryFormsMenu completed and returning menu.");
    return menu;
  }
}

/** 
 * Include facilitates the use of the layout, script, header, and footer HTML template files.
 * @param {string} filename - Name of the html file to render
 * @param {Object} [templateData] - Any template data to pipe into the rendered HTML
 * @returns {string} The rendered HTML content
 */
function formsEngine_include(filename, templateData = null) {
  const template = HtmlService.createTemplateFromFile(filename);
  if (templateData) {
    Object.keys(templateData).forEach(key => { template[key] = templateData[key]; });
  }
  return template.evaluate().getContent();
}

/**
 * Used for testing during development.
 */
function formsEngine_adHocTest() {
  AppsUtilities.loggingManager_LogDebugMessage(FormsEngine.getFormDefinition_("Create test object", "Test Object"));
}

/**
 * Primary method called to render form sidebar.
 * @param {string} objectName - System name of the object
 */
function formsEngine_doGetForm(objectName) {
  const formPage = HtmlService.createTemplateFromFile("Layout");
  AppsUtilities.loggingManager_LogDebugMessage(objectName);
  formPage.objectName = objectName;
  
  const title = FormsEngine.getFormName_(objectName);
  SpreadsheetApp.getUi().showSidebar(
    formPage.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle(title)
  );
}

/**
 * Wrapper for the static getObjectForm method, retrieves data needed for the form template to render.
 * @param {string} objectName - Name of the object for which we are requesting a form.
 * @returns {string} Evaluated HTML content
 */
function formsEngine_getObjectForm(objectName) {
  return FormsEngine.getObjectForm_(objectName);
}

/**
 * Global wrapper to build the Entry Forms menu.
 * @param {GoogleAppsScript.Base.Ui} ui - The spreadsheet UI object
 * @returns {GoogleAppsScript.Base.Menu} The Entry Forms menu
 */
function formsEngine_buildEntryFormsMenu(ui) {
  return FormsEngine.buildEntryFormsMenu(ui);
}

/**
 * Global wrapper to open a form for the active sheet.
 */
function formsEngine_openActiveSheetForm() {
  const activeSheetName = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet().getName();
  formsEngine_doGetForm(activeSheetName);
}

/**
 * Shared menu item callback handler.
 * Resolves the target form and opens it using the index.
 * Runs with AuthMode.FULL since it is invoked on user click.
 * @param {number} index - The index of the menu option clicked
 */
function formsEngine_openFormByIndex(index) {
  try {
    let forms = null;
    const cachedForms = CacheService.getScriptCache().get("config_forms_list");
    if (cachedForms) {
      forms = JSON.parse(cachedForms);
    } else {
      // Fallback: Cache is cold/expired. Query the spreadsheet to rebuild it.
      const workbookId = FormsEngineGlobalProperties.formsEngineWorkbookId_;
      const sheetName = FormsEngineGlobalProperties.formsListSheetName_;
      if (workbookId && sheetName) {
        const formsList = SpreadsheetApp.openById(workbookId)
                                        .getSheetByName(sheetName)
                                        .getDataRange()
                                        .getValues();
        forms = [];
        for (let i = 1; i < formsList.length; i++) {
          const objectName = formsList[i][2];
          const formName = formsList[i][3];
          const isEnabled = formsList[i][4];
          if (isEnabled && objectName && formName) {
            forms.push({ objectName, formName });
          }
        }
        CacheService.getScriptCache().put("config_forms_list", JSON.stringify(forms), 1500);
      }
    }

    if (forms && index >= 0 && index < forms.length) {
      formsEngine_doGetForm(forms[index].objectName);
    } else {
      throw new Error("Selected form configuration could not be resolved. Please reload the spreadsheet.");
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error Opening Form", "Failed to open form: " + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

// Static menu callback wrapper pool (0-49)
function formsEngine_openForm_0() { formsEngine_openFormByIndex(0); }
function formsEngine_openForm_1() { formsEngine_openFormByIndex(1); }
function formsEngine_openForm_2() { formsEngine_openFormByIndex(2); }
function formsEngine_openForm_3() { formsEngine_openFormByIndex(3); }
function formsEngine_openForm_4() { formsEngine_openFormByIndex(4); }
function formsEngine_openForm_5() { formsEngine_openFormByIndex(5); }
function formsEngine_openForm_6() { formsEngine_openFormByIndex(6); }
function formsEngine_openForm_7() { formsEngine_openFormByIndex(7); }
function formsEngine_openForm_8() { formsEngine_openFormByIndex(8); }
function formsEngine_openForm_9() { formsEngine_openFormByIndex(9); }
function formsEngine_openForm_10() { formsEngine_openFormByIndex(10); }
function formsEngine_openForm_11() { formsEngine_openFormByIndex(11); }
function formsEngine_openForm_12() { formsEngine_openFormByIndex(12); }
function formsEngine_openForm_13() { formsEngine_openFormByIndex(13); }
function formsEngine_openForm_14() { formsEngine_openFormByIndex(14); }
function formsEngine_openForm_15() { formsEngine_openFormByIndex(15); }
function formsEngine_openForm_16() { formsEngine_openFormByIndex(16); }
function formsEngine_openForm_17() { formsEngine_openFormByIndex(17); }
function formsEngine_openForm_18() { formsEngine_openFormByIndex(18); }
function formsEngine_openForm_19() { formsEngine_openFormByIndex(19); }
function formsEngine_openForm_20() { formsEngine_openFormByIndex(20); }
function formsEngine_openForm_21() { formsEngine_openFormByIndex(21); }
function formsEngine_openForm_22() { formsEngine_openFormByIndex(22); }
function formsEngine_openForm_23() { formsEngine_openFormByIndex(23); }
function formsEngine_openForm_24() { formsEngine_openFormByIndex(24); }
function formsEngine_openForm_25() { formsEngine_openFormByIndex(25); }
function formsEngine_openForm_26() { formsEngine_openFormByIndex(26); }
function formsEngine_openForm_27() { formsEngine_openFormByIndex(27); }
function formsEngine_openForm_28() { formsEngine_openFormByIndex(28); }
function formsEngine_openForm_29() { formsEngine_openFormByIndex(29); }
function formsEngine_openForm_30() { formsEngine_openFormByIndex(30); }
function formsEngine_openForm_31() { formsEngine_openFormByIndex(31); }
function formsEngine_openForm_32() { formsEngine_openFormByIndex(32); }
function formsEngine_openForm_33() { formsEngine_openFormByIndex(33); }
function formsEngine_openForm_34() { formsEngine_openFormByIndex(34); }
function formsEngine_openForm_35() { formsEngine_openFormByIndex(35); }
function formsEngine_openForm_36() { formsEngine_openFormByIndex(36); }
function formsEngine_openForm_37() { formsEngine_openFormByIndex(37); }
function formsEngine_openForm_38() { formsEngine_openFormByIndex(38); }
function formsEngine_openForm_39() { formsEngine_openFormByIndex(39); }
function formsEngine_openForm_40() { formsEngine_openFormByIndex(40); }
function formsEngine_openForm_41() { formsEngine_openFormByIndex(41); }
function formsEngine_openForm_42() { formsEngine_openFormByIndex(42); }
function formsEngine_openForm_43() { formsEngine_openFormByIndex(43); }
function formsEngine_openForm_44() { formsEngine_openFormByIndex(44); }
function formsEngine_openForm_45() { formsEngine_openFormByIndex(45); }
function formsEngine_openForm_46() { formsEngine_openFormByIndex(46); }
function formsEngine_openForm_47() { formsEngine_openFormByIndex(47); }
function formsEngine_openForm_48() { formsEngine_openFormByIndex(48); }
function formsEngine_openForm_49() { formsEngine_openFormByIndex(49); }
