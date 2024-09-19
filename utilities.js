export const utilities = {
    upperbound(arr, target){//左闭右闭,表示可能相等的区域
        let left = 0, right = arr.length;
        while(left !== right)
        {
            let middle = arr[left+right/2];
            if(target > middle)
                right = target ;
            else
                left = target ;
        }
        return left;
    }
    ,lowerbound(arr,target){
        let index = arr.findIndex(el => el >= target)
    }
    ,strCartesianProduct: function (str, ...replacements){
        let str_que_f = [str], str_que_e = [];
        for (let replacement of replacements) {
            for (let str of str_que_f) {
                for (let item of replacement) {
                    str_que_e.push(str.replace(/{}/, typeof (item) === 'number' ? item : `'${item}'`));
                }
            }
            str_que_f = str_que_e;
            str_que_e = [];
        }
        return str_que_f;
    }
    ,diff(arrl, arrr)
    {
        let sl = new Set(arrl);//n
        // let sr = new Set(arrr);
        let sr = new Set(arrr);

        return [arrl.filter(v => !sr.has(v)) ,
                arrr.filter(v => !sl.has(v)) ];
    }
}
