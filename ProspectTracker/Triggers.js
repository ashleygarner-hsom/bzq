/**
 * Simple trigger that runs when the Prospect Tracker spreadsheet opens.
 * Delegates custom menu creation to the AppsUtilities core library.
 * @returns {void}
 */
function onOpen() {
  AppsUtilities.onOpen(this);
}

/**
 * Simple trigger that runs when a cell is edited in the Prospect Tracker spreadsheet.
 * Delegates processing to the AppsUtilities core library.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object.
 * @returns {void}
 */
function onEdit(e) {
  AppsUtilities.onEdit(e);
}

/**
 * Forwarding callback for the "Add record to page" menu item.
 * @returns {void}
 */
function triggerAddRecordToActivePage() {
  AppsUtilities.triggerAddRecordToActivePage();
}

/**
 * Forwarding callback for the "Validate Selected" utility.
 * @returns {void}
 */
function triggerValidateSelectedRows() {
  AppsUtilities.triggerValidateSelectedRows();
}

/**
 * Forwarding callback for the "Initialize Application" setup utility.
 * @returns {void}
 */
function appInit_setupInstallableTrigger() {
  AppsUtilities.appInit_setupInstallableTrigger();
}

/**
 * Forwarding callback for the "Reset Configuration Cache" utility.
 * @returns {void}
 */
function triggerResetConfigurationCache() {
  AppsUtilities.triggerResetConfigurationCache();
}

/**
 * Forwarding callback for the "Set header format" utility.
 * @returns {void}
 */
function triggerSetHeaderFormat() {
  AppsUtilities.triggerSetHeaderFormat();
}

/**
 * Forwarding callback for the "Set record format" utility.
 * @returns {void}
 */
function triggerSetRecordFormat() {
  AppsUtilities.triggerSetRecordFormat();
}

/**
 * Forwarding callback for the "Apply Header Format" utility.
 * @returns {void}
 */
function triggerApplyHeaderFormat() {
  AppsUtilities.triggerApplyHeaderFormat();
}

/**
 * Forwarding callback for the "Apply Record Format" utility.
 * @returns {void}
 */
function triggerApplyRecordFormat() {
  AppsUtilities.triggerApplyRecordFormat();
}

/**
 * Forwarding callback for the installable startup open trigger.
 * @param {GoogleAppsScript.Events.SheetsOnOpen} e - The open event object.
 * @returns {void}
 */
function appInit_onOpenInstallable(e) {
  AppsUtilities.appInit_onOpenInstallable(e);
}

/**
 * Forwarding callback for the installable cell edit trigger.
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e - The edit event object.
 * @returns {void}
 */
function appInit_onEditInstallable(e) {
  AppsUtilities.appInit_onEditInstallable(e);
}

/**
 * Forwarding callback for server-side initialization step 1: Fetches branded logo URL.
 * @returns {string} Branded logo URL.
 */
function appInit_getLogoUrl() {
  return AppsUtilities.appInit_getLogoUrl();
}

/**
 * Forwarding callback for server-side initialization step 2: Updates config cache.
 * @returns {boolean} True indicating success.
 */
function appInit_updateCache() {
  return AppsUtilities.appInit_updateCache();
}

/**
 * Forwarding callback for server-side initialization step 3: Pre-caches object definitions.
 * @returns {boolean} True indicating completion.
 */
function appInit_preCacheObjects() {
  return AppsUtilities.appInit_preCacheObjects();
}

/**
 * Forwarding callback for server-side initialization step 4: Creates custom menus.
 * @returns {boolean} True indicating completion.
 */
function appInit_createMenus() {
  return AppsUtilities.appInit_createMenus(this);
}
