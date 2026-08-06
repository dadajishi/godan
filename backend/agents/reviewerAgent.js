console.log("🔍 ReviewerAgent加载");

const Reviewer = require("../reviewer");

async function ReviewerAgent(input) {
    console.log("🔍 ReviewerAgent收到");

    return await Reviewer(input);
}

module.exports = ReviewerAgent;
