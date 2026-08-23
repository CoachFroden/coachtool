const legacyFunctions = require("./index");
const opponentAnalysisFunctions = require("./opponent-analysis");

module.exports = {
  ...legacyFunctions,
  ...opponentAnalysisFunctions
};
