class FormsEngine {
  /**
   * Main entry point to call from the client project.
   * @param {string} objectName The name of the object to build a form for.
   */
  static getObjectForm_(objectName) {
    AppsUtilities.loggingManager_LogDebugMessage(`Object name: ${objectName}`);
    const formName = this.getFormName_(objectName);
    AppsUtilities.loggingManager_LogDebugMessage(`Form name: ${formName}`);
    // 2. Get Field Definitions
    const formFields = this.getFormDefinition_(formName, objectName);
    // 3. Prepare HTML
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
   * Retrieves the name of the form to use for the requested object name if the form is enabled
   * @param {string} The new of the object for which a form is needed
   * @return {string} The name of the form used in the configuration workbook
   * @throws {Error} Form either is not enabled or does not exist
   */
  static getFormName_(objectName){
    const formsList = SpreadsheetApp.openById(FormsEngineGlobalProperties.formsEngineWorkbookId_)
                                    .getSheetByName(FormsEngineGlobalProperties.formsListSheetName_)
                                    .getDataRange()
                                    .getValues();
    //Find the Form Definition
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
   * Retrieves the entire form definition from its page in the workbook
   * @input {string} formName - The name of the form as listed in the Forms sheet
   * @input {string} objectName - The name of the object correlating with the form
   * @returns {[any]} Array of objects, with each object containing data on a field in the requested form
   */
  static getFormDefinition_(formName, objectName){
    AppsUtilities.loggingManager_LogDebugMessage(`Getting defintion for form ${formName} for object ${objectName}`);
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
        //config.value = AppsUtilities.requestRecordIdForForm(objectName);
      } else if (type === "LOOKUP") {
        if (refObject){
          //Field is referencing a dynamic record list
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for object values for ${refObject}`);
          config.options = AppsUtilities.validationContext_getLookupRangeValuesForForm(refObject);
        }
        else if (refDropdown) {
          //Field references an explicit global dropdown of static values held in cofiguration
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for global values for ${refDropdown}`);
          config.options = AppsUtilities.validationContext_GetGlobalDropdown(refDropdown);
        }
        else {
          //Field is a static dropdown for just this object
          AppsUtilities.loggingManager_LogDebugMessage(`Looking for static values for ${field}`);
          config.options = AppsUtilities.validationContext_getObjectStaticDropdown(objectName, field);
        }
      }
      fields.push(config);
    }
    return fields;
  }
  /**
   * Handles form submission
   */
  static processFormSubmission(formData, objectName) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(objectName);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Check if there is an AUTOID field to populate upon submission
    const formName = this.getFormName_(objectName);
    const formFields = this.getFormDefinition_(formName, objectName);
    const autoIdField = formFields.find(f => f.type === "AUTOID");
    if (autoIdField) {
      formData[autoIdField.field] = AppsUtilities.requestRecordIdForForm(objectName);
    }
    
    const newRow = headers.map(header => formData[header] || "");
    sheet.appendRow(newRow);
    return "Success!";
  }
}
/** 
 * Include facilitates the use of the layout and header and footer files and can be used to pull in other sub-pages
 * Always be mindful of performance when calling multiple pages
 * @param {string} filename - name of the html file to render
 * @param {any} template - Any template data that needs to be piped into the rendered html
 */
function formsEngine_include(filename, templateData = null) {
  const template = HtmlService.createTemplateFromFile(filename);
  if (templateData) {
    Object.keys(templateData).forEach(key => { template[key] = templateData[key]; });
  }
  return template.evaluate().getContent();
}
/**
 * Used for testing during development
 */
function formsEngine_adHocTest(){
  AppsUtilities.loggingManager_LogDebugMessage(FormsEngine.getFormDefinition_("Create test object", "Test Object"));
}
/**
 * Primary method called to render form
 * @param {string} objectName - System (page) name of the object
 */
function formsEngine_doGetForm(objectName){
  const formPage = HtmlService.createTemplateFromFile("Layout");
  AppsUtilities.loggingManager_LogDebugMessage(objectName);
  formPage.objectName = objectName;
  SpreadsheetApp.getUi().showSidebar(formPage.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).setTitle(FormsEngine.getFormName_(objectName)));
}
/**
 * Wrapper for the static getObjectForm method, retrieves data needed for the form template to render the form
 * @param {string} objectName - Name of the object for which we are requesting a form.
 */
function formsEngine_getObjectForm(objectName){
  return FormsEngine.getObjectForm_(objectName);
}
