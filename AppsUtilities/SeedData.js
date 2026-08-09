/**
 * Returns the embedded AppsUtilities seed configuration payload.
 * @returns {Object} Seeding configuration schema.
 */
function getSeedData_AppsUtilities() {
  return {
    "ConfigurationProperties": [
      [
        "Configuration Key",
        "Value",
        "Notes"
      ],
      [
        "DEBUG_MODE",
        true,
        "Set to true to turn on debug level logging"
      ],
      [
        "ProcessValidation_ENABLED",
        true,
        "Enables BZQs data validation process for all objects that have validation enabled"
      ],
      [
        "HEADER_FORMAT",
        "{\"background\":\"#d9d9d9\",\"fontColor\":\"#000000\",\"fontFamily\":\"Arial\",\"fontSize\":10,\"fontWeight\":\"bold\",\"fontStyle\":\"normal\",\"fontLine\":\"none\",\"horizontalAlignment\":\"center\",\"verticalAlignment\":\"bottom\"}",
        "Header styling format"
      ],
      [
        "RECORD_FORMAT",
        "{\"background\":\"#ffffff\",\"fontColor\":\"#000000\",\"fontFamily\":\"Arial\",\"fontSize\":10,\"fontWeight\":\"normal\",\"fontStyle\":\"normal\",\"fontLine\":\"none\",\"horizontalAlignment\":\"general-left\",\"verticalAlignment\":\"bottom\",\"borders\":{\"top\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"bottom\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"left\":{\"style\":\"SOLID\",\"color\":\"#000000\"},\"right\":{\"style\":\"SOLID\",\"color\":\"#000000\"}}}",
        "Record cell styling format"
      ]
    ],
    "SequenceConfiguration": [
      [
        "Sequence",
        "Sequence Number",
        "Sequence Name",
        "Datasheet Name",
        "Sequence Prefix",
        "Starting Number",
        "Format",
        "Current Value",
        "Enabled"
      ],
      [
        "=arrayformula(if(not(isblank(B2:B)),if(not(isblank(C2:C)),text(B2:B,\"0000#\") & \" - \" & C2:C,),))",
        "xSC-10000",
        "Sequence",
        "SequenceConfiguration",
        "xSC-",
        10000,
        "0000#",
        10000,
        true
      ],
      [
        "",
        "xSC-10001",
        "Objects",
        "ObjectConfiguration",
        "xOC-",
        1000,
        "000#",
        1000,
        true
      ],
      [
        "",
        "xSC-10002",
        "Object Relations",
        "LookupConfiguration",
        "xLC-",
        10000,
        "0000#",
        10000,
        true
      ],
      [
        "",
        "xSC-10003",
        "Static Dropdowns",
        "DropdownConfiguration",
        "xDC-",
        10000,
        "0000#",
        10000,
        true
      ],
      [
        "",
        "xSC-10004",
        "Global Dropdowns",
        "GlobalDropdownConfiguration",
        "xGD-",
        10000,
        "0000#",
        10000,
        true
      ],
      [
        "",
        "xSC-10005",
        "Spreadsheets",
        "Spreadsheets",
        "xSS-",
        1000,
        "000#",
        1000,
        true
      ]
    ],
    "ObjectConfiguration": [
      [
        "Object",
        "Object Number",
        "Object Name",
        "Datasheet",
        "Enabled For Validation",
        "Spreadsheet",
        "Spreadsheet Id",
        "Spreadsheet Url",
        "Primary Fields",
        "Id Field Name",
        "Header Number",
        "Sequence",
        "Custom Line Trigger"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xOC-1000",
        "Sequence",
        "SequenceConfiguration",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "=ARRAYFORMULA(if(not(isblank(G2:G)),\"https://docs.google.com/spreadsheets/d/\"&G2:G,\"\"))",
        "Sequence Name",
        "Sequence Number",
        1,
        "xSC-10000 - Sequence",
        ""
      ],
      [
        "",
        "xOC-1001",
        "Object",
        "ObjectConfiguration",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "",
        "Object Name",
        "Object Number",
        1,
        "xSC-10001 - Objects",
        ""
      ],
      [
        "",
        "xOC-1002",
        "Lookup",
        "LookupConfiguration",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "",
        "Lookup Name",
        "Lookup Number",
        1,
        "xSC-10002 - Object Relations",
        ""
      ],
      [
        "",
        "xOC-1003",
        "Dropdown",
        "DropdownConfiguration",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "",
        "Dropdown Name",
        "Dropdown Number",
        1,
        "xSC-10003 - Static Dropdowns",
        ""
      ],
      [
        "",
        "xOC-1003",
        "Dropdown",
        "DropdownConfiguration",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "",
        "Dropdown Name",
        "Dropdown Number",
        1,
        "xSC-10003 - Static Dropdowns",
        ""
      ],
      [
        "",
        "xOC-1004",
        "Spreadsheet",
        "Spreadsheets",
        true,
        "xSS-1000 - BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "",
        "Spreadsheet Name",
        "Spreadsheet Number",
        1,
        "xSC-10005 - Spreadsheets",
        ""
      ]
    ],
    "LookupConfiguration": [
      [
        "Lookup",
        "Lookup Number",
        "Lookup Name",
        "Source Object",
        "Target Object",
        "Column Name"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xLC-10000",
        "=ARRAYFORMULA(if(not(isblank(D2:D)),if(not(isblank(E2:E)),D2:D&\" lookup to \"&E2:E,\"\"),\"\"))",
        "xOC-1002 - Object",
        "xOC-1006 - Spreadsheet",
        "Spreadsheet"
      ],
      [
        "",
        "xLC-10001",
        "",
        "xOC-1002 - Object",
        "xOC-1001 - Sequence",
        "Sequence"
      ],
      [
        "",
        "xLC-10002",
        "",
        "xOC-1004 - Dropdown",
        "xOC-1002 - Object",
        "Source Object"
      ],
      [
        "",
        "xLC-10003",
        "",
        "xOC-1004 - Dropdown",
        "xOC-1002 - Object",
        "Target Object"
      ]
    ],
    "DropdownConfiguration": [
      [
        "Dropdown",
        "Dropdown Number",
        "Dropdown Name",
        "Object",
        "Values"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xDC-10000",
        "Validation Enabled",
        "xOC-1002 - Object",
        "Yes, No"
      ]
    ],
    "GlobalDropdownConfiguration": [
      [
        "Global Dropdown",
        "Global Dropdown Number",
        "Global Dropdown Name",
        "Value"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xGD-10000",
        "Enabled",
        "Yes, No"
      ]
    ],
    "Spreadsheets": [
      [
        "Spreadsheet",
        "Spreadsheet Number",
        "Spreadsheet Name",
        "Spreadsheet Id",
        "Spreadsheet Url",
        "Folder Path",
        "Notes"
      ],
      [
        "=ARRAYFORMULA(if(not(isblank(B2:B)), if(not(isblank(C2:C)), text(B2:B,\"0000#\") & \" - \" & C2:C, ), ))",
        "xSS-1000",
        "BZQ Core Configuration",
        "${CONFIG_SS_ID}",
        "=ARRAYFORMULA(if(not(isblank(D2:D)),\"https://docs.google.com/spreadsheets/d/\"&D2:D,\"\"))",
        "/",
        "Platform master configuration settings"
      ]
    ]
  };
}
