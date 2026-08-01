const Database = require("better-sqlite3");


const db = new Database("godan_memory.db");



db.prepare(`
CREATE TABLE IF NOT EXISTS messages(
id INTEGER PRIMARY KEY AUTOINCREMENT,
role TEXT,
content TEXT,
time DATETIME DEFAULT CURRENT_TIMESTAMP
)
`).run();



function saveMessage(role,content){

    db.prepare(
        `
        INSERT INTO messages(role,content)
        VALUES(?,?)
        `
    )
    .run(role,content);

}



function getMessages(){

    return db.prepare(
        `
        SELECT role,content
        FROM messages
        ORDER BY id ASC
        LIMIT 20
        `
    )
    .all();

}



module.exports={
    saveMessage,
    getMessages
};