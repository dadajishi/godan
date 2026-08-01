

// 🐶 Cursor 搜索补丁

function searchCode(keyword){

    const results=[];


    function scan(dir){

        const files =
        fs.readdirSync(dir);


        for(const file of files){


            if(
                file==="node_modules" ||
                file===".git"
            ){
                continue;
            }


            const full =
            path.join(dir,file);


            const stat =
            fs.statSync(full);



            if(stat.isDirectory()){

                scan(full);

            }
            else{


                try{

                    const text =
                    fs.readFileSync(
                        full,
                        "utf8"
                    );


                    if(
                        text.includes(keyword)
                    ){

                        results.push({

                            file:
                            path.relative(
                                ROOT,
                      full
                            )

                        });

                    }


                }catch(e){}


            }


        }


    }


    scan(ROOT);


    return {

        success:true,

        results

    };


}


module.exports.searchCode = searchCode;

function searchCode(keyword){

    const results=[];


    function scan(dir){

        for(const file of fs.readdirSync(dir)){


            if(
                file==="node_modules" ||
                file===".git"
            ){
                continue;
            }


            const full =
            path.join(dir,file);


            try{

                const stat =
                fs.statSync(full);


                if(stat.isDirectory()){

                    scan(full);

                }
                else{

                    const content =
                    fs.readFileSync(
                        full,
                        "utf8"
                    );


                    if(content.includes(keyword)){

                        results.push({
                            file:path.relative(
                                ROOT,
                                full
                            )
                        });

                    }

                }

            }catch(e){}


        }

    }


    scan(ROOT);


    return {
        success:true,
        results
    };

}


module.exports.searchCode = searchCode;

