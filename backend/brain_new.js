const { Ollama } = require("ollama");

const ollama = new Ollama({
    host:"http://localhost:11434"
});


async function think(message){

    const result = await ollama.chat({
        model:"qwen3:4b",
        stream:false,
        messages:[
            {
                role:"user",
                content:message
            }
        ]
    });

    return result.message.content;
}


module.exports = {
    think
};
