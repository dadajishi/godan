console.log("🛡️ OutputGuard加载");


class OutputGuard {


    clean(text=""){


        console.log(
            "🛡️ OutputGuard检查输出"
        );


        let result = text.trim();



        // 去掉markdown包裹

        if(result.startsWith("```")){


            result =
            result
            .replace(/```json/g,"")
            .replace(/```/g,"")
            .trim();


        }




        // 找JSON开始

        const start =
        result.indexOf("{");


        const end =
        result.lastIndexOf("}");



        if(
            start!==-1 &&
            end!==-1
        ){

            result =
            result.substring(
                start,
                end+1
            );

        }




        return result;

    }




    parse(text){


        try{


            const cleaned =
            this.clean(text);



            return JSON.parse(cleaned);



        }catch(error){


            console.log(
                "🛡️ JSON修复失败:",
                error.message
            );


            return null;

        }


    }


}


module.exports =
new OutputGuard();