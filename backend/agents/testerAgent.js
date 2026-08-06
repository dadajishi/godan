console.log("🧪 TesterAgent加载");

async function TesterAgent(input) {
    console.log("🧪 TesterAgent收到:", input.task);
    return input;
}

module.exports = TesterAgent;
