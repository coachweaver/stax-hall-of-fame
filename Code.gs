// ============================================================
//  $tax Hall of Fame — Apps Script Backend
//  Deploy as: Web App | Execute as: Me | Access: Anyone
// ============================================================

function doGet() {
  var payload = getLeaderboardData();

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}


function getLeaderboardData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = ss.getSheets();
    var sheet = null;
    var mappingSheet = null;

    for (var i = 0; i < sheets.length; i++) {
      var sheetName = sheets[i].getName().toLowerCase();
      if (sheetName.includes("reflections")) sheet = sheets[i];
      if (sheetName.includes("sheet12"))     mappingSheet = sheets[i];
    }

    if (!sheet) {
      return JSON.stringify({ error: "Could not find the Reflections sheet." });
    }

    // ----------------------------------------------------------
    //  Class label map (raw form value → display label)
    // ----------------------------------------------------------
    var classMap = {
      "2A PF 2022-23":                 "2023 2A",
      "4B PF 2022-23":                 "2023 4B",
      "3B PF 2023-24":                 "2024 3B",
      "4A PF 2023-24":                 "2024 4A",
      "4B PF 2023-24":                 "2024 4B",
      "3A PF 2024-25":                 "2025 3A",
      "4A PF 2024-25":                 "2025 4A",
      "4B PF 2024-25":                 "2025 4B",
      "2A MKT 2024-25":                "2025 Marketing",
      "1A PF 2025-26 (Weaver)":        "2026 1A",
      "2A PF 2025-26 (Weaver)":        "2026 2A",
      "4B PF 2025-26 (Weaver)":        "2026 4B",
      "3A PF 2025-26 (Robinson)":      "2026 3A",
      "4A PF 2025-26 (Robinson)":      "2026 4A",
      "2B PF 2025-26 (Robinson)":      "2026 2B"
    };

    // Pull any overrides from Sheet12
    if (mappingSheet) {
      var mapData = mappingSheet.getDataRange().getValues();
      for (var m = 1; m < mapData.length; m++) {
        var rawClass    = String(mapData[m][0]).trim();
        var outputClass = String(mapData[m][1]).trim();
        if (rawClass && outputClass) classMap[rawClass] = outputClass;
      }
    }

    // ----------------------------------------------------------
    //  Custom leaderboard view definitions
    // ----------------------------------------------------------
    var customViews = [
      { name: "BEST OF 2026",
        periods: ["1a pf 2025-26 (weaver)","2a pf 2025-26 (weaver)","4b pf 2025-26 (weaver)",
                  "3a pf 2025-26 (robinson)","4a pf 2025-26 (robinson)","2b pf 2025-26 (robinson)"],
        performer: null },
      { name: "BEST OF 2025",
        periods: ["3a pf 2024-25","4a pf 2024-25","4b pf 2024-25","2a mkt 2024-25"],
        performer: null },
      { name: "BEST OF 2024",
        periods: ["3b pf 2023-24","4a pf 2023-24","4b pf 2023-24"],
        performer: null },
      { name: "BEST OF 2023",
        periods: ["2a pf 2022-23","4b pf 2022-23"],
        performer: null },
      { name: "TOP SAVINGS ACCOUNT",        periods: [], performer: "savings account" },
      { name: "TOP CERTIFICATE OF DEPOSIT", periods: [], performer: "certificate of deposit" },
      { name: "TOP INDEX FUND",             periods: [], performer: "index fund" },
      { name: "TOP INDIVIDUAL STOCKS",      periods: [], performer: "individual stocks" },
      { name: "TOP GOVERNMENT BONDS",       periods: [], performer: "government bonds" },
      { name: "TOP CROP COMMODITY",         periods: [], performer: "crop commodity" },
      { name: "TOP GOLD",                   periods: [], performer: "gold" }
    ];

    // ----------------------------------------------------------
    //  Read sheet, trim phantom blank rows
    // ----------------------------------------------------------
    var rawData = sheet.getDataRange().getValues();
    var actualLastRow = 0;
    for (var r = rawData.length - 1; r >= 0; r--) {
      if (String(rawData[r][0]).trim() !== "" || String(rawData[r][1]).trim() !== "") {
        actualLastRow = r + 1;
        break;
      }
    }

    var data = rawData.slice(0, actualLastRow);
    if (data.length < 2) {
      return JSON.stringify({ error: "The Reflections sheet appears to be empty." });
    }

    // ----------------------------------------------------------
    //  Map column headers → indexes
    // ----------------------------------------------------------
    var headers = data[0].map(function(h) { return String(h).toLowerCase().trim(); });

    var tIdx    = headers.indexOf("timestamp");
    var fIdx    = headers.indexOf("first name");
    var lIdx    = headers.indexOf("last name");
    var cIdx    = headers.indexOf("class period");
    var pIdx    = headers.indexOf("portfolio value");
    var hIdx    = headers.indexOf("your highest performer");

    // Flexible partial matches
    var tiIdx   = headers.findIndex(function(h){ return h.includes("total invest"); });
    var lpIdx   = headers.findIndex(function(h){ return h.includes("lowest performer"); });
    var bmIdx   = headers.findIndex(function(h){ return h.includes("beat the market"); });
    var cnIdx   = headers.findIndex(function(h){ return h.includes("computer"); });
    var teamIdx = headers.findIndex(function(h){ return h.includes("team name"); });
    var expIdx  = headers.findIndex(function(h){ return h.includes("expenses") || h.includes("life event"); });
    var trIdx   = headers.findIndex(function(h){ return h.includes("total return"); });
    // Email column — fetched but NEVER included in the output payload
    // var emailIdx = headers.findIndex(function(h){ return h.includes("email"); });

    if (fIdx === -1 || pIdx === -1) {
      return JSON.stringify({
        error: "Missing required columns. Found: " + headers.join(" | ")
      });
    }

    // ----------------------------------------------------------
    //  Build records array — email is intentionally excluded
    // ----------------------------------------------------------
    var records = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // Skip rows that have no name or no portfolio value
      if (!row[fIdx] || !row[pIdx]) continue;

      var fName = String(row[fIdx] || "").trim();
      var lName = lIdx > -1 ? String(row[lIdx] || "").trim() : "";

      var rawClassPeriod    = cIdx > -1 ? String(row[cIdx] || "Unknown").trim() : "Unknown";
      var mappedClassPeriod = classMap[rawClassPeriod] ? classMap[rawClassPeriod] : rawClassPeriod;

      records.push({
        timestamp:            tIdx    > -1 ? String(row[tIdx]    || "")           : "",
        fullName:             (fName + " " + lName).trim(),
        classPeriod:          mappedClassPeriod,
        rawClassPeriod:       rawClassPeriod,
        portfolioValue:       String(row[pIdx]           || "0"),
        totalInvested:        tiIdx   > -1 ? String(row[tiIdx]   || "N/A")        : "N/A",
        expensesFromLifeEvents: expIdx > -1 ? String(row[expIdx] || "N/A")        : "N/A",
        totalReturn:          trIdx   > -1 ? String(row[trIdx]   || "N/A")        : "N/A",
        highestPerformer:     hIdx    > -1 ? String(row[hIdx]    || "None")       : "None",
        lowestPerformer:      lpIdx   > -1 ? String(row[lpIdx]   || "None")       : "None",
        beatMarket:           bmIdx   > -1 ? String(row[bmIdx]   || "No")         : "No",
        computerNetWorth:     cnIdx   > -1 ? String(row[cnIdx]   || "N/A")        : "N/A",
        teamName:             teamIdx > -1 ? String(row[teamIdx] || "No Team").trim() : "No Team"
        // email intentionally omitted
      });
    }

    return JSON.stringify({
      success:     true,
      records:     records,
      customViews: customViews
    });

  } catch (e) {
    return JSON.stringify({ error: "Backend Error: " + e.toString() });
  }
}
