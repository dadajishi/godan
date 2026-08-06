console.log("⚙️ BackendAgent加载");

const Builder = require("../builder");

async function BackendAgent(input) {
    console.log("⚙️ BackendAgent收到:", input.task);
    return await Builder(input);
}

module.exports = BackendAgent;
