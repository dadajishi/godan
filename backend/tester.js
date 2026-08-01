console.log("🧪 Tester模块加载");

const { chromium } = require("playwright");


async function testPage(filePath){

    console.log("🧪 开始测试:", filePath);


    const browser = await chromium.launch({
        headless:true
    });


    const page = await browser.newPage();


    let errors = [];
    let warnings = [];


    page.on("pageerror", error => {

        errors.push(error.message);

    });


    page.on("console", msg => {

        if(msg.type() === "error"){

            errors.push(
                msg.text()
            );

        }


        if(msg.type() === "warning"){

            warnings.push(
                msg.text()
            );

        }

    });


    try{

        await page.goto(
            "file://" + filePath
        );


        await page.waitForTimeout(2000);


    }catch(e){

        errors.push(e.message);

    }


    await browser.close();


    const result = {

        success: errors.length === 0,

        errors,

        warnings

    };


    console.log(
        "🧪 测试结果:",
        result
    );


    return result;

}


module.exports = testPage;