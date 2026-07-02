/**
 * Extension module of FormsEngine.
 * Compiles dynamic business object form schemas into native Google Workspace CardService widgets.
 */
class CardTranslationLayer {
  /**
   * Translates a compiled form definition array into a native Google Workspace Card.
   * @param {string} title - Title of the card.
   * @param {Object[]} fields - Mapped field definition configurations.
   * @returns {CardService.Card} The compiled Card UI object.
   */
  static compileToCard(title, fields) {
    const card = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle(title));
    const section = CardService.newCardSection();

    fields.forEach(fieldDef => {
      this.addFieldWidget_(section, fieldDef);
    });
    
    section.addWidget(CardService.newTextButton()
      .setText("Submit Form")
      .setOnClickAction(CardService.newAction().setFunctionName("handleCardSubmit")));

    return card.addSection(section).build();
  }

  /**
   * Translates a single field configuration and appends it to the card section.
   * @param {CardService.CardSection} section - The active card section.
   * @param {Object} def - Field configuration details { field, displayName, type, options }.
   * @returns {void}
   * @private
   */
  static addFieldWidget_(section, def) {
    if (def.type === "TEXT" || def.type === "NUMBER") {
      section.addWidget(CardService.newTextInput()
        .setFieldName(def.field)
        .setTitle(def.displayName));
    } else if (def.type === "LOOKUP") {
      section.addWidget(this.buildDropdownWidget_(def));
    }
  }

  /**
   * Helper to build a CardService SelectionInput dropdown widget.
   * @param {Object} def - Field configuration details containing options.
   * @returns {CardService.SelectionInput} The dropdown selection widget.
   * @private
   */
  static buildDropdownWidget_(def) {
    const dropdown = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setFieldName(def.field)
      .setTitle(def.displayName);
      
    if (Array.isArray(def.options)) {
      def.options.forEach(opt => {
        dropdown.addItem(String(opt), String(opt), false);
      });
    }
    return dropdown;
  }
}
