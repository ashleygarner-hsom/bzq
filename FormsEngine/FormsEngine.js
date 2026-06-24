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
    
    const template = HtmlService.createTemplateFromFile('FormTemplate');
    template.fields = this.getFormDefinition_(formName, objectName);
    template.objectName = objectName;
    template.formName = formName;
    
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
   * Resolves options list for a LOOKUP field.
   * @private
   */
  static resolveLookupField_(type, refObject, refDropdown, field, objectName) {
    if (refObject) {
      AppsUtilities.loggingManager_LogDebugMessage(`Looking for object values for ${refObject}`);
      return AppsUtilities.validationContext_getLookupRangeValuesForForm(refObject);
    }
    if (refDropdown) {
      AppsUtilities.loggingManager_LogDebugMessage(`Looking for global values for ${refDropdown}`);
      return AppsUtilities.validationContext_GetGlobalDropdown(refDropdown);
    }
    AppsUtilities.loggingManager_LogDebugMessage(`Looking for static values for ${field}`);
    return AppsUtilities.validationContext_getObjectStaticDropdown(objectName, field);
  }

  /**
   * Retrieves the entire form definition from its page in the workbook.
   * @param {string} formName - The name of the form as listed in the Forms sheet
   * @param {string} objectName - The name of the object correlating with the form
   * @returns {Array<Object>} Array of field configuration objects
   */
  static getFormDefinition_(formName, objectName) {
    AppsUtilities.loggingManager_LogDebugMessage(`Getting definition for form ${formName} for object ${objectName}`);
    const defData = SpreadsheetApp.openById(FormsEngineGlobalProperties.formsEngineWorkbookId_)
                                  .getSheetByName(formName)
                                  .getDataRange()
                                  .getValues();
    const fields = [];
    for (let j = 1; j < defData.length; j++) {
      const [field, displayName, type, refObject, refDropdown, validation] = defData[j];
      const config = { field, displayName, type, validation, options: [] };
      if (type === "LOOKUP") {
        config.options = this.resolveLookupField_(type, refObject, refDropdown, field, objectName);
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
   * Registers the static entry forms triggers.
   * @param {GoogleAppsScript.Base.Ui} ui - The Apps Script UI environment object
   * @returns {GoogleAppsScript.Base.Menu} The constructed Entry Forms submenu
   */
  static buildEntryFormsMenu(ui) {
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: buildEntryFormsMenu starting...");
    const menu = ui.createMenu('Entry Forms');
    const globalScope = globalThis;
    
    const isLibrary = (typeof globalScope["formsEngine_buildEntryFormsMenu"] !== 'function');
    const prefix = isLibrary ? "FormsEngine." : "";
    AppsUtilities.loggingManager_LogDebugMessage("FormsEngine: isLibrary=" + isLibrary + ", prefix=" + prefix);
    
    menu.addItem('New Record on This Sheet', prefix + 'formsEngine_openActiveSheetForm')
        .addItem('Create Record...', prefix + 'formsEngine_showFormPicker');
        
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
 * @deprecated Deprecated on 2026-06-24. Will be obsolete and safe to remove on or after 2026-12-24.
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
 * Global wrapper to process form submissions.
 * @param {Object} formData - The key-value representation of the form data
 * @param {string} objectName - Name of the object/datasheet
 * @returns {string} Success confirmation message
 */
function formsEngine_processFormSubmission(formData, objectName) {
  return FormsEngine.processFormSubmission(formData, objectName);
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
 * Global wrapper to show the Form Picker in the sidebar.
 */
function formsEngine_showFormPicker() {
  const formPage = HtmlService.createTemplateFromFile("FormPicker");
  SpreadsheetApp.getUi().showSidebar(
    formPage.evaluate()
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setTitle("Create Record")
  );
}

/**
 * Global wrapper to get the list of enabled forms.
 * @returns {Array<Object>} List of form configurations
 */
function formsEngine_getEnabledFormsList() {
  try {
    const formsList = SpreadsheetApp.openById(FormsEngineGlobalProperties.formsEngineWorkbookId_)
                                    .getSheetByName(FormsEngineGlobalProperties.formsListSheetName_)
                                    .getDataRange()
                                    .getValues();
    const enabledForms = [];
    for (let i = 1; i < formsList.length; i++) {
      const [,, objectName, formName, isEnabled] = formsList[i];
      if (isEnabled && objectName && formName) {
        enabledForms.push({ objectName, formName });
      }
    }
    return enabledForms;
  } catch (e) {
    AppsUtilities.loggingManager_LogError("FormsEngine: Failed to get enabled forms list: " + e.message);
    throw new Error("Unable to retrieve available forms. Please verify your configuration.");
  }
}
