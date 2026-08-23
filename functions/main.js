const legacyFunctions = require("./index");
const opponentAnalysisFunctions = require("./opponent-analysis");
const opponentPostAnalysisFunctions = require("./opponent-post-analysis");

module.exports = {
  ...legacyFunctions,
  ...opponentAnalysisFunctions,
  ...opponentPostAnalysisFunctions
};
