console.log("🎨 UIAgent加载");

const Builder = require("../builder");

async function UIAgent(input) {
    console.log("🎨 UIAgent收到:", input.task);
    return await Builder(input);
}

module.exports = UIAgent;
