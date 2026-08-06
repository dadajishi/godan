console.log("💻 FrontendAgent加载");

const Builder = require("../builder");

async function FrontendAgent(input) {
    console.log("💻 FrontendAgent收到:", input.task);
    return await Builder(input);
}

module.exports = FrontendAgent;
