/**
 * Renders the default homepage for the Google Workspace Add-on.
 * @param {Object} e - The event object from Workspace Add-on framework.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onAddonHomepage(e) {
  try {
    const configId = SpreadsheetRegistry.resolveConfigId();
    if (!configId) {
      return buildSetupCard("Configuration Spreadsheet not found.");
    }
    const isShared = SpreadsheetRegistry.isConfigInSharedDrive(configId);
    return buildMainMenuCard(configId, !isShared);
  } catch (err) {
    return buildSetupCard(err.message);
  }
}

/**
 * Renders the contextual homepage for Google Sheets editor.
 * @param {Object} e - The event object.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onSheetsHomepage(e) {
  return onAddonHomepage(e);
}

/**
 * Renders the contextual homepage for Google Drive.
 * @param {Object} e - The event object.
 * @returns {CardService.Card} The constructed Card UI object.
 */
function onDriveHomepage(e) {
  return onAddonHomepage(e);
}

/**
 * Handles contextual trigger when items are selected in Drive.
 * @param {Object} e - The event object containing selected item details.
 * @returns {CardService.Card} The contextual Card UI object.
 */
function onDriveItemsSelected(e) {
  if (!e || !e.drive || !e.drive.activeCursorItem) {
    return buildSetupCard("No item selected.");
  }
  const item = e.drive.activeCursorItem;
  const section = CardService.newCardSection()
    .setHeader("Selected File Context");
    
  section.addWidget(CardService.newKeyValue()
    .setTopLabel("File Name")
    .setContent(item.title)
    .setBottomLabel("Mime Type: " + item.mimeType));
    
  return CardService.newCardBuilder()
    .addSection(section)
    .build();
}

/**
 * Builds the initial configuration wizard card.
 * Guides user through automatic provisioning or custom Shared Drive folder entry.
 * @param {string} errorMsg - Error status description message.
 * @returns {CardService.Card} Setup Card UI object.
 */
function buildSetupCard(errorMsg) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ ERP Setup Wizard"));
  const sec = CardService.newCardSection()
    .setHeader("Initialization Error")
    .addWidget(CardService.newTextParagraph().setText("Status: " + errorMsg));

  sec.addWidget(CardService.newTextButton()
    .setText("Auto-Create Config in My Drive")
    .setOnClickAction(CardService.newAction().setFunctionName("handleAutoProvision")));
    
  sec.addWidget(CardService.newTextInput()
    .setFieldName("sharedFolderId")
    .setTitle("Or: Enter Shared Drive Folder ID"));
    
  sec.addWidget(CardService.newTextButton()
    .setText("Provision in Shared Folder")
    .setOnClickAction(CardService.newAction().setFunctionName("handleSharedFolderProvision")));

  return card.addSection(sec).build();
}

/**
 * Action callback to auto-provision configuration properties.
 * Creates file in My Drive.
 * @param {Object} e - Click event parameters.
 * @returns {CardService.ActionResponse} Navigation action response.
 */
function handleAutoProvision(e) {
  try {
    const configId = SpreadsheetRegistry.createConfigurationSpreadsheet(null);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildMainMenuCard(configId, true)))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSetupCard("Provision failed: " + err.message)))
      .build();
  }
}

/**
 * Action callback to provision configuration inside a Shared Drive folder.
 * @param {Object} e - Click event parameters containing input fields.
 * @returns {CardService.ActionResponse} Navigation action response.
 */
function handleSharedFolderProvision(e) {
  const folderId = e.formInput.sharedFolderId;
  if (!folderId) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSetupCard("Folder ID cannot be empty.")))
      .build();
  }
  try {
    const configId = SpreadsheetRegistry.createConfigurationSpreadsheet(folderId);
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildMainMenuCard(configId, false)))
      .build();
  } catch (err) {
    return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildSetupCard("Shared folder provision failed: " + err.message)))
      .build();
  }
}

/**
 * Constructs the primary navigation menu once configuration is resolved.
 * @param {string} configId - The central configuration spreadsheet ID.
 * @returns {CardService.Card} Navigation Card UI.
 */
function buildMainMenuCard(configId, isPersonalDrive = false) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Main Menu"));
  const section = CardService.newCardSection();

  if (isPersonalDrive) {
    section.addWidget(CardService.newTextParagraph().setText(
      "⚠️ WARNING: Config created in My Drive. Shared access is disabled. " +
      "We recommend moving the file to a Shared Drive."
    ));
  }
  
  section.addWidget(CardService.newKeyValue()
    .setTopLabel("Configuration Database")
    .setContent("Connected: BZQ_Tenant_Configuration")
    .setBottomLabel("ID: " + configId.substring(0, 12) + "..."));
      
  section.addWidget(CardService.newTextButton()
    .setText("Manage Modules")
    .setOnClickAction(CardService.newAction().setFunctionName("handleShowModules")));
    
  return card.addSection(section).build();
}

/**
 * Renders the list of active/inactive modules.
 * @param {Object} e - Click event parameters.
 * @returns {CardService.Card} Module management card.
 */
function handleShowModules(e) {
  const card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("BZQ Modules"));
  const section = CardService.newCardSection();
  
  // Standard list of modules in BZQ
  const modules = ["Sales Manager", "Accounting Manager", "Vendor Management", "POS Engine"];
  modules.forEach(mod => {
    section.addWidget(CardService.newKeyValue()
      .setTopLabel("Module Name")
      .setContent(mod)
      .setBottomLabel("Status: Active"));
  });
  
  return card.addSection(section).build();
}
