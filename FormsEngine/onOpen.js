function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Manage Business')
      .addItem('Test function', 'formsEngine_adHocTest')
      .addToUi();
}
