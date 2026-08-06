console.log("🧠 Memory模块加载");

const fs = require("fs");
const path = require("path");


const file = path.join(
    __dirname,
    "state.json"
);


function read(){

    // 修正: 容错 — 文件损坏/不存在时返回默认状态，不再抛异常拖垮整个服务
    try{
        return JSON.parse(
            fs.readFileSync(file,"utf8")
        );
    }catch(e){
        return {
            status:"unknown",
            errors:[],
            history:[]
        };
    }

}



function write(data){

    fs.writeFileSync(
        file,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );

}



function update(obj){

    const state = read();

    const newState = {
        ...state,
        ...obj
    };


    write(newState);

    return newState;

}



function addHistory(item){

    const state = read();

    state.history.push(item);

    write(state);

}



module.exports={
    read,
    write,
    update,
    addHistory
};