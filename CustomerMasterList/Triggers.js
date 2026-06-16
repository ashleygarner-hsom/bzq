/**
 * Simple trigger that runs when the Customer Master List spreadsheet opens.
 * Delegates custom menu creation to the AppsUtilities core library.
 */
function onOpen() {
  AppsUtilities.onOpen(this);
}

/**
 * Simple trigger that runs when a cell is edited in the Customer Master List spreadsheet.
 * Delegates processing to the AppsUtilities core library.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function onEdit(e) {
  AppsUtilities.onEdit(e);
}

/**
 * Forwarding callback for the "Add record to page" menu item.
 */
function triggerAddRecordToActivePage() {
  AppsUtilities.triggerAddRecordToActivePage();
}

/**
 * Forwarding callback for the "Validate Selected" utility.
 */
function triggerValidateSelectedRows() {
  AppsUtilities.triggerValidateSelectedRows();
}

/**
 * Forwarding callback for the "Initialize Application" setup utility.
 */
function appInit_setupInstallableTrigger() {
  AppsUtilities.appInit_setupInstallableTrigger();
}

/**
 * Forwarding callback for the "Reset Configuration Cache" utility.
 */
function triggerResetConfigurationCache() {
  AppsUtilities.triggerResetConfigurationCache();
}

/**
 * Forwarding callback for the "Set header format" utility.
 */
function triggerSetHeaderFormat() {
  AppsUtilities.triggerSetHeaderFormat();
}

/**
 * Forwarding callback for the "Set record format" utility.
 */
function triggerSetRecordFormat() {
  AppsUtilities.triggerSetRecordFormat();
}

/**
 * Forwarding callback for the installable startup open trigger.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The open event object
 */
function appInit_onOpenInstallable(e) {
  AppsUtilities.appInit_onOpenInstallable(e);
}

/**
 * Forwarding callback for the installable cell edit trigger.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object
 */
function appInit_onEditInstallable(e) {
  AppsUtilities.appInit_onEditInstallable(e);
}

/**
 * Forwarding callback for server-side initialization step 1: Fetches branded logo URL.
 */
function appInit_getLogoUrl() {
  return AppsUtilities.appInit_getLogoUrl();
}

/**
 * Forwarding callback for server-side initialization step 2: Updates config cache.
 */
function appInit_updateCache() {
  return AppsUtilities.appInit_updateCache();
}

/**
 * Forwarding callback for server-side initialization step 3: Pre-caches object definitions.
 */
function appInit_preCacheObjects() {
  return AppsUtilities.appInit_preCacheObjects();
}

/**
 * Forwarding callback for server-side initialization step 4: Creates custom menus.
 */
function appInit_createMenus() {
  return AppsUtilities.appInit_createMenus(this);
}
