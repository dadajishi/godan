console.log("🧪 Tester模块加载");

// Web 精简版容错：playwright 缺失时跳过测试（不崩溃）
let chromium = null;
try {
    ({ chromium } = require("playwright"));
} catch (e) {
    console.log("⚠️ playwright 不可用，测试将跳过（Web 精简版）");
}


async function testPage(filePath){

    console.log("🧪 开始测试:", filePath);

    // Web 精简版：无 playwright 时跳过测试
    if (!chromium) {
        return { success: true, skipped: true, errors: [], warnings: [] };
    }


    // 修复: Windows 打包版 playwright 无浏览器二进制时 launch 抛错 → 跳过测试而非崩溃
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
    } catch (e) {
        console.log("⚠️ 浏览器启动失败，测试跳过:", e.message.slice(0, 80));
        return { success: true, skipped: true, errors: [], warnings: [] };
    }


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